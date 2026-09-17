import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db";
import { agentRuns, companies, customAgents, tasks, users, type Company, type CustomAgent } from "@/db/schema";
import { AgentError, type AgentModel, type AgentResult, type AgentSpec } from "@/agents/engine";
import { customKey } from "@/agents/registry";
import { executeRun, expireStaleRuns, isDue, latestRuns, queueRuns, queueScheduledRuns } from "@/agents/runner";
import { normalizeOutput } from "@/agents/schemas";
import { companyBrief } from "@/agents/prompts";

function growthOutput(taskTitles: string[]) {
  return {
    summary: "Solid base, needs a repeatable sales channel.",
    score: { value: 64, rationale: "Early revenue with clear demand." },
    priorities: [{ title: "Wholesale to cafes", why: "Highest margin", impact: "high" as const, effort: "medium" as const, metric: "Cafe accounts" }],
    risks: ["Single supplier"],
    tasks: taskTitles.map((title) => ({ title, detail: "Do it.", priority: "high" as const, due_in_days: 7 })),
  };
}

class FakeModel implements AgentModel {
  calls: { spec: AgentSpec; company: Company }[] = [];
  constructor(private result: AgentResult | Error) {}
  async run(spec: AgentSpec, company: Company) {
    this.calls.push({ spec, company });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

const ok = (output: unknown): AgentResult => ({ output, sources: [], model: "test-model", inputTokens: 1, outputTokens: 1 });

async function makeCompany(db: Db, email: string) {
  const [u] = await db.insert(users).values({ email, name: "Owner", passwordHash: "x" }).returning();
  const [c] = await db
    .insert(companies)
    .values({
      ownerId: u.id, name: `Co ${email}`, industry: "Specialty coffee", country: "Ethiopia", stage: "Early revenue", teamSize: "2–5",
      revenueBand: "Under $10k / month", offering: "Roasted coffee", targetCustomers: "Cafes", competitors: ["Rival"], goals: "Supply 20 cafes",
    })
    .returning();
  return c;
}

async function makeCustomAgent(db: Db, companyId: string, over: Partial<CustomAgent> = {}) {
  const [a] = await db
    .insert(customAgents)
    .values({
      companyId, name: "Pricing Analyst", role: "Reviews pricing", instructions: "Compare our prices with the market and suggest changes.",
      tools: ["web_search"], scoring: true, scoreLabel: "Pricing strength", schedule: "manual", ...over,
    })
    .returning();
  return a;
}

describe("agent runner", () => {
  let db: Db;
  let company: Company;

  beforeAll(async () => {
    db = await createPgliteDb("memory://");
  });

  beforeEach(async () => {
    await db.delete(users);
    company = await makeCompany(db, "owner@kaffa.et");
  });

  it("runs a built-in agent and replaces only that agent's open tasks", async () => {
    const [first] = await queueRuns(db, company.id, ["growth_gps"]);
    await executeRun(db, first.id, () => new FakeModel(ok(growthOutput(["Old A", "Old B"]))));

    const [oldA] = await db.select().from(tasks).where(eq(tasks.title, "Old A"));
    await db.update(tasks).set({ status: "done" }).where(eq(tasks.id, oldA.id));

    const [second] = await queueRuns(db, company.id, ["growth_gps"]);
    const model = new FakeModel(ok(growthOutput(["New C"])));
    const done = await executeRun(db, second.id, () => model);

    expect(done.status).toBe("succeeded");
    expect(model.calls[0].spec.key).toBe("growth_gps");
    expect(model.calls[0].spec.tools).toEqual(["stripe_revenue", "shopify_sales", "analytics_traffic"]);
    expect((await db.select().from(tasks)).map((t) => `${t.title}:${t.status}`).sort()).toEqual(["New C:open", "Old A:done"]);
  });

  it("runs a custom agent with the owner's instructions, tools and scoring", async () => {
    const agent = await makeCustomAgent(db, company.id);
    const [run] = await queueRuns(db, company.id, [customKey(agent.id)]);
    expect(run.customAgentId).toBe(agent.id);

    const model = new FakeModel(
      ok({ summary: "Prices are low", score: { value: 48, rationale: "Below market" }, findings: [], tasks: [{ title: "Raise the 1kg price", detail: "d", priority: "high", due_in_days: 5 }] }),
    );
    const done = await executeRun(db, run.id, () => model);

    expect(done.status).toBe("succeeded");
    const spec = model.calls[0].spec;
    expect(spec.name).toBe("Pricing Analyst");
    expect(spec.tools).toEqual(["web_search"]);
    expect(spec.system).toContain("Compare our prices with the market");
    expect(spec.system).toContain("Pricing strength");
    const [t] = await db.select().from(tasks);
    expect(t.agentKey).toBe(customKey(agent.id));
    expect(t.customAgentId).toBe(agent.id);
  });

  it("ignores unknown keys and custom agents that belong to another company", async () => {
    const other = await makeCompany(db, "someone@else.co");
    const theirs = await makeCustomAgent(db, other.id);
    const mine = await makeCustomAgent(db, company.id, { name: "Mine" });
    const runs = await queueRuns(db, company.id, ["growth_gps", "not_real", customKey(theirs.id), customKey(mine.id), "custom:../../etc"]);
    expect(runs.map((r) => r.agentKey).sort()).toEqual([customKey(mine.id), "growth_gps"].sort());
  });

  it("deleting a custom agent removes its runs and tasks", async () => {
    const agent = await makeCustomAgent(db, company.id);
    const [run] = await queueRuns(db, company.id, [customKey(agent.id)]);
    await executeRun(db, run.id, () => new FakeModel(ok({ summary: "s", score: { value: 50, rationale: "r" }, findings: [], tasks: [{ title: "T", detail: "d", priority: "low", due_in_days: 3 }] })));
    await db.delete(customAgents).where(eq(customAgents.id, agent.id));
    expect(await db.select().from(agentRuns)).toHaveLength(0);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("records a readable error and keeps existing tasks when the model fails", async () => {
    const [good] = await queueRuns(db, company.id, ["growth_gps"]);
    await executeRun(db, good.id, () => new FakeModel(ok(growthOutput(["Keep me"]))));
    const [bad] = await queueRuns(db, company.id, ["growth_gps"]);
    const failed = await executeRun(db, bad.id, () => new FakeModel(new AgentError("The model declined.")));
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("The model declined.");
    expect((await db.select().from(tasks)).map((t) => t.title)).toEqual(["Keep me"]);
  });

  it("explains missing configuration instead of crashing", async () => {
    const [run] = await queueRuns(db, company.id, ["paralegal"]);
    const failed = await executeRun(db, run.id, () => {
      throw new AgentError("No AI model is configured. Set LLM_MODEL.");
    });
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/LLM_MODEL/);
  });

  it("doesn't queue a second run for an agent that's already working", async () => {
    const first = await queueRuns(db, company.id, ["trend_hawk", "competitor_radar"]);
    const again = await queueRuns(db, company.id, ["trend_hawk", "operational_radar"]);
    expect(first.map((r) => r.agentKey).sort()).toEqual(["competitor_radar", "trend_hawk"]);
    expect(again.map((r) => r.agentKey)).toEqual(["operational_radar"]);
  });

  it("fails runs that got stuck", async () => {
    const [run] = await queueRuns(db, company.id, ["operational_radar"]);
    await db.update(agentRuns).set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) }).where(eq(agentRuns.id, run.id));
    await expireStaleRuns(db, company.id);
    expect((await latestRuns(db, company.id)).operational_radar?.status).toBe("failed");
  });

  it("queues due scheduled agents once and stamps them", async () => {
    const now = new Date("2026-09-20T06:00:00Z");
    const daily = await makeCustomAgent(db, company.id, { name: "Daily", schedule: "daily", lastScheduledAt: new Date("2026-09-19T06:00:00Z") });
    await makeCustomAgent(db, company.id, { name: "Weekly recent", schedule: "weekly", lastScheduledAt: new Date("2026-09-17T06:00:00Z") });
    await makeCustomAgent(db, company.id, { name: "Manual", schedule: "manual" });

    const runs = await queueScheduledRuns(db, now);
    expect(runs.map((r) => r.customAgentId)).toEqual([daily.id]);
    expect(await queueScheduledRuns(db, now)).toHaveLength(0);
  });
});

