import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db";
import { agentRuns, companies, tasks, users, type Company } from "@/db/schema";
import { AgentError, type AgentModel, type AgentResult } from "@/agents/claude";
import type { AgentId } from "@/agents/registry";
import { executeRun, expireStaleRuns, latestRuns, queueRuns } from "@/agents/runner";
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
  calls: { agent: AgentId; company: Company }[] = [];
  constructor(private result: AgentResult | Error) {}
  async run(agent: AgentId, company: Company) {
    this.calls.push({ agent, company });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("agent runner", () => {
  let db: Db;
  let company: Company;

  beforeAll(async () => {
    db = await createPgliteDb("memory://");
  });

  beforeEach(async () => {
    // Deleting users cascades to sessions, companies, runs and tasks.
    await db.delete(users);
    const [u] = await db.insert(users).values({ email: "owner@kaffa.et", name: "Owner", passwordHash: "x" }).returning();
    [company] = await db
      .insert(companies)
      .values({
        ownerId: u.id, name: "Kaffa Roasters", industry: "Specialty coffee", country: "Ethiopia", stage: "Early revenue",
        teamSize: "2–5", revenueBand: "Under $10k / month", offering: "Single-origin roasted coffee", targetCustomers: "Cafes in Addis Ababa",
        competitors: ["Tomoca"], goals: "Supply 20 cafes and start exporting",
      })
      .returning();
  });

  it("stores the report and replaces only the agent's open tasks", async () => {
    const [first] = await queueRuns(db, company.id, ["growth_gps"]);
    await executeRun(db, first.id, () => new FakeModel({ output: growthOutput(["Old A", "Old B"]), sources: [], model: "claude-opus-5", inputTokens: 10, outputTokens: 20 }));

    const [oldA] = await db.select().from(tasks).where(eq(tasks.title, "Old A"));
    await db.update(tasks).set({ status: "done" }).where(eq(tasks.id, oldA.id));

    const [second] = await queueRuns(db, company.id, ["growth_gps"]);
    const model = new FakeModel({ output: growthOutput(["New C"]), sources: [], model: "claude-opus-5", inputTokens: 5, outputTokens: 6 });
    const done = await executeRun(db, second.id, () => model);

    expect(done.status).toBe("succeeded");
    expect(model.calls[0].company.name).toBe("Kaffa Roasters");
    const titles = (await db.select().from(tasks)).map((t) => `${t.title}:${t.status}`).sort();
    expect(titles).toEqual(["New C:open", "Old A:done"]);
  });

  it("records a readable error and keeps existing tasks when the model fails", async () => {
    const [ok] = await queueRuns(db, company.id, ["growth_gps"]);
    await executeRun(db, ok.id, () => new FakeModel({ output: growthOutput(["Keep me"]), sources: [], model: "m", inputTokens: 1, outputTokens: 1 }));

    const [bad] = await queueRuns(db, company.id, ["growth_gps"]);
    const failed = await executeRun(db, bad.id, () => new FakeModel(new AgentError("Claude declined to write this report.")));

    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Claude declined to write this report.");
    expect((await db.select().from(tasks)).map((t) => t.title)).toEqual(["Keep me"]);
  });

  it("explains a missing API key instead of crashing", async () => {
    const [run] = await queueRuns(db, company.id, ["paralegal"]);
    const failed = await executeRun(db, run.id, () => {
      throw new AgentError("No Claude API key is configured. Add ANTHROPIC_API_KEY to the server environment and restart.");
    });
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("doesn't queue a second run for an agent that's already working", async () => {
    const first = await queueRuns(db, company.id, ["trend_hawk", "competitor_radar"]);
    const again = await queueRuns(db, company.id, ["trend_hawk", "operational_radar"]);
    expect(first.map((r) => r.agent).sort()).toEqual(["competitor_radar", "trend_hawk"]);
    expect(again.map((r) => r.agent)).toEqual(["operational_radar"]);
  });

  it("fails runs that got stuck", async () => {
    const [run] = await queueRuns(db, company.id, ["operational_radar"]);
    await db.update(agentRuns).set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) }).where(eq(agentRuns.id, run.id));
    await expireStaleRuns(db, company.id);
    expect((await latestRuns(db, company.id)).operational_radar?.status).toBe("failed");
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
