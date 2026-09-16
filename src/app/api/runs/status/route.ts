import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { expireStaleRuns, latestRuns } from "@/agents/runner";
import { jsonError } from "@/lib/http";
import { activeCompany, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Latest run status per agent key for the signed-in owner's company. Polled while agents are working. */
export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  const company = await activeCompany();
  if (!company) return jsonError("No company profile yet.", 409);

  const db = await getDb();
  await expireStaleRuns(db, company.id);
  const latest = await latestRuns(db, company.id);
  const agents = Object.fromEntries(Object.entries(latest).map(([key, r]) => [key, { id: r.id, status: r.status, error: r.error, finishedAt: r.finishedAt }]));
  return NextResponse.json({ agents });
}
