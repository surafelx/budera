import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import type { Company, User } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, sessionForToken } from "./auth";
import { listCompanies, pickActive } from "./companies";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  return (await sessionForToken(await getDb(), await sessionToken()))?.user ?? null;
}

/** Signed-in user, all their companies, and the one this session is working on (null before onboarding). */
export async function currentWorkspace(): Promise<{ user: User; company: Company | null; companies: Company[] } | null> {
  const db = await getDb();
  const session = await sessionForToken(db, await sessionToken());
  if (!session) return null;
  const companies = await listCompanies(db, session.user.id);
  return { user: session.user, company: pickActive(companies, session.activeCompanyId), companies };
}

/** For API routes: the active company of the signed-in owner, or null. */
export async function activeCompany(): Promise<Company | null> {
  return (await currentWorkspace())?.company ?? null;
}

/** For app pages: signed-in user with a finished company profile, or a redirect to the step they're missing. */
export async function requireCompany(): Promise<{ user: User; company: Company; companies: Company[] }> {
  const workspace = await currentWorkspace();
  if (!workspace) redirect("/login");
  if (!workspace.company) redirect("/onboarding");
  return { user: workspace.user, company: workspace.company, companies: workspace.companies };
}