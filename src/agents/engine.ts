import type { z } from "zod";
import type { Company, CustomAgent } from "@/db/schema";
import { LlmError, OpenAICompatibleClient, type ChatMessage, type LlmClient } from "@/llm/client";
import { ConfigError, readLlmConfig, type LlmConfig } from "@/llm/config";
import { StructuredOutputError, generateStructured } from "@/llm/structured";
import { SERVICES } from "@/connections/catalog";
import { TOOL_DEFINITIONS, TOOL_IDS, TOOL_INFO, availableTools, executeTool, type Source, type ToolContext, type ToolId } from "@/tools";
import { searchProviderFromEnv } from "@/tools/search";
import { AGENTS, customKey, type AgentId } from "./registry";
import { RESEARCH_BRIEF, RESEARCH_PHASE, ROLE, SHARED, companyBrief, customSystemPrompt, todayLine } from "./prompts";
import { AGENT_SCHEMAS, customPlainSchema, customScoredSchema, normalizeCustomOutput, normalizeOutput, type CustomOutput } from "./schemas";

export type { Source } from "@/tools";

/** Everything the engine needs to run one agent, whether built in or built by an owner. */
export type AgentSpec = {
  key: string;
  name: string;
  system: string;
  schema: z.ZodType;
  tools: ToolId[];
  researchBrief: string;
  model?: string;
  finalize: (output: unknown, allowedUrls: Set<string>) => unknown;
};

export function builtInSpec(id: AgentId): AgentSpec {
  return {
    key: id,
    name: AGENTS[id].name,
    system: `${SHARED}\n\n${ROLE[id]}`,
    schema: AGENT_SCHEMAS[id],
    tools: AGENTS[id].tools,
    researchBrief: RESEARCH_BRIEF[id] ?? "Research what you need to write this report.",
    finalize: (output, allowed) => normalizeOutput(id, output as never, allowed),
  };
}

export function customSpec(agent: CustomAgent): AgentSpec {
  return {
    key: customKey(agent.id),
    name: agent.name,
    system: customSystemPrompt(agent),
    schema: agent.scoring ? customScoredSchema : customPlainSchema,
    tools: agent.tools.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t)),
    researchBrief: `Research what you need to do this job well: ${agent.role}`,
    model: agent.model || undefined,
    finalize: (output, allowed) => normalizeCustomOutput(output as CustomOutput, allowed),
  };
}

export type AgentResult = { output: unknown; sources: Source[]; model: string; inputTokens: number; outputTokens: number };

export interface AgentModel {
  run(spec: AgentSpec, company: Company): Promise<AgentResult>;
}

/** A failure message that is safe and useful to show the owner. */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof AgentError || error instanceof ConfigError || error instanceof StructuredOutputError) return error.message;
  if (error instanceof LlmError) {
    switch (error.kind) {
      case "auth":
        return "The AI provider rejected the API key. Check the AI model connection (or LLM_API_KEY on the server).";
      case "rate_limit":
        return "The AI provider is rate-limiting requests. Try this agent again in a minute.";
      case "not_found":
        return "The AI provider doesn't recognise this model. Check the model name in Connections, or the agent's model setting.";
      case "bad_request":
        return `The AI provider rejected the request: ${error.message}`;
      case "timeout":
        return "The AI provider took too long to respond. Try again.";
      case "network":
        return "Couldn't reach the AI provider. Check the base URL in Connections (or LLM_BASE_URL on the server).";
      default:
        return "The AI provider had a problem. Try again shortly.";
    }
  }
  return "Something went wrong while running this agent. Try again.";
}

/** Tells the model which of its tools weren't connected, so the report can say what would sharpen it. */
export function missingToolsNote(wanted: readonly ToolId[], usable: readonly ToolId[]): string {
  const missing = wanted.filter((t) => !usable.includes(t) && TOOL_INFO[t].service);
  if (missing.length === 0) return "";
  const names = [...new Set(missing.map((t) => SERVICES[TOOL_INFO[t].service!].name))];
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `These sources aren't connected for this company, so you couldn't use them: ${list}. Work from what you have, and mention in the summary that connecting ${list} would make this report more precise.`;
}

