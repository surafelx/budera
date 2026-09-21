import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db";
import { agentRuns, companies, connections, customAgents, users } from "@/db/schema";
import { AGENT_IDS } from "@/agents/registry";
import { queueScheduledRuns } from "@/agents/runner";
import { serviceStates } from "@/connections/status";
import { analyticsSource, shopifySource, stripeSource, type FetchLike } from "@/connections/providers";
import { assertModelUrl, listConnections, loadRuntime, saveConnection, testConnection, validateConnection } from "@/connections/store";
import { seedDemoWorkspace } from "@/demo/seed";
import { decryptJson, encryptJson, secretHint } from "@/lib/crypto";
import { DEMO_EMAIL_DOMAIN } from "@/lib/demo";

const env = { BUDERA_ENCRYPTION_KEY: "test-key-for-budera-connections" } as unknown as NodeJS.ProcessEnv;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });

describe("secret encryption", () => {
  it("round-trips, detects tampering and a different key, and only reveals a hint", () => {
    const sealed = encryptJson({ apiKey: "sk-live-abcdef123456" }, env);
    expect(sealed).not.toContain("abcdef");
    expect(decryptJson(sealed, env)).toEqual({ apiKey: "sk-live-abcdef123456" });
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => decryptJson(parts.join("."), env)).toThrow(/can't be decrypted/);
    expect(() => decryptJson(sealed, { BUDERA_ENCRYPTION_KEY: "other" } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(secretHint("sk-live-abcdef123456")).toBe("••••3456");
    expect(secretHint('{"client_email":"bot@proj.iam.gserviceaccount.com","private_key":"x"}')).toBe("bot@proj.iam.gserviceaccount.com");
  });

  it("refuses to store secrets in production without a key", () => {
    expect(() => encryptJson({ a: "b" }, { DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv)).toThrow(/BUDERA_ENCRYPTION_KEY/);
  });
});

describe("connection validation", () => {
  it("checks required fields, formats and blank secrets", () => {
    expect(validateConnection("stripe", { secrets: {} })).toEqual({ ok: false, fields: { secretKey: expect.stringMatching(/Paste/) } });
    expect(validateConnection("stripe", { secrets: {} }, ["secretKey"]).ok).toBe(true);
    expect(validateConnection("stripe", { secrets: { secretKey: "not-a-key" } })).toMatchObject({ ok: false, fields: { secretKey: expect.any(String) } });
    const shop = validateConnection("shopify", { config: { shopDomain: "https://Kaffa.myshopify.com/admin" }, secrets: { accessToken: "shpat_x" } });
    expect(shop).toMatchObject({ ok: true, config: { shopDomain: "kaffa.myshopify.com" } });
    expect(validateConnection("shopify", { config: { shopDomain: "evil.example.com" }, secrets: { accessToken: "x" } }).ok).toBe(false);
    expect(validateConnection("google_analytics", { config: { propertyId: "123456789" }, secrets: { serviceAccountJson: "{}" } })).toMatchObject({ ok: false, fields: { serviceAccountJson: expect.any(String) } });
    expect(validateConnection("ai_model", { config: { baseUrl: "ftp://x", model: "gpt; rm" } })).toMatchObject({ ok: false, fields: { baseUrl: expect.any(String), model: expect.any(String) } });
    expect(validateConnection("web_search", { config: { provider: "altavista" }, secrets: { apiKey: "k" } }).ok).toBe(false);
  });

  it("only allows public https model URLs on hosted deployments", async () => {
    const prod = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    await expect(assertModelUrl("http://api.example.com/v1", prod)).rejects.toThrow(/https/);
    await expect(assertModelUrl("https://169.254.169.254/v1", prod)).rejects.toThrow(/public/);
    await expect(assertModelUrl("http://localhost:11434/v1", { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).resolves.toBeUndefined();
  });
});

describe("business data providers", () => {
  it("summarises Stripe charges across pages and survives missing subscription access", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(url);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rk_test_abc");
      if (url.includes("subscriptions")) return new Response("{}", { status: 403 });
      const now = Math.floor(Date.now() / 1000);
      if (!url.includes("starting_after")) {
        return json({ has_more: true, data: [
          { id: "ch_1", amount: 10000, amount_refunded: 0, currency: "usd", status: "succeeded", paid: true, created: now, customer: "cus_a" },
          { id: "ch_2", amount: 5000, amount_refunded: 5000, currency: "usd", status: "succeeded", paid: true, created: now, customer: "cus_a" },
        ] });
      }
      return json({ has_more: false, data: [{ id: "ch_3", amount: 2000, amount_refunded: 0, currency: "usd", status: "failed", paid: false, created: now, customer: "cus_b" }] });
    };
    const text = await stripeSource("rk_test_abc", fetchImpl).summary(90);
    expect(calls[1]).toContain("starting_after=ch_2");
    expect(text).toContain("Successful payments: 2, gross 150 USD, refunded 50 USD (33%)");
    expect(text).toContain("Failed payments: 1");
    expect(text).toContain("Paying customers: 1, of whom 1 paid more than once");
    expect(text).toMatch(/Subscriptions: not available \(Stripe credentials are valid but lack permission/);
  });

  it("follows Shopify pagination only within the store's own domain", async () => {
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    let pages = 0;
    const fetchImpl: FetchLike = async (url) => {
      pages++;
      if (pages === 1) {
        expect(url).toMatch(/^https:\/\/kaffa\.myshopify\.com\/admin\/api\//);
        return new Response(
          JSON.stringify({ orders: [
            { created_at: day(3), total_price: "40.00", currency: "USD", financial_status: "paid", fulfillment_status: null, cancelled_at: null, customer: { id: 1 }, refunds: [], fulfillments: [] },
            { created_at: day(2), total_price: "60.00", currency: "USD", financial_status: "paid", fulfillment_status: "fulfilled", cancelled_at: null, customer: { id: 1 }, refunds: [{}], fulfillments: [{ created_at: day(1) }] },
          ] }),
          { headers: { link: '<https://attacker.example/steal>; rel="next"' } },
        );
      }
      throw new Error("should not follow a foreign next link");
    };
    const text = await shopifySource("kaffa.myshopify.com", "shpat_x", fetchImpl).summary(30);
    expect(pages).toBe(1);
    expect(text).toContain("Orders: 2 (0 cancelled), revenue 100 USD, average order 50.00 USD");
    expect(text).toContain("Customers: 1, of whom 1 ordered more than once (100%)");
    expect(text).toContain("Paid but unfulfilled right now: 1");
    expect(() => shopifySource("evil.example.com", "x", fetchImpl)).toThrow(/myshopify/);
  });

  it("signs a Google service account JWT and reads traffic by channel", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = JSON.stringify({ type: "service_account", client_email: "budera@demo.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
    const fetchImpl: FetchLike = async (url, init) => {
      if (url === "https://oauth2.googleapis.com/token") {
        const assertion = new URLSearchParams(String(init.body)).get("assertion")!;
        const [h, p, s] = assertion.split(".");
        expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, s, "base64url")).toBe(true);
        expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "budera@demo.iam.gserviceaccount.com", scope: expect.stringContaining("analytics.readonly") });
        return json({ access_token: "ya29.token" });
      }
      expect(url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.token");
      return json({
        rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "800" }, { value: "600" }, { value: "24" }, { value: "0.62" }] }],
        totals: [{ metricValues: [{ value: "1000" }, { value: "750" }, { value: "30" }, { value: "0.6" }] }],
      });
    };
    const text = await analyticsSource("123456789", key, fetchImpl).summary(90);
    expect(text).toContain("Total: 1000 sessions, 750 users, 30 key events (3.0% of sessions)");
    expect(text).toContain("Organic Search: 800 sessions, 600 users, 24 key events, 62% engaged");
  });
});