describe("schedule rules", () => {
  const base = { createdAt: new Date("2026-01-01") };
  it("treats never-run scheduled agents as due and manual ones as never due", () => {
    expect(isDue({ ...base, schedule: "weekly", lastScheduledAt: null })).toBe(true);
    expect(isDue({ ...base, schedule: "manual", lastScheduledAt: null })).toBe(false);
  });
  it("allows an hour of slack so a daily cron doesn't slip a day", () => {
    const now = new Date("2026-09-20T06:00:00Z");
    expect(isDue({ ...base, schedule: "daily", lastScheduledAt: new Date("2026-09-19T06:30:00Z") }, now)).toBe(true);
    expect(isDue({ ...base, schedule: "daily", lastScheduledAt: new Date("2026-09-19T12:00:00Z") }, now)).toBe(false);
    expect(isDue({ ...base, schedule: "weekly", lastScheduledAt: new Date("2026-09-14T06:00:00Z") }, now)).toBe(false);
    expect(isDue({ ...base, schedule: "weekly", lastScheduledAt: new Date("2026-09-13T06:00:00Z") }, now)).toBe(true);
  });
});

describe("output normalisation", () => {
  it("clamps scores and due dates, caps tasks, and drops source URLs research didn't return", () => {
    const out = normalizeOutput(
      "trend_hawk",
      {
        summary: "s",
        score: { value: 140.6, rationale: "r" },
        signals: [{ trend: "t", evidence: "e", source_urls: ["https://real.example/a", "https://made-up.example"], relevance: "high", opportunity: "o", time_horizon: "now" }],
        tasks: Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, detail: "d", priority: "low" as const, due_in_days: i === 0 ? -3 : 90 })),
      },
      new Set(["https://real.example/a"]),
    );
    expect(out.score.value).toBe(100);
    expect(out.tasks).toHaveLength(8);
    expect(out.tasks[0].due_in_days).toBe(1);
    expect(out.tasks[1].due_in_days).toBe(30);
    expect(out.signals[0].source_urls).toEqual(["https://real.example/a"]);
  });

  it("puts the profile in a clearly delimited block and skips empty fields", () => {
    const brief = companyBrief({
      name: "Kaffa", website: "", industry: "Coffee", country: "Ethiopia", stage: "Idea", teamSize: "Just me", revenueBand: "None yet",
      offering: "Coffee", businessModel: "", targetCustomers: "Cafes", competitors: [], goals: "Launch", challenges: "",
    });
    expect(brief.startsWith("<company_profile>")).toBe(true);
    expect(brief).not.toMatch(/Website:|Competitors|challenges/);
  });
});
