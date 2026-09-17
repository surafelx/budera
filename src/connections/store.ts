import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { connections, type Connection } from "@/db/schema";
import { OpenAICompatibleClient } from "@/llm/client";
import { ConfigError, readLlmConfig, type LlmConfig, type StructuredMode } from "@/llm/config";
import { decryptJson, encryptJson, secretHint } from "@/lib/crypto";
import { availableTools, TOOL_IDS, type ToolContext, type ToolId } from "@/tools";
import { assertPublicUrl } from "@/tools/read-page";
import { searchProvider, searchProviderFromEnv, ToolError } from "@/tools/search";
import { SERVICES, SERVICE_IDS, type ConnectionView, type ServiceId } from "./catalog";
import { analyticsSource, parseServiceAccount, shopifySource, SHOPIFY_DOMAIN, stripeSource, type DataSource, type FetchLike } from "./providers";

export const isServiceId = (v: string): v is ServiceId => (SERVICE_IDS as readonly string[]).includes(v);

export function toView(row: Connection): ConnectionView {
  return {
    service: row.service as ServiceId,
    config: row.config,
    secretHints: row.secretHints,
    status: row.status as ConnectionView["status"],
    statusMessage: row.statusMessage,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

export async function listConnections(db: Db, companyId: string): Promise<ConnectionView[]> {
  const rows = await db.select().from(connections).where(eq(connections.companyId, companyId));
  return rows.filter((r) => isServiceId(r.service)).map(toView);
}

/* ---------------- Validation ---------------- */

type Input = { config?: Record<string, unknown>; secrets?: Record<string, unknown> };
type Validated = { ok: true; config: Record<string, string>; secrets: Record<string, string> } | { ok: false; fields: Record<string, string> };

const MODEL_NAME = /^[A-Za-z0-9._:/@-]{1,120}$/;

/** Checks an owner's input against the service's fields. Blank secrets mean "keep the saved one". */
export function validateConnection(service: ServiceId, input: Input, savedSecrets: readonly string[] = []): Validated {
  const def = SERVICES[service];
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const fields: Record<string, string> = {};

  for (const f of def.fields) {
    const isSecret = f.kind === "secret" || f.kind === "secret_json";
    const raw = (isSecret ? input.secrets : input.config)?.[f.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    const max = f.kind === "secret_json" ? 20_000 : isSecret ? 4_000 : 300;

    if (value.length > max) {
      fields[f.key] = `Keep ${f.label.toLowerCase()} under ${max.toLocaleString()} characters.`;
      continue;
    }
    if (isSecret) {
      if (value) secrets[f.key] = value;
      else if (f.required && !savedSecrets.includes(f.key)) fields[f.key] = `Paste the ${f.label.toLowerCase()}.`;
      continue;
    }
    if (!value) {
      if (f.kind === "select" && f.options?.length) config[f.key] = f.options[0].value;
      else if (f.required) fields[f.key] = `Add the ${f.label.toLowerCase()}.`;
      else config[f.key] = "";
      continue;
    }
    if (f.kind === "select" && !f.options?.some((o) => o.value === value)) {
      fields[f.key] = `Choose a ${f.label.toLowerCase()} from the list.`;
      continue;
    }
    if (f.kind === "url") {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
        config[f.key] = value.replace(/\/+$/, "");
      } catch {
        fields[f.key] = "Enter a full URL starting with https://";
      }
      continue;
    }
    config[f.key] = value;
  }

  if (service === "ai_model") {
    if (config.model && !MODEL_NAME.test(config.model)) fields.model = "Model names can only use letters, numbers and . _ : / @ -";
    if (config.researchModel && !MODEL_NAME.test(config.researchModel)) fields.researchModel = "Model names can only use letters, numbers and . _ : / @ -";
  }
  if (service === "stripe" && secrets.secretKey && !/^(sk|rk)_(live|test)_[A-Za-z0-9_]{8,}$/.test(secrets.secretKey)) {
    fields.secretKey = "Stripe keys start with rk_live_, rk_test_, sk_live_ or sk_test_.";
  }
  if (service === "shopify" && config.shopDomain !== undefined) {
    const domain = config.shopDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (SHOPIFY_DOMAIN.test(domain)) config.shopDomain = domain;
    else fields.shopDomain = "Use your store's myshopify.com domain, like your-store.myshopify.com.";
  }
  if (service === "google_analytics") {
    if (config.propertyId && !/^\d{5,15}$/.test(config.propertyId)) fields.propertyId = "The property ID is a number, like 123456789.";
    if (secrets.serviceAccountJson) {
      try {
        parseServiceAccount(secrets.serviceAccountJson);
      } catch (e) {
        fields.serviceAccountJson = e instanceof ToolError ? e.message : "That key isn't valid.";
      }
    }
  }

  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, config, secrets };
}

/**
 * Hosted deployments only let companies point the AI model at public HTTPS hosts, so a saved base URL can't be used
 * to reach the server's private network. Local development allows http://localhost for Ollama and similar.
 */
export async function assertModelUrl(baseUrl: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const hosted = env.NODE_ENV === "production" && env.ALLOW_PRIVATE_MODEL_URLS !== "true";
  if (!hosted) return;
  if (!baseUrl.startsWith("https://")) throw new ConfigError("The AI model base URL must use https://");
  try {
    await assertPublicUrl(baseUrl);
  } catch {
    throw new ConfigError("The AI model base URL must be a public address.");
  }
}

function readSecrets(row: Pick<Connection, "secrets"> | undefined, env?: NodeJS.ProcessEnv): Record<string, string> {
  if (!row?.secrets) return {};
  return decryptJson(row.secrets, env);
}

/** Create or update a company's connection. Secrets are merged with what's saved, encrypted, and never returned. */
export async function saveConnection(
  db: Db,
  companyId: string,
  service: ServiceId,
  input: Input,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true; view: ConnectionView } | { ok: false; fields: Record<string, string>; error?: string }> {
  const [existing] = await db.select().from(connections).where(and(eq(connections.companyId, companyId), eq(connections.service, service))).limit(1);
  let saved: Record<string, string> = {};
  try {
    saved = existing?.status === "demo" ? {} : readSecrets(existing, env);
  } catch {
    saved = {};
  }

  const result = validateConnection(service, input, Object.keys(saved));
  if (!result.ok) return result;
  if (service === "ai_model") {
    try {
      await assertModelUrl(result.config.baseUrl, env);
    } catch (e) {
      return { ok: false, fields: { baseUrl: (e as Error).message } };
    }
  }

  const secrets = { ...saved, ...result.secrets };
  const secretKeys = SERVICES[service].fields.filter((f) => f.kind === "secret" || f.kind === "secret_json").map((f) => f.key);
  for (const key of Object.keys(secrets)) if (!secretKeys.includes(key)) delete secrets[key];
  const values = {
    config: result.config,
    secrets: Object.keys(secrets).length ? encryptJson(secrets, env) : null,
    secretHints: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, secretHint(v)])),
    status: "untested",
    statusMessage: "",
    checkedAt: null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(connections)
    .values({ companyId, service, ...values })
    .onConflictDoUpdate({ target: [connections.companyId, connections.service], set: values })
    .returning();
  return { ok: true, view: toView(row) };
}

