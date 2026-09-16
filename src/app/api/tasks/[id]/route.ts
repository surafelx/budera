import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { activeCompany, currentUser } from "@/lib/session";

const bodySchema = z.object({ status: z.enum(["open", "done"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);
  const company = await activeCompany();
  if (!company) return jsonError("No company profile yet.", 409);

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Task not found.", 404);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Send a status of open or done.", 422);

  const db = await getDb();
  const [updated] = await db
    .update(tasks)
    .set({ status: parsed.data.status, completedAt: parsed.data.status === "done" ? new Date() : null })
    .where(and(eq(tasks.id, id), eq(tasks.companyId, company.id)))
    .returning({ id: tasks.id, status: tasks.status });
  if (!updated) return jsonError("Task not found.", 404);
  return NextResponse.json(updated);
}