describe("stored connections", () => {
  let db: Db;
  let companyId: string;

  beforeAll(async () => {
    db = await createPgliteDb("memory://");
  });

  beforeEach(async () => {
    await db.delete(users);
    const [u] = await db.insert(users).values({ email: "owner@kaffa.et", name: "O", passwordHash: "x" }).returning();
    const [c] = await db
      .insert(companies)
      .values({ ownerId: u.id, name: "Kaffa", industry: "Coffee", country: "Ethiopia", stage: "Idea", teamSize: "Just me", revenueBand: "None yet", offering: "Coffee", targetCustomers: "Cafes", goals: "Grow" })
      .returning();
    companyId = c.id;
  });

  it("encrypts secrets, never returns them, and keeps a saved secret when the field is left blank", async () => {
    const first = await saveConnection(db, companyId, "stripe", { secrets: { secretKey: "rk_test_supersecret123" } }, env);
    expect(first.ok).toBe(true);
    const [row] = await db.select().from(connections);
    expect(row.secrets).not.toContain("supersecret");
    expect(JSON.stringify(await listConnections(db, companyId))).not.toContain("supersecret");
    expect((await listConnections(db, companyId))[0]).toMatchObject({ service: "stripe", status: "untested", secretHints: { secretKey: "••••t123" } });

    const again = await saveConnection(db, companyId, "ai_model", { config: { baseUrl: "https://openrouter.ai/api/v1/", model: "openai/gpt-4.1-mini" }, secrets: { apiKey: "sk-or-key-1" } }, env);
    expect(again.ok).toBe(true);
    await saveConnection(db, companyId, "ai_model", { config: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1" }, secrets: { apiKey: "" } }, env);
    const runtime = await loadRuntime(db, companyId, env);
    expect(runtime.llm()).toMatchObject({ baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1", apiKey: "sk-or-key-1", researchModel: "openai/gpt-4.1" });
    expect(runtime.connectedTools).toEqual(["read_page", "stripe_revenue"]);
  });

  it("prefers the company's connections, falls back to the server, and explains when neither exists", async () => {
    const serverEnv = { ...env, LLM_MODEL: "server-model", SEARCH_PROVIDER: "brave", SEARCH_API_KEY: "server-key" } as unknown as NodeJS.ProcessEnv;
    let runtime = await loadRuntime(db, companyId, serverEnv);
    expect(runtime.llmSource).toBe("server");
    expect(runtime.llm().model).toBe("server-model");
    expect(runtime.searchSource).toBe("server");

    await saveConnection(db, companyId, "web_search", { config: { provider: "tavily" }, secrets: { apiKey: "tvly-company" } }, serverEnv);
    runtime = await loadRuntime(db, companyId, serverEnv);
    expect(runtime.searchSource).toBe("company");
    expect(runtime.tools.search?.name).toBe("tavily");

    runtime = await loadRuntime(db, companyId, env);
    expect(runtime.llmSource).toBeNull();
    expect(() => runtime.llm()).toThrow(/No AI model is connected/);
  });

  it("records a failed test with a useful message", async () => {
    const saved = await saveConnection(db, companyId, "stripe", { secrets: { secretKey: "rk_live_revokedkey123" } }, env);
    expect(saved.ok).toBe(true);
    const view = await testConnection(db, companyId, "stripe", env, async () => new Response("{}", { status: 401 }));
    expect(view).toMatchObject({ status: "error", statusMessage: "Stripe rejected the credentials." });
    const ok = await testConnection(db, companyId, "stripe", env, async () => json({ data: [] }));
    expect(ok?.status).toBe("ok");
  });
});

describe("demo workspace", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb("memory://");
  });

  it("seeds two companies with every report, and its sample connections are never used", async () => {
    const [u] = await db.insert(users).values({ email: `visitor-1@${DEMO_EMAIL_DOMAIN}`, name: "Demo", passwordHash: "!demo" }).returning();
    const { companyIds } = await seedDemoWorkspace(db, u.id);
    expect(companyIds).toHaveLength(2);

    const kaffaRuns = await db.select().from(agentRuns).where(eq(agentRuns.companyId, companyIds[0]));
    for (const id of AGENT_IDS) expect(kaffaRuns.some((r) => r.agentKey === id && r.status === "succeeded")).toBe(true);

    const views = await listConnections(db, companyIds[0]);
    expect(views.map((v) => v.status)).toEqual(["demo", "demo", "demo", "demo"]);
    expect(serviceStates(views, env)).toMatchObject({ ai_model: "demo", stripe: "demo", google_analytics: "missing" });
    const runtime = await loadRuntime(db, companyIds[0], env);
    expect(runtime.llmSource).toBeNull();
    expect(runtime.connectedTools).toEqual(["read_page"]);

    // Its weekly custom agents are due, but demo workspaces are never scheduled.
    await db.update(customAgents).set({ lastScheduledAt: null });
    expect(await queueScheduledRuns(db)).toHaveLength(0);
  });
});
