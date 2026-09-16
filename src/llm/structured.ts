import { z } from "zod";
import { LlmError, type ChatMessage, type LlmClient } from "./client";
import type { StructuredMode } from "./config";

/**
 * Convert a Zod schema into the strict JSON Schema dialect most OpenAI-compatible providers accept:
 * every object closed (additionalProperties: false) and every property required.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
    }
    for (const v of Object.values(n)) visit(v);
  };
  visit(json);
  return json;
}

/** Pull a JSON object out of a model reply, tolerating code fences or a sentence around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("No JSON object found");
  }
}

export class StructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export type StructuredResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number };

/**
 * Ask for JSON matching `schema`. Uses json_schema response format when the provider supports it,
 * falls back to json_object with the schema in the prompt, and gives the model one chance to repair
 * output that fails validation.
 */
export async function generateStructured<T>(
  client: LlmClient,
  opts: { model: string; system: string; user: string; schema: z.ZodType<T>; name: string; mode: StructuredMode; maxTokens?: number },
): Promise<StructuredResult<T>> {
  const jsonSchema = toStrictJsonSchema(opts.schema);
  let mode = opts.mode;
  let inputTokens = 0;
  let outputTokens = 0;
  let model = opts.model;

  const schemaHint = `Reply with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
  const messages: ChatMessage[] = [
    { role: "system", content: `${opts.system}\n\n${schemaHint}` },
    { role: "user", content: opts.user },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    let reply;
    try {
      reply = await client.chat({
        model: opts.model,
        messages,
        maxTokens: opts.maxTokens ?? 8000,
        responseFormat:
          mode === "json_schema" ? { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: jsonSchema } } : { type: "json_object" },
      });
    } catch (error) {
      // Providers without strict schema support usually reject the request outright; retry in JSON mode.
      if (mode === "json_schema" && error instanceof LlmError && error.kind === "bad_request") {
        mode = "json_object";
        continue;
      }
      throw error;
    }

    inputTokens += reply.inputTokens;
    outputTokens += reply.outputTokens;
    model = reply.model;

    if (reply.finishReason === "length") {
      throw new StructuredOutputError("The report ran longer than the model's output limit and was cut off.");
    }

    const content = reply.content ?? "";
    let problem: string;
    try {
      const parsed = opts.schema.safeParse(extractJson(content));
      if (parsed.success) return { data: parsed.data, model, inputTokens, outputTokens };
      problem = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    } catch {
      problem = "the reply was not valid JSON";
    }

    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: `That JSON doesn't match the schema (${problem}). Reply again with the complete corrected JSON object only.` });
  }

  throw new StructuredOutputError("The model's answer didn't match the report format after retrying.");
}
