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
  usesWeb: boolean;
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
    usesWeb: false,
  },
  paralegal: {
    id: "paralegal",
    slug: "paralegal",
    name: "My Paralegal",
    role: "Compliance",
    watches: "The registrations, filings, contracts and policies a business like yours needs where you operate.",
    returns: "A compliance checklist ranked by risk, the documents to prepare, and what to ask a lawyer.",
    scoreLabel: "Compliance coverage",
    usesWeb: false,
  },
  trend_hawk: {
    id: "trend_hawk",
    slug: "trend-hawk",
    name: "Trend Hawk",
    role: "Market signals",
    watches: "News, launches and shifts in your industry and region, searched live on the web.",
    returns: "Sourced trend signals, what each one means for you, and how early you are.",
    scoreLabel: "Market momentum",
    usesWeb: true,
  },
  competitor_radar: {
    id: "competitor_radar",
    slug: "competitor-radar",
    name: "Competitor Radar",
    role: "Competitive intel",
    watches: "The competitors you name and the ones it finds: positioning, pricing and recent moves.",
    returns: "A sourced competitor map, threat levels, and the gaps you can win.",
    scoreLabel: "Competitive position",
    usesWeb: true,
  },
  operational_radar: {
    id: "operational_radar",
    slug: "operational-radar",
    name: "Operational Radar",
    role: "Operations",
    watches: "How work gets done at your size: sales, delivery, finance, hiring and tooling.",
    returns: "An operations health check, the biggest bottlenecks, and what to automate first.",
    scoreLabel: "Operational health",
    usesWeb: false,
  },
};

export function agentBySlug(slug: string): AgentMeta | undefined {
  return Object.values(AGENTS).find((a) => a.slug === slug);
}
