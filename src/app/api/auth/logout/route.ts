import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth";
import { jsonError, sameOrigin } from "@/lib/http";
import { sessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const store = await cookies();
  await deleteSession(await getDb(), store.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true, next: "/" });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
