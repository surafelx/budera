import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { setActiveCompany } from "@/lib/auth";
import { MAX_COMPANIES } from "@/lib/companies";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { activeCompany, currentUser, sessionToken } from "@/lib/session";
import { companySchema } from "@/lib/validation";

/** Add a company (onboarding or "Add company") and switch this session to it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401);

  const parsed = companySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Some answers need another look.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const [{ value: owned }] = await db.select({ value: count() }).from(companies).where(eq(companies.ownerId, user.id));
  if (owned >= MAX_COMPANIES) return jsonError(`You can have up to ${MAX_COMPANIES} companies. Delete one to add another.`, 409);

  const [company] = await db.insert(companies).values({ ...parsed.data, ownerId: user.id }).returning({ id: companies.id });
  await setActiveCompany(db, await sessionToken(), company.id);
  return NextResponse.json({ ok: true, id: company.id, next: "/dashboard" }, { status: 201 });
}

/** Update the profile of the company this session is working on. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const company = await activeCompany();
  if (!company) return jsonError("Sign in and add a company first.", 401);

  const parsed = companySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Some answers need another look.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  await db
    .update(companies)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(companies.id, company.id), eq(companies.ownerId, company.ownerId)));
  return NextResponse.json({ ok: true });
}

/** Delete the active company with its agents, reports and tasks. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const company = await activeCompany();
  if (!company) return jsonError("Sign in and add a company first.", 401);

  const db = await getDb();
  await db.delete(companies).where(and(eq(companies.id, company.id), eq(companies.ownerId, company.ownerId)));
  const [next] = await db.select({ id: companies.id }).from(companies).where(eq(companies.ownerId, company.ownerId)).limit(1);
  await setActiveCompany(db, await sessionToken(), next?.id ?? null);
  return NextResponse.json({ ok: true, next: next ? "/dashboard" : "/onboarding" });
}
