import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Company } from "@/db/schema";
import { LlmAgentModel, customSpec, friendlyError } from "@/agents/engine";
import { LlmError, OpenAICompatibleClient, type ChatRequest, type ChatResponse, type LlmClient } from "@/llm/client";
import { ConfigError, readLlmConfig, type LlmConfig } from "@/llm/config";
import { extractJson, generateStructured, toStrictJsonSchema } from "@/llm/structured";
import type { SearchProvider } from "@/tools/search";

const config: LlmConfig = { baseUrl: "https://llm.test/v1", apiKey: "k", model: "writer", researchModel: "researcher", structuredMode: "json_schema", headers: {}, timeoutMs: 5000 };

const reply = (over: Partial<ChatResponse>): ChatResponse => ({ content: null, toolCalls: [], finishReason: "stop", model: "m", inputTokens: 10, outputTokens: 5, ...over });

/** A scripted model: each call returns the next response (or throws it). */
class ScriptedClient implements LlmClient {
  requests: ChatRequest[] = [];
  constructor(private script: (ChatResponse | Error)[]) {}
  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(structuredClone(request));
    const next = this.script.shift();
    if (!next) throw new Error("Script exhausted");
    if (next instanceof Error) throw next;
    return next;
  }
}

const company = {
  id: "c", ownerId: "o", name: "Kaffa", website: "", industry: "Coffee", country: "Ethiopia", stage: "Early revenue", teamSize: "2–5",
  revenueBand: "Under $10k / month", offering: "Roasted coffee", businessModel: "", targetCustomers: "Cafes", competitors: [], goals: "Grow",
  challenges: "", createdAt: new Date(), updatedAt: new Date(),
} satisfies Company;

const customAgent = {
  id: "11111111-1111-4111-8111-111111111111", companyId: "c", name: "Pricing Analyst", role: "Reviews pricing", instructions: "Compare prices.",
  tools: ["web_search", "read_page"], scoring: false, scoreLabel: "", schedule: "manual", model: "", lastScheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe("structured output", () => {
  it("closes every object and requires every property", () => {
    const schema = toStrictJsonSchema(z.object({ a: z.string(), nested: z.array(z.object({ b: z.number() })) }));
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["a", "nested"]);
    const item = (schema.properties as { nested: { items: Record<string, unknown> } }).nested.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["b"]);
  });

  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":2} Hope that helps')).toEqual({ a: 2 });
  });

  it("falls back to JSON mode when the provider rejects json_schema, and repairs invalid output", async () => {
    const client = new ScriptedClient([
      new LlmError("response_format json_schema not supported", "bad_request", 400),
      reply({ content: '{"name": 42}' }),
      reply({ content: '{"name": "Kaffa"}' }),
    ]);
    const result = await generateStructured(client, { model: "m", system: "s", user: "u", schema: z.object({ name: z.string() }), name: "r", mode: "json_schema" });
    expect(result.data).toEqual({ name: "Kaffa" });
    expect(client.requests[0].responseFormat?.type).toBe("json_schema");
    expect(client.requests[1].responseFormat?.type).toBe("json_object");
    expect(client.requests[2].messages.at(-1)?.content).toMatch(/doesn't match the schema/);
  });

  it("doesn't retry auth errors", async () => {
    const client = new ScriptedClient([new LlmError("bad key", "auth", 401)]);
    await expect(generateStructured(client, { model: "m", system: "s", user: "u", schema: z.object({}), name: "r", mode: "json_schema" })).rejects.toThrow("bad key");
    expect(friendlyError(new LlmError("bad key", "auth", 401))).toMatch(/LLM_API_KEY/);
  });
});

describe("research loop", () => {
  it("runs tool calls, feeds results back, and keeps only sources the tools returned", async () => {
    const search: SearchProvider = {
      name: "tavily",
      search: async (q) => [{ title: `Result for ${q}`, url: "https://news.example/coffee", snippet: "Prices up 12%" }],
    };
    const client = new ScriptedClient([
      reply({ toolCalls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: '{"query":"coffee prices addis"}' } }] }),
      reply({ toolCalls: [{ id: "call_2", type: "function", function: { name: "read_page", arguments: '{"url":"https://news.example/coffee"}' } }] }),
      reply({ content: "Prices rose 12% (https://news.example/coffee)" }),
      reply({
        content: JSON.stringify({
          summary: "Raise prices",
          findings: [{ title: "Market prices up", detail: "12%", importance: "high", source_urls: ["https://news.example/coffee", "https://invented.example"] }],
          tasks: [{ title: "Raise prices", detail: "d", priority: "high", due_in_days: 99 }],
        }),
      }),
    ]);
    const model = new LlmAgentModel({
      client,
      config,
      tools: { search, readPage: async (url) => ({ url, title: "Coffee news", text: "Prices rose 12%." }) },
    });

    const result = await model.run(customSpec(customAgent), company);
    const output = result.output as { findings: { source_urls: string[] }[]; tasks: { due_in_days: number }[] };

    expect(client.requests[0].model).toBe("researcher");
    expect(client.requests[0].tools?.map((t) => t.function.name)).toEqual(["web_search", "read_page"]);
    expect(client.requests[1].messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(client.requests[3].model).toBe("writer");
    expect(client.requests[3].messages[1].content).toContain("<research_notes>");
    expect(output.findings[0].source_urls).toEqual(["https://news.example/coffee"]);
    expect(output.tasks[0].due_in_days).toBe(30);
    expect(result.sources.map((s) => s.url)).toEqual(["https://news.example/coffee"]);
  });

  it("skips research and says so when no search provider is configured", async () => {
    const client = new ScriptedClient([reply({ content: JSON.stringify({ summary: "s", findings: [], tasks: [] }) })]);
    const model = new LlmAgentModel({ client, config, tools: { search: null } });
    await model.run({ ...customSpec(customAgent), tools: ["web_search"] }, company);
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0].messages[1].content).toMatch(/Web research isn't available/);
  });
});

describe("configuration and HTTP client", () => {
  it("requires a model and parses extra headers", () => {
    expect(() => readLlmConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    const cfg = readLlmConfig({ LLM_MODEL: "openai/gpt-x", LLM_BASE_URL: "https://openrouter.ai/api/v1/", LLM_EXTRA_HEADERS: '{"X-Title":"Budera"}' } as unknown as NodeJS.ProcessEnv);
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(cfg.researchModel).toBe("openai/gpt-x");
    expect(cfg.headers).toEqual({ "X-Title": "Budera" });
  });

  it("sends an OpenAI-compatible request and maps errors", async () => {
    let seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined;
    const client = new OpenAICompatibleClient(config, async (url, init) => {
      seen = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ model: "served", choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
    });
    const res = await client.chat({ model: "m", messages: [{ role: "user", content: "hello" }] });
    expect(seen?.url).toBe("https://llm.test/v1/chat/completions");
    expect(seen?.headers.Authorization).toBe("Bearer k");
    expect(seen?.body.model).toBe("m");
    expect(res).toMatchObject({ content: "hi", model: "served", inputTokens: 3, outputTokens: 2 });

    const limited = new OpenAICompatibleClient(config, async () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 }));
    await expect(limited.chat({ model: "m", messages: [] })).rejects.toMatchObject({ kind: "rate_limit", message: "slow down" });
  });
});
