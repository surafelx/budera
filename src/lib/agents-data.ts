import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { customAgents, type CustomAgent } from "@/db/schema";
import { AGENT_IDS, AGENTS, customIdFromKey, customKey, isBuiltInKey } from "@/agents/registry";

export async function listCustomAgents(db: Db, companyId: string): Promise<CustomAgent[]> {
  return db.select().from(customAgents).where(eq(customAgents.companyId, companyId)).orderBy(asc(customAgents.createdAt));
}

/** Display name for any agent key, including custom agents. */
export function agentNames(customs: CustomAgent[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const id of AGENT_IDS) names[id] = AGENTS[id].name;
  for (const c of customs) names[customKey(c.id)] = c.name;
  return names;
}

export function agentHref(key: string): string {
  if (isBuiltInKey(key)) return `/agents/${AGENTS[key].slug}`;
  const id = customIdFromKey(key);
  return id ? `/agents/custom/${id}` : "/agents";
}

export function allAgentKeys(customs: CustomAgent[]): string[] {
  return [...AGENT_IDS, ...customs.map((c) => customKey(c.id))];
}
