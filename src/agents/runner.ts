import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { agentRuns, companies, tasks, type AgentRun } from "@/db/schema";
import { AgentError, friendlyError, type AgentModel } from "./claude";
import type { AgentId } from "./registry";
import type { AgentTask } from "./schemas";

/** A run that hasn't finished in this long is treated as failed (for example, the server restarted mid-run). */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export async function queueRuns(db: Db, companyId: string, agents: AgentId[]): Promise<AgentRun[]> {
  // Don't stack a second run on an agent that's already working.
  const active = await db
    .select({ agent: agentRuns.agent })
    .from(agentRuns)
    .where(and(eq(agentRuns.companyId, companyId), inArray(agentRuns.status, ["queued", "running"])));
  const busy = new Set(active.map((r) => r.agent));
  const toQueue = agents.filter((a) => !busy.has(a));
  if (toQueue.length === 0) return [];
  return db
    .insert(agentRuns)
    .values(toQueue.map((agent) => ({ companyId, agent, status: "queued" as const })))
    .returning();
}

export async function executeRun(db: Db, runId: string, makeModel: () => AgentModel): Promise<AgentRun> {
  const [run] = await db
    .update(agentRuns)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "queued")))
    .returning();
  if (!run) {
    const [existing] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    if (!existing) throw new Error(`Run ${runId} not found`);
    return existing;
  }

  try {
    const [company] = await db.select().from(companies).where(eq(companies.id, run.companyId)).limit(1);
    if (!company) throw new AgentError("The company profile for this run no longer exists.");

    const result = await makeModel().run(run.agent, company);
    const newTasks = (result.output as { tasks: AgentTask[] }).tasks;

    return await db.transaction(async (tx) => {
      const [done] = await tx
        .update(agentRuns)
        .set({
          status: "succeeded",
          output: result.output,
          sources: result.sources,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          finishedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id))
        .returning();

      // Replace this agent's still-open suggestions with the fresh ones; keep anything the owner completed.
      await tx
        .delete(tasks)
        .where(and(eq(tasks.companyId, run.companyId), eq(tasks.agent, run.agent), eq(tasks.status, "open")));
      if (newTasks.length > 0) {
        await tx.insert(tasks).values(
          newTasks.map((t) => ({
            companyId: run.companyId,
            runId: run.id,
            agent: run.agent,
            title: t.title,
            detail: t.detail,
            priority: t.priority,
            dueInDays: t.due_in_days,
          })),
        );
      }
      return done;
    });
  } catch (error) {
    if (!(error instanceof AgentError)) console.error(`[budera] run ${run.id} (${run.agent}) failed`, error);
    const [failed] = await db
      .update(agentRuns)
      .set({ status: "failed", error: friendlyError(error), finishedAt: new Date() })
      .where(eq(agentRuns.id, run.id))
      .returning();
    return failed;
  }
}

/** Mark runs stuck in queued/running for too long as failed so the owner can retry. */
export async function expireStaleRuns(db: Db, companyId: string): Promise<void> {
  await db
    .update(agentRuns)
    .set({ status: "failed", error: "This run didn't finish. Run the agent again.", finishedAt: new Date() })
    .where(
      and(
        eq(agentRuns.companyId, companyId),
        inArray(agentRuns.status, ["queued", "running"]),
        lt(agentRuns.createdAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    );
}

export async function latestRuns(db: Db, companyId: string): Promise<Partial<Record<AgentId, AgentRun>>> {
  const rows = await db.select().from(agentRuns).where(eq(agentRuns.companyId, companyId)).orderBy(desc(agentRuns.createdAt)).limit(100);
  const latest: Partial<Record<AgentId, AgentRun>> = {};
  for (const r of rows) latest[r.agent] ??= r;
  return latest;
}

/** Latest run that actually produced a report, per agent. */
export async function latestSuccessfulRuns(db: Db, companyId: string): Promise<Partial<Record<AgentId, AgentRun>>> {
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.companyId, companyId), eq(agentRuns.status, "succeeded")))
    .orderBy(desc(agentRuns.finishedAt))
    .limit(100);
  const latest: Partial<Record<AgentId, AgentRun>> = {};
  for (const r of rows) latest[r.agent] ??= r;
  return latest;
}
