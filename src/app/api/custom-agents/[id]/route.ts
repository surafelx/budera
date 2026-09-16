import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customAgents } from "@/db/schema";
import { customAgentSchema } from "@/agents/custom";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { companyFor, currentUser } from "@/lib/session";

async function ownerCompany(request: Request) {
  if (!sameOrigin(request)) return { error: jsonError("Request blocked.", 403) };
  const user = await currentUser();
  if (!user) return { error: jsonError("Sign in first.", 401) };
  const company = await companyFor(user.id);
  if (!company) return { error: jsonError("No company profile yet.", 409) };
  return { company };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await ownerCompany(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Agent not found.", 404);

  const parsed = customAgentSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Some fields need another look.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const data = parsed.data;
  const [updated] = await db
    .update(customAgents)
    .set({ ...data, scoreLabel: data.scoring ? data.scoreLabel : "", updatedAt: new Date() })
    .where(and(eq(customAgents.id, id), eq(customAgents.companyId, auth.company.id)))
    .returning({ id: customAgents.id });
  if (!updated) return jsonError("Agent not found.", 404);
  return NextResponse.json({ ok: true, next: `/agents/custom/${id}` });
}

/** Deleting an agent also deletes its reports and its tasks. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await ownerCompany(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Agent not found.", 404);

  const db = await getDb();
  const [deleted] = await db
    .delete(customAgents)
    .where(and(eq(customAgents.id, id), eq(customAgents.companyId, auth.company.id)))
    .returning({ id: customAgents.id });
  if (!deleted) return jsonError("Agent not found.", 404);
  return NextResponse.json({ ok: true, next: "/agents" });
}
