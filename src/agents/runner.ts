import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { agentRuns, companies, customAgents, tasks, type AgentRun, type CustomAgent } from "@/db/schema";
import { AgentError, builtInSpec, customSpec, friendlyError, type AgentModel } from "./engine";
import { customIdFromKey, customKey, isBuiltInKey } from "./registry";
import type { AgentTask } from "./schemas";

/** A run that hasn't finished in this long is treated as failed (for example, the server restarted mid-run). */
export const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Queue runs for agent keys ("growth_gps" or "custom:<id>"). Unknown keys and custom agents from another
 * company are ignored, and an agent that's already working isn't queued twice.
 */
export async function queueRuns(db: Db, companyId: string, keys: string[]): Promise<AgentRun[]> {
  const unique = [...new Set(keys)];
  const customIds = unique.map(customIdFromKey).filter((id): id is string => id !== null);
  const owned = customIds.length
    ? await db.select({ id: customAgents.id }).from(customAgents).where(and(eq(customAgents.companyId, companyId), inArray(customAgents.id, customIds)))
    : [];
  const ownedIds = new Set(owned.map((o) => o.id));
  const valid = unique.filter((k) => isBuiltInKey(k) || ownedIds.has(customIdFromKey(k) ?? ""));

  const active = await db
    .select({ key: agentRuns.agentKey })
    .from(agentRuns)
    .where(and(eq(agentRuns.companyId, companyId), inArray(agentRuns.status, ["queued", "running"])));
  const busy = new Set(active.map((r) => r.key));
  const toQueue = valid.filter((k) => !busy.has(k));
  if (toQueue.length === 0) return [];

  return db
    .insert(agentRuns)
    .values(toQueue.map((key) => ({ companyId, agentKey: key, customAgentId: customIdFromKey(key), status: "queued" as const })))
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

    let spec;
    if (isBuiltInKey(run.agentKey)) {
      spec = builtInSpec(run.agentKey);
    } else {
      const [agent] = run.customAgentId
        ? await db.select().from(customAgents).where(and(eq(customAgents.id, run.customAgentId), eq(customAgents.companyId, company.id))).limit(1)
        : [];
      if (!agent) throw new AgentError("This custom agent no longer exists.");
      spec = customSpec(agent);
    }

    const result = await makeModel().run(spec, company);
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

      // Replace this agent's unfinished suggestions with the fresh ones; keep anything the owner completed.
      await tx.delete(tasks).where(and(eq(tasks.companyId, run.companyId), eq(tasks.agentKey, run.agentKey), eq(tasks.status, "open")));
      if (newTasks.length > 0) {
        await tx.insert(tasks).values(
          newTasks.map((t) => ({
            companyId: run.companyId,
            runId: run.id,
            agentKey: run.agentKey,
            customAgentId: run.customAgentId,
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
    if (!(error instanceof AgentError)) console.error(`[budera] run ${run.id} (${run.agentKey}) failed`, error);
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
    .where(and(eq(agentRuns.companyId, companyId), inArray(agentRuns.status, ["queued", "running"]), lt(agentRuns.createdAt, new Date(Date.now() - STALE_AFTER_MS))));
}

export async function latestRuns(db: Db, companyId: string): Promise<Record<string, AgentRun>> {
  const rows = await db.select().from(agentRuns).where(eq(agentRuns.companyId, companyId)).orderBy(desc(agentRuns.createdAt)).limit(200);
  const latest: Record<string, AgentRun> = {};
  for (const r of rows) latest[r.agentKey] ??= r;
  return latest;
}

/** Latest run that actually produced a report, per agent key. */
export async function latestSuccessfulRuns(db: Db, companyId: string): Promise<Record<string, AgentRun>> {
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.companyId, companyId), eq(agentRuns.status, "succeeded")))
    .orderBy(desc(agentRuns.finishedAt))
    .limit(200);
  const latest: Record<string, AgentRun> = {};
  for (const r of rows) latest[r.agentKey] ??= r;
  return latest;
}

const INTERVAL_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 } as const;

/** Custom agents on a schedule whose next run is due. A little slack keeps a daily cron from drifting a day late. */
export function isDue(agent: Pick<CustomAgent, "schedule" | "lastScheduledAt" | "createdAt">, now = new Date()): boolean {
  if (agent.schedule !== "daily" && agent.schedule !== "weekly") return false;
  const last = agent.lastScheduledAt ?? null;
  if (!last) return true;
  return now.getTime() - last.getTime() >= INTERVAL_MS[agent.schedule] - 60 * 60 * 1000;
}

/** Queue every due scheduled agent (across all companies) and stamp when it was scheduled. */
export async function queueScheduledRuns(db: Db, now = new Date(), limit = 25): Promise<AgentRun[]> {
  const candidates = await db.select().from(customAgents).where(inArray(customAgents.schedule, ["daily", "weekly"])).limit(500);
  const due = candidates.filter((a) => isDue(a, now)).slice(0, limit);
  const runs: AgentRun[] = [];
  for (const agent of due) {
    await db.update(customAgents).set({ lastScheduledAt: now }).where(eq(customAgents.id, agent.id));
    runs.push(...(await queueRuns(db, agent.companyId, [customKey(agent.id)])));
  }
  return runs;
}
