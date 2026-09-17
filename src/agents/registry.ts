import type { ServiceNeed } from "@/connections/catalog";
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
  /** Tools the agent uses when they're connected. Missing ones are skipped and the report says so. */
  tools: ToolId[];
  /** How the agent produces its report, step by step, as shown to owners. */
  workflow: string[];
  needs: ServiceNeed[];
};

const MODEL_NEED = (why: string): ServiceNeed => ({ service: "ai_model", need: "required", why });

export const AGENTS: Record<AgentId, AgentMeta> = {
  growth_gps: {
    id: "growth_gps",
    slug: "growth-gps",
    name: "Growth GPS",
    role: "Strategy",
    watches: "Your goals, stage, customers and what's holding growth back.",
    returns: "A scored growth plan with the three moves that matter most and this week's tasks.",
    scoreLabel: "Growth readiness",
    tools: ["stripe_revenue", "shopify_sales", "analytics_traffic"],
    workflow: [
      "Reads your company profile: stage, goals, customers, revenue band and challenges.",
      "Pulls your real numbers from whatever is connected: revenue trend and repeat customers from Stripe or Shopify, and traffic by channel from Google Analytics.",
      "Compares where you are with your goals and scores growth readiness, where 50 is typical for your stage.",
      "Picks the three moves with the best impact for the effort, names the risks that could stall them, and turns the first steps into tasks.",
    ],
    needs: [
      MODEL_NEED("Does the analysis and writes the plan."),
      { service: "stripe", need: "optional", why: "Uses your actual revenue trend, refunds and repeat-customer rate instead of the revenue band you picked." },
      { service: "shopify", need: "optional", why: "Adds order volume, average order value and repeat buyers from your store." },
      { service: "google_analytics", need: "optional", why: "Shows which channels bring visitors and how many of them convert." },
    ],
  },
  paralegal: {
    id: "paralegal",
    slug: "paralegal",
    name: "My Paralegal",
    role: "Compliance",
    watches: "The registrations, filings, contracts and policies a business like yours needs where you operate.",
    returns: "A compliance checklist ranked by risk, the documents to prepare, and what to ask a lawyer.",
    scoreLabel: "Compliance coverage",
    tools: ["web_search", "read_page"],
    workflow: [
      "Works out your jurisdiction and sector from the company profile.",
      "Searches official sources, such as government, tax authority and regulator sites, for current registration, tax, licensing, employment and data rules.",
      "Reads the relevant pages and builds the checklist, marking each item as likely done, likely missing or unknown.",
      "Ranks items by risk, lists the documents to prepare, and turns anything ambiguous into questions for a qualified local lawyer.",
    ],
    needs: [
      MODEL_NEED("Reasons about which rules apply and writes the checklist."),
      { service: "web_search", need: "recommended", why: "Checks current rules on official sites. Without it the checklist relies on what the model already knows, which can be out of date." },
    ],
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
    workflow: [
      "Turns your industry, customers and region into focused search queries.",
      "Searches for news, launches, funding, regulation and changes in customer behaviour from the last 12 months.",
      "Opens the most useful articles and reports to check the details and dates.",
      "Writes each signal with its evidence and source links, what you could do about it, and how soon.",
    ],
    needs: [
      MODEL_NEED("Plans the research, calls the tools and writes the signals."),
      { service: "web_search", need: "required", why: "Trend Hawk's signals come from live search. Without it there is nothing current to report." },
    ],
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
    workflow: [
      "Looks up every competitor you named, and searches for others serving the same customers in your region.",
      "Opens their websites and pricing pages, and searches for recent launches, funding and price changes.",
      "Maps each one's positioning, pricing, strengths and weaknesses, with source links.",
      "Rates the threat from each and names the gaps you can realistically win.",
    ],
    needs: [
      MODEL_NEED("Plans the research, calls the tools and writes the competitor map."),
      { service: "web_search", need: "required", why: "Finds competitors and their recent moves. Without it the map only covers what the model already knows." },
    ],
  },
  operational_radar: {
    id: "operational_radar",
    slug: "operational-radar",
    name: "Operational Radar",
    role: "Operations",
    watches: "How work gets done at your size: sales, delivery, finance, hiring and tooling.",
    returns: "An operations health check, the biggest bottlenecks, and what to automate first.",
    scoreLabel: "Operational health",
    tools: ["stripe_revenue", "shopify_sales"],
    workflow: [
      "Reads how you sell and deliver from your company profile and challenges.",
      "Checks your real operating signals when connected: failed payments and refunds from Stripe, unfulfilled orders and fulfilment times from Shopify.",
      "Assesses sales, delivery, finance, hiring, support and tooling, and finds where things will break first as you grow.",
      "Recommends fixes that fit your size and the processes worth automating, with rough hours saved.",
    ],
    needs: [
      MODEL_NEED("Assesses your operations and writes the recommendations."),
      { service: "stripe", need: "optional", why: "Shows failed payments and refunds, which point to billing and collection problems." },
      { service: "shopify", need: "optional", why: "Shows unfulfilled orders and how long fulfilment takes." },
    ],
  },
};

/** What a custom agent needs, from the tools its owner gave it. */
export function customNeeds(tools: readonly string[]): ServiceNeed[] {
  const needs: ServiceNeed[] = [MODEL_NEED("Follows your instructions and writes the report.")];
  if (tools.includes("web_search")) needs.push({ service: "web_search", need: "required", why: "You gave this agent web search." });
  if (tools.includes("stripe_revenue")) needs.push({ service: "stripe", need: "required", why: "You gave this agent your Stripe revenue data." });
  if (tools.includes("shopify_sales")) needs.push({ service: "shopify", need: "required", why: "You gave this agent your Shopify sales data." });
  if (tools.includes("analytics_traffic")) needs.push({ service: "google_analytics", need: "required", why: "You gave this agent your website traffic data." });
  return needs;
}

export function customWorkflow(agent: { role: string; tools: readonly string[] }): string[] {
  const steps = [`Reads your company profile and its instructions for the job: ${agent.role}`];
  const data = agent.tools.filter((t) => t === "stripe_revenue" || t === "shopify_sales" || t === "analytics_traffic");
  if (data.length) steps.push("Pulls the business data you gave it access to, such as revenue, orders or traffic.");
  if (agent.tools.includes("web_search")) steps.push("Searches the web with focused queries for current, sourced information.");
  if (agent.tools.includes("read_page")) steps.push("Opens and reads the most useful pages to check the details.");
  steps.push("Writes a summary, findings ranked by importance with sources, and tasks, following your instructions.");
  return steps;
}

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
