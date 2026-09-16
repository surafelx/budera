import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { companies, type Company } from "@/db/schema";

export const MAX_COMPANIES = 10;

export async function listCompanies(db: Db, ownerId: string): Promise<Company[]> {
  return db.select().from(companies).where(eq(companies.ownerId, ownerId)).orderBy(asc(companies.createdAt)).limit(MAX_COMPANIES + 5);
}

/** The session's chosen company if it still exists, otherwise the owner's first company. */
export function pickActive(list: Company[], activeId: string | null | undefined): Company | null {
  return list.find((c) => c.id === activeId) ?? list[0] ?? null;
}