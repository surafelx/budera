import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, users } from "@/db/schema";
import { SESSION_COOKIE, createSession, verifyPassword } from "@/lib/auth";
import { fieldErrors, jsonError, readJson, sameOrigin } from "@/lib/http";
import { sessionCookieOptions } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Check the highlighted fields.", 422, { fields: fieldErrors(parsed.error) });

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await new Promise((r) => setTimeout(r, 400));
    return jsonError("That email and password don't match an account.", 401);
  }

  const { token } = await createSession(db, user.id);
  const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.ownerId, user.id)).limit(1);
  const res = NextResponse.json({ ok: true, next: company ? "/dashboard" : "/onboarding" });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
