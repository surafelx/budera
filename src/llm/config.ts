/**
 * Budera talks to any OpenAI-compatible chat completions API: OpenAI, OpenRouter, Groq, Together,
 * DeepSeek, Mistral, or a self-hosted Ollama / vLLM server. Everything is configured by environment.
 */
export type StructuredMode = "json_schema" | "json_object";

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  researchModel: string;
  structuredMode: StructuredMode;
  headers: Record<string, string>;
  timeoutMs: number;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const model = env.LLM_MODEL?.trim();
  if (!model) {
    throw new ConfigError("No AI model is configured. Set LLM_MODEL (and LLM_BASE_URL and LLM_API_KEY for your provider) on the server, then restart.");
  }
  const baseUrl = (env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  let headers: Record<string, string> = {};
  if (env.LLM_EXTRA_HEADERS?.trim()) {
    try {
      const parsed = JSON.parse(env.LLM_EXTRA_HEADERS) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        headers = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      }
    } catch {
      throw new ConfigError("LLM_EXTRA_HEADERS must be a JSON object of header names to values.");
    }
  }
  return {
    baseUrl,
    apiKey: env.LLM_API_KEY?.trim() ?? "",
    model,
    researchModel: env.LLM_RESEARCH_MODEL?.trim() || model,
    structuredMode: env.LLM_STRUCTURED_OUTPUT === "json_object" ? "json_object" : "json_schema",
    headers,
    timeoutMs: Number(env.LLM_TIMEOUT_MS) > 0 ? Number(env.LLM_TIMEOUT_MS) : 180_000,
  };
}

/** Safe summary for the settings page: never includes keys. */
export function describeSetup(env: NodeJS.ProcessEnv = process.env) {
  let host = "";
  try {
    host = new URL(env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").host;
  } catch {
    host = "invalid LLM_BASE_URL";
  }
  const search = (env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  return {
    modelConfigured: Boolean(env.LLM_MODEL?.trim()),
    model: env.LLM_MODEL?.trim() ?? "",
    researchModel: env.LLM_RESEARCH_MODEL?.trim() ?? "",
    providerHost: host,
    hasApiKey: Boolean(env.LLM_API_KEY?.trim()),
    searchProvider: ["tavily", "brave", "serper"].includes(search) && env.SEARCH_API_KEY?.trim() ? search : "",
    schedulingEnabled: Boolean(env.CRON_SECRET?.trim()),
  };
}
