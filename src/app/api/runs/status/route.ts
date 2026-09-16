import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { AGENT_IDS } from "@/agents/registry";
import { expireStaleRuns, latestRuns } from "@/agents/runner";
import { jsonError } from "@/lib/http";
import { companyFor, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Latest run status per agent for the signed-in owner's company. Polled while agents are working. */
export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  const company = await companyFor(user.id);
  if (!company) return jsonError("No company profile yet.", 409);

  const db = await getDb();
  await expireStaleRuns(db, company.id);
  const latest = await latestRuns(db, company.id);
  const agents = Object.fromEntries(
    AGENT_IDS.map((id) => {
      const r = latest[id];
      return [id, r ? { id: r.id, status: r.status, error: r.error, finishedAt: r.finishedAt } : null];
    }),
  );
  return NextResponse.json({ agents });
}
