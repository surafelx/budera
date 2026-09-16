import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { ClaudeAgentModel } from "@/agents/claude";
import { AGENT_IDS } from "@/agents/registry";
import { executeRun, queueRuns } from "@/agents/runner";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { companyFor, currentUser } from "@/lib/session";

// Agent runs use adaptive thinking and web search; give background work room to finish.
export const maxDuration = 300;

const bodySchema = z.object({ agents: z.array(z.enum(AGENT_IDS)).min(1).max(AGENT_IDS.length) });

/** Queue one or more agents and run them after the response is sent. The UI polls /api/runs/[id]. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  const company = await companyFor(user.id);
  if (!company) return jsonError("Finish your company profile first.", 409);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Choose which agents to run.", 422);

  const db = await getDb();
  const runs = await queueRuns(db, company.id, [...new Set(parsed.data.agents)]);

  after(async () => {
    await Promise.all(runs.map((run) => executeRun(db, run.id, () => new ClaudeAgentModel())));
  });

  return NextResponse.json({ runs: runs.map((r) => ({ id: r.id, agent: r.agent, status: r.status })) }, { status: 202 });
}
