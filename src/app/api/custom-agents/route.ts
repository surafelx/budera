import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customAgents } from "@/db/schema";
import { MAX_CUSTOM_AGENTS, customAgentSchema } from "@/agents/custom";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { activeCompany, currentUser } from "@/lib/session";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  const company = await activeCompany();
  if (!company) return jsonError("Finish your company profile first.", 409);

  const parsed = customAgentSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Some fields need another look.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const [{ value: existing }] = await db.select({ value: count() }).from(customAgents).where(eq(customAgents.companyId, company.id));
  if (existing >= MAX_CUSTOM_AGENTS) {
    return jsonError(`You can have up to ${MAX_CUSTOM_AGENTS} custom agents. Delete one to make room.`, 409);
  }

  const data = parsed.data;
  const [agent] = await db
    .insert(customAgents)
    .values({ ...data, scoreLabel: data.scoring ? data.scoreLabel : "", companyId: company.id })
    .returning({ id: customAgents.id });
  return NextResponse.json({ ok: true, id: agent.id, next: `/agents/custom/${agent.id}` }, { status: 201 });
}