const MAX_RESEARCH_STEPS = 8;

export class LlmAgentModel implements AgentModel {
  private client: LlmClient;
  private config: LlmConfig;
  private tools: ToolContext;

  constructor(deps: { client?: LlmClient; config?: LlmConfig; tools?: ToolContext } = {}) {
    this.config = deps.config ?? readLlmConfig();
    this.client = deps.client ?? new OpenAICompatibleClient(this.config);
    this.tools = deps.tools ?? { search: searchProviderFromEnv() };
  }

  async run(spec: AgentSpec, company: Company): Promise<AgentResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    let notes = "";
    let researchNote = "";
    const sources = new Map<string, Source>();

    if (spec.tools.length > 0) {
      const usable = availableTools(spec.tools, this.tools);
      researchNote = missingToolsNote(spec.tools, usable);
      // read_page on its own can't find anything to read, so it doesn't justify a research phase.
      if (usable.some((t) => t !== "read_page")) {
        const research = await this.research(spec, company, usable, sources);
        notes = research.notes;
        inputTokens += research.inputTokens;
        outputTokens += research.outputTokens;
      }
    }

    const sourceList = [...sources.values()].map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`).join("\n");
    const user = [
      todayLine(),
      companyBrief(company),
      notes && `<research_notes>\n${notes}\n</research_notes>`,
      sources.size > 0 && `<research_sources>\n${sourceList}\n</research_sources>`,
      researchNote,
      "Write the report for this company.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await generateStructured(this.client, {
      model: spec.model ?? this.config.model,
      system: spec.system,
      user,
      schema: spec.schema,
      name: "report",
      mode: this.config.structuredMode,
    });

    const allowed = new Set(sources.keys());
    return {
      output: spec.finalize(result.data, allowed),
      sources: [...sources.values()].slice(0, 40),
      model: result.model,
      inputTokens: inputTokens + result.inputTokens,
      outputTokens: outputTokens + result.outputTokens,
    };
  }

  /** Budera's own tool loop: the model calls tools, Budera runs them and feeds back results until the model writes notes. */
  private async research(spec: AgentSpec, company: Company, tools: ToolId[], sources: Map<string, Source>) {
    const messages: ChatMessage[] = [
      { role: "system", content: `${spec.system}\n\n${RESEARCH_PHASE}` },
      { role: "user", content: `${todayLine()}\n\n${companyBrief(company)}\n\n${spec.researchBrief}` },
    ];
    const definitions = tools.map((t) => TOOL_DEFINITIONS[t]);
    let inputTokens = 0;
    let outputTokens = 0;
    const model = spec.model ?? this.config.researchModel;

    for (let step = 0; step < MAX_RESEARCH_STEPS; step++) {
      const reply = await this.client.chat({ model, messages, tools: definitions, maxTokens: 4000 });
      inputTokens += reply.inputTokens;
      outputTokens += reply.outputTokens;

      if (reply.toolCalls.length === 0) {
        return { notes: (reply.content ?? "").trim(), inputTokens, outputTokens };
      }

      messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
      const results = await Promise.all(reply.toolCalls.slice(0, 4).map((call) => executeTool(call.function.name, call.function.arguments, this.tools)));
      reply.toolCalls.forEach((call, i) => {
        const r = results[i] ?? { content: "Error: skipped, too many tool calls in one step.", sources: [] };
        for (const s of r.sources) if (!sources.has(s.url)) sources.set(s.url, s);
        messages.push({ role: "tool", tool_call_id: call.id, content: r.content.slice(0, 14_000) });
      });
    }

    // Out of research steps: ask for notes without offering tools.
    messages.push({ role: "user", content: "Stop researching now and write your research notes from what you have." });
    const final = await this.client.chat({ model, messages, maxTokens: 4000 });
    return { notes: (final.content ?? "").trim(), inputTokens: inputTokens + final.inputTokens, outputTokens: outputTokens + final.outputTokens };
  }
}