export async function deleteConnection(db: Db, companyId: string, service: ServiceId): Promise<boolean> {
  const rows = await db.delete(connections).where(and(eq(connections.companyId, companyId), eq(connections.service, service))).returning({ id: connections.id });
  return rows.length > 0;
}

/* ---------------- Runtime ---------------- */

/** Company-provided URLs must never be followed through redirects. */
const noRedirects =
  (fetchImpl: FetchLike): FetchLike =>
  (url, init) =>
    fetchImpl(url, { ...init, redirect: "error" });

function llmFromConnection(row: Connection, env?: NodeJS.ProcessEnv): LlmConfig {
  const secrets = readSecrets(row, env);
  const model = row.config.model;
  if (!model) throw new ConfigError("The AI model connection has no model name. Add one on the Connections page.");
  return {
    baseUrl: (row.config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: secrets.apiKey ?? "",
    model,
    researchModel: row.config.researchModel || model,
    structuredMode: (row.config.structuredMode === "json_object" ? "json_object" : "json_schema") as StructuredMode,
    headers: {},
    timeoutMs: 180_000,
  };
}

function dataSourceFor(row: Connection, env: NodeJS.ProcessEnv | undefined, fetchImpl: FetchLike): DataSource {
  const s = readSecrets(row, env);
  if (row.service === "stripe") return stripeSource(s.secretKey ?? "", fetchImpl);
  if (row.service === "shopify") return shopifySource(row.config.shopDomain ?? "", s.accessToken ?? "", fetchImpl);
  if (row.service === "google_analytics") return analyticsSource(row.config.propertyId ?? "", s.serviceAccountJson ?? "", fetchImpl);
  throw new Error(`Not a data service: ${row.service}`);
}

const DATA_TOOLS = { stripe: "stripe_revenue", shopify: "shopify_sales", google_analytics: "analytics_traffic" } as const;

export type Runtime = {
  /** The model settings to run with; throws a ConfigError that explains what to connect when there are none. */
  llm(): LlmConfig;
  llmSource: "company" | "server" | null;
  searchSource: "company" | "server" | null;
  tools: ToolContext;
  fetch: FetchLike;
  /** Tools that can run right now, for showing what's connected. */
  connectedTools: ToolId[];
};

/** What this company's agents can use: its own connections first, then the server's environment variables. */
export async function loadRuntime(db: Db, companyId: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): Promise<Runtime> {
  const rows = (await db.select().from(connections).where(eq(connections.companyId, companyId))).filter((r) => r.status !== "demo");
  const byService = new Map(rows.map((r) => [r.service, r]));

  const modelRow = byService.get("ai_model");
  const llmSource = modelRow ? "company" : env.LLM_MODEL?.trim() ? "server" : null;
  const llm = (): LlmConfig => {
    if (modelRow) return llmFromConnection(modelRow, env);
    if (llmSource === "server") return readLlmConfig(env);
    throw new ConfigError("No AI model is connected. Connect one on the Connections page, or set LLM_MODEL on the server.");
  };

  let search = null;
  let searchSource: Runtime["searchSource"] = null;
  const searchRow = byService.get("web_search");
  if (searchRow) {
    try {
      search = searchProvider(searchRow.config.provider ?? "", readSecrets(searchRow, env).apiKey ?? "", fetchImpl);
      searchSource = search ? "company" : null;
    } catch {
      search = null;
    }
  }
  if (!search) {
    search = searchProviderFromEnv(env, fetchImpl);
    if (search) searchSource = "server";
  }

  const data: ToolContext["data"] = {};
  for (const [service, tool] of Object.entries(DATA_TOOLS)) {
    const row = byService.get(service);
    if (!row) continue;
    try {
      data[tool] = dataSourceFor(row, env, fetchImpl);
    } catch {
      // Unreadable or invalid saved settings: leave the tool unavailable; the Connections page shows the problem on test.
    }
  }

  const tools: ToolContext = { search, data };
  return {
    llm,
    llmSource,
    searchSource,
    tools,
    fetch: modelRow ? noRedirects(fetchImpl) : fetchImpl,
    connectedTools: availableTools(TOOL_IDS, tools),
  };
}

/** Tries a company's saved connection for real and records the result. */
export async function testConnection(db: Db, companyId: string, service: ServiceId, env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): Promise<ConnectionView | null> {
  const [row] = await db.select().from(connections).where(and(eq(connections.companyId, companyId), eq(connections.service, service))).limit(1);
  if (!row) return null;

  let status: "ok" | "error" = "ok";
  let message: string;
  try {
    if (row.status === "demo") throw new ConfigError("This is a sample connection from the demo. Replace it with your own details to test.");
    if (service === "ai_model") {
      const config = llmFromConnection(row, env);
      await assertModelUrl(config.baseUrl, env);
      const reply = await new OpenAICompatibleClient(config, noRedirects(fetchImpl)).chat({ model: config.model, messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 5 });
      message = `Connected. ${reply.model || config.model} replied.`;
    } else if (service === "web_search") {
      const provider = searchProvider(row.config.provider ?? "", readSecrets(row, env).apiKey ?? "", fetchImpl);
      if (!provider) throw new ConfigError("Choose a provider and paste its API key.");
      const results = await provider.search("small business growth", 1);
      message = `Connected. ${SERVICES.web_search.fields[0].options?.find((o) => o.value === provider.name)?.label ?? provider.name} returned ${results.length ? "results" : "no results, but accepted the key"}.`;
    } else {
      message = await dataSourceFor(row, env, fetchImpl).test();
    }
  } catch (error) {
    status = "error";
    const { friendlyError } = await import("@/agents/engine");
    message = error instanceof ToolError || error instanceof ConfigError ? error.message : friendlyError(error);
  }

  const [updated] = await db
    .update(connections)
    .set({ status, statusMessage: message.slice(0, 300), checkedAt: new Date() })
    .where(eq(connections.id, row.id))
    .returning();
  return toView(updated);
}
