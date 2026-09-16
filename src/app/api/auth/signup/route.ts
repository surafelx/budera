import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, createSession, hashPassword } from "@/lib/auth";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { sessionCookieOptions } from "@/lib/session";
import { signupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const parsed = signupSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Check the highlighted fields.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const { name, email, password } = parsed.data;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return jsonError("An account with this email already exists. Sign in instead.", 409, { fields: { email: "Already registered" } });
  }

  const [user] = await db.insert(users).values({ name, email, passwordHash: await hashPassword(password) }).returning({ id: users.id });
  const { token } = await createSession(db, user.id);
  const res = NextResponse.json({ ok: true, next: "/onboarding" });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
