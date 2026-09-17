import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { agentModelFor } from "@/connections/agent-model";
import { executeRun, queueRuns } from "@/agents/runner";
import { DEMO_READ_ONLY, isDemoUser } from "@/lib/demo";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { activeCompany, currentUser } from "@/lib/session";

// Research agents make several model and tool calls; give background work room to finish.
export const maxDuration = 300;

const bodySchema = z.object({ agents: z.array(z.string().max(60)).min(1).max(20) });

/** Queue agents by key ("growth_gps" or "custom:<id>") and run them after the response is sent. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  if (isDemoUser(user)) return jsonError(DEMO_READ_ONLY, 403);
  const company = await activeCompany();
  if (!company) return jsonError("Finish your company profile first.", 409);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Choose which agents to run.", 422);

  const db = await getDb();
  const runs = await queueRuns(db, company.id, parsed.data.agents);
  if (runs.length === 0) {
    return NextResponse.json({ runs: [], message: "Those agents are already working, or don't exist." }, { status: 200 });
  }

  after(async () => {
    await Promise.all(runs.map((run) => executeRun(db, run.id, (companyId) => agentModelFor(db, companyId))));
  });

  return NextResponse.json({ runs: runs.map((r) => ({ id: r.id, agent: r.agentKey, status: r.status })) }, { status: 202 });
}
