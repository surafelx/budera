import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, type Company, type User } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, userForToken } from "./auth";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  return userForToken(await getDb(), store.get(SESSION_COOKIE)?.value);
}

export async function companyFor(userId: string): Promise<Company | null> {
  const db = await getDb();
  const rows = await db.select().from(companies).where(eq(companies.ownerId, userId)).limit(1);
  return rows[0] ?? null;
}

/** For app pages: signed-in user with a finished company profile, or a redirect to the step they're missing. */
export async function requireCompany(): Promise<{ user: User; company: Company }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const company = await companyFor(user.id);
  if (!company) redirect("/onboarding");
  return { user, company };
}
