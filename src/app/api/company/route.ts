import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { companyFor, currentUser } from "@/lib/session";
import { companySchema } from "@/lib/validation";

/** Create the company profile (onboarding) or update it (settings). One company per account. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);

  const parsed = companySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Some answers need another look.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const existing = await companyFor(user.id);
  if (existing) {
    await db
      .update(companies)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(companies.id, existing.id));
    return NextResponse.json({ ok: true, created: false });
  }
  await db.insert(companies).values({ ...parsed.data, ownerId: user.id });
  return NextResponse.json({ ok: true, created: true, next: "/dashboard" });
}
