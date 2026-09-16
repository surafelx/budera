import type { ToolId } from "@/tools/meta";

export const AGENT_IDS = ["growth_gps", "paralegal", "trend_hawk", "competitor_radar", "operational_radar"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentMeta = {
  id: AgentId;
  slug: string;
  name: string;
  role: string;
  watches: string;
  returns: string;
  scoreLabel: string;
  tools: ToolId[];
};

export const AGENTS: Record<AgentId, AgentMeta> = {
  growth_gps: {
    id: "growth_gps",
    slug: "growth-gps",
    name: "Growth GPS",
    role: "Strategy",
    watches: "Your goals, stage, customers and what's holding growth back.",
    returns: "A scored growth plan with the three moves that matter most and this week's tasks.",
    scoreLabel: "Growth readiness",
    tools: [],
  },
  paralegal: {
    id: "paralegal",
    slug: "paralegal",
    name: "My Paralegal",
    role: "Compliance",
    watches: "The registrations, filings, contracts and policies a business like yours needs where you operate.",
    returns: "A compliance checklist ranked by risk, the documents to prepare, and what to ask a lawyer.",
    scoreLabel: "Compliance coverage",
    tools: [],
  },
  trend_hawk: {
    id: "trend_hawk",
    slug: "trend-hawk",
    name: "Trend Hawk",
    role: "Market signals",
    watches: "News, launches and shifts in your industry and region, researched live on the web.",
    returns: "Sourced trend signals, what each one means for you, and how early you are.",
    scoreLabel: "Market momentum",
    tools: ["web_search", "read_page"],
  },
  competitor_radar: {
    id: "competitor_radar",
    slug: "competitor-radar",
    name: "Competitor Radar",
    role: "Competitive intel",
    watches: "The competitors you name and the ones it finds: positioning, pricing and recent moves.",
    returns: "A sourced competitor map, threat levels, and the gaps you can win.",
    scoreLabel: "Competitive position",
    tools: ["web_search", "read_page"],
  },
  operational_radar: {
    id: "operational_radar",
    slug: "operational-radar",
    name: "Operational Radar",
    role: "Operations",
    watches: "How work gets done at your size: sales, delivery, finance, hiring and tooling.",
    returns: "An operations health check, the biggest bottlenecks, and what to automate first.",
    scoreLabel: "Operational health",
    tools: [],
  },
};

export function agentBySlug(slug: string): AgentMeta | undefined {
  return Object.values(AGENTS).find((a) => a.slug === slug);
}

export function isBuiltInKey(key: string): key is AgentId {
  return (AGENT_IDS as readonly string[]).includes(key);
}

export const customKey = (id: string) => `custom:${id}`;

export function customIdFromKey(key: string): string | null {
  const m = key.match(/^custom:([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}
