import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, count, gt, like, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { seedDemoWorkspace } from "@/demo/seed";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { DEMO_EMAIL_DOMAIN, demoEnabled } from "@/lib/demo";
import { jsonError, sameOrigin } from "@/lib/http";
import { sessionCookieOptions } from "@/lib/session";

const KEEP_FOR_MS = 24 * 60 * 60 * 1000;
const MAX_PER_HOUR = 300;

/** Creates a throwaway account with the sample workspace and signs the visitor into it. */
export async function POST(request: Request) {
  if (!demoEnabled()) return jsonError("The demo is turned off on this server.", 404);
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);

  const db = await getDb();
  const demoEmails = like(users.email, `%@${DEMO_EMAIL_DOMAIN}`);
  // Demo accounts last a day. Deleting the user removes its companies, runs, tasks and sessions too.
  await db.delete(users).where(and(demoEmails, lt(users.createdAt, new Date(Date.now() - KEEP_FOR_MS))));
  const [{ value: recent }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(demoEmails, gt(users.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (recent >= MAX_PER_HOUR) return jsonError("The demo is busy right now. Try again in a few minutes.", 429);

  // "!demo" isn't a valid password hash, so nobody can sign in to this account with a password.
  const [user] = await db
    .insert(users)
    .values({ email: `visitor-${randomBytes(6).toString("hex")}@${DEMO_EMAIL_DOMAIN}`, name: "Demo Visitor", passwordHash: "!demo" })
    .returning();
  await seedDemoWorkspace(db, user.id);
  const { token } = await createSession(db, user.id);

  const res = NextResponse.json({ ok: true, next: "/dashboard" }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: KEEP_FOR_MS / 1000 });
  return res;
}
