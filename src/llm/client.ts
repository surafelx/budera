import type { LlmConfig } from "./config";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ResponseFormat =
  | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } }
  | { type: "json_object" };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  responseFormat?: ResponseFormat;
  maxTokens?: number;
  temperature?: number;
};

export type ChatResponse = {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type LlmErrorKind = "auth" | "rate_limit" | "bad_request" | "not_found" | "provider" | "network" | "timeout" | "invalid_response";

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: LlmErrorKind,
    public status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmClient {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class OpenAICompatibleClient implements LlmClient {
  constructor(
    private config: Pick<LlmConfig, "baseUrl" | "apiKey" | "headers" | "timeoutMs">,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = { model: request.model, messages: request.messages };
    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = "auto";
    }
    if (request.responseFormat) body.response_format = request.responseFormat;
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...this.config.headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new LlmError("The AI provider took too long to respond.", "timeout");
      }
      throw new LlmError("Couldn't reach the AI provider.", "network");
    }

    const text = await res.text();
    if (!res.ok) {
      const detail = providerMessage(text);
      const kind: LlmErrorKind =
        res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limit" : res.status === 404 ? "not_found" : res.status >= 500 ? "provider" : "bad_request";
      throw new LlmError(detail || `The AI provider returned ${res.status}.`, kind, res.status);
    }

    let data: {
      model?: string;
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      data = JSON.parse(text);
    } catch {
      throw new LlmError("The AI provider sent a response that isn't JSON.", "invalid_response");
    }
    const choice = data.choices?.[0];
    if (!choice?.message) throw new LlmError("The AI provider sent an empty response.", "invalid_response");

    return {
      content: typeof choice.message.content === "string" ? choice.message.content : null,
      toolCalls: (choice.message.tool_calls ?? []).filter((c) => c?.type === "function" && c.function?.name),
      finishReason: choice.finish_reason ?? "stop",
      model: data.model ?? request.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }
}

function providerMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const msg = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
    return msg ? String(msg).slice(0, 300) : "";
  } catch {
    return text.slice(0, 200);
  }
}
