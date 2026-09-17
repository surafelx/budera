import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { agentModelFor } from "@/connections/agent-model";
import { executeRun, queueScheduledRuns } from "@/agents/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called by a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Runs due daily and weekly custom agents. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Scheduling is off. Set CRON_SECRET to enable it." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const db = await getDb();
  const runs = await queueScheduledRuns(db);
  after(async () => {
    await Promise.all(runs.map((run) => executeRun(db, run.id, (companyId) => agentModelFor(db, companyId))));
  });
  return NextResponse.json({ queued: runs.length });
}
