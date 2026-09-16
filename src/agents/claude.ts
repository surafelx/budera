import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Company } from "@/db/schema";
import { AGENTS, type AgentId } from "./registry";
import { AGENT_SCHEMAS, normalizeOutput, type AgentOutput } from "./schemas";
import { RESEARCH_BRIEF, companyBrief, systemPrompt, todayLine } from "./prompts";

export const MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_RESEARCH_CONTINUATIONS = 4;

export type Source = { url: string; title: string };

export type AgentResult = {
  output: AgentOutput;
  sources: Source[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** What the runner needs from a model. The real implementation calls Claude; tests pass a fake. */
export interface AgentModel {
  run(agent: AgentId, company: Company): Promise<AgentResult>;
}

/** A failure we can show to the owner as-is. */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "The Claude API key was rejected. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This Claude API key doesn't have access to the model. Check your Anthropic account.";
  if (error instanceof Anthropic.RateLimitError) return "Claude is rate-limiting requests right now. Try this agent again in a minute.";
  if (error instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check the server's internet connection.";
  if (error instanceof Anthropic.APIError) return `The Claude API returned an error (${error.status ?? "unknown"}). Try again shortly.`;
  if (error instanceof Error && /api.?key|apiKey|authentication/i.test(error.message)) {
    return "No Claude API key is configured. Add ANTHROPIC_API_KEY to the server environment and restart.";
  }
  return "Something went wrong while running this agent. Try again.";
}

export class ClaudeAgentModel implements AgentModel {
  private client: Anthropic;

  constructor(client?: Anthropic) {
    if (!client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new AgentError("No Claude API key is configured. Add ANTHROPIC_API_KEY to the server environment and restart.");
    }
    this.client = client ?? new Anthropic();
  }

  async run(agent: AgentId, company: Company): Promise<AgentResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    let researchNotes = "";
    let sources: Source[] = [];

    if (AGENTS[agent].usesWeb) {
      const research = await this.research(agent, company);
      researchNotes = research.notes;
      sources = research.sources;
      inputTokens += research.inputTokens;
      outputTokens += research.outputTokens;
    }

    const sourceList = sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`).join("\n");
    const content = [
      todayLine(),
      companyBrief(company),
      researchNotes && `<research_notes>\n${researchNotes}\n</research_notes>`,
      sources.length > 0 && `<research_sources>\n${sourceList}\n</research_sources>`,
      AGENTS[agent].usesWeb && sources.length === 0
        ? "Web research returned no usable sources. Say so in the summary, keep evidence-based sections short, and leave source_urls empty."
        : "",
      "Write the report for this company.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(AGENT_SCHEMAS[agent]) },
      system: systemPrompt(agent),
      messages: [{ role: "user", content }],
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      throw new AgentError("Claude declined to write this report. Review the company profile for anything that could be misread, then try again.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AgentError("The report ran longer than allowed and was cut off. Try again.");
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      throw new AgentError("Claude's answer didn't match the expected report format. Try again.");
    }

    const allowed = sources.length > 0 ? new Set(sources.map((s) => s.url)) : AGENTS[agent].usesWeb ? new Set<string>() : undefined;
    return {
      output: normalizeOutput(agent, parsed as never, allowed),
      sources,
      model: response.model,
      inputTokens,
      outputTokens,
    };
  }

  /** Live web research with Claude's server-side web search. Returns notes and the URLs actually retrieved. */
  private async research(agent: AgentId, company: Company) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: `${todayLine()}\n\n${companyBrief(company)}\n\n${RESEARCH_BRIEF[agent]}` },
    ];
    const found = new Map<string, Source>();
    let inputTokens = 0;
    let outputTokens = 0;
    let notes = "";

    for (let turn = 0; turn <= MAX_RESEARCH_CONTINUATIONS; turn++) {
      const response = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: systemPrompt(agent),
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
        messages,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      for (const block of response.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const result of block.content) {
            if (result.url && !found.has(result.url)) found.set(result.url, { url: result.url, title: result.title || result.url });
          }
        }
        if (block.type === "text") notes += block.text;
      }

      if (response.stop_reason === "refusal") {
        throw new AgentError("Claude declined the web research for this report. Review the company profile, then try again.");
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      break;
    }

    return { notes: notes.trim(), sources: [...found.values()].slice(0, 40), inputTokens, outputTokens };
  }
}
