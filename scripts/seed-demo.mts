/**
 * Local demo data: a fictional company with a sample report from every agent, so the app can be explored
 * without a Claude API key. Refuses to run against a real database.
 *
 *   npm run seed:demo
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createPgliteDb } from "../src/db";
import { agentRuns, companies, customAgents, tasks, users } from "../src/db/schema";
import { createSession, hashPassword } from "../src/lib/auth";
import { customKey, type AgentId } from "../src/agents/registry";
import type { AgentOutputs } from "../src/agents/schemas";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. The demo seed only runs against the local embedded database.");
  process.exit(1);
}

const EMAIL = "demo@budera.local";
const db = await createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));

await db.delete(users).where(eq(users.email, EMAIL));
const password = randomBytes(9).toString("base64url");
const [user] = await db.insert(users).values({ email: EMAIL, name: "Hanna Tesfaye", passwordHash: await hashPassword(password) }).returning();
const [company] = await db
  .insert(companies)
  .values({
    ownerId: user.id,
    name: "Kaffa Roasters (demo)",
    website: "",
    industry: "Specialty coffee roasting",
    country: "Addis Ababa, Ethiopia",
    stage: "Early revenue",
    teamSize: "2–5",
    revenueBand: "Under $10k / month",
    offering: "Single-origin roasted coffee sold by the bag online, and wholesale to cafés and hotels.",
    businessModel: "Wholesale contracts plus direct online sales at a higher margin.",
    targetCustomers: "Independent cafés and boutique hotels in Addis Ababa, and coffee lovers ordering online.",
    competitors: ["Local roaster A", "Supermarket house brands"],
    goals: "Supply 20 cafés, launch online subscriptions, and ship a first small export order.",
    challenges: "Inconsistent green-bean supply, and no time to chase wholesale leads.",
  })
  .returning();

const task = (title: string, detail: string, priority: "high" | "medium" | "low", due_in_days: number) => ({ title, detail, priority, due_in_days });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

const reports: { [K in AgentId]: { output: AgentOutputs[K]; sources: { url: string; title: string }[]; hours: number } } = {
  growth_gps: {
    hours: 2,
    sources: [],
    output: {
      summary: "Demand is proven with 6 cafés; the fastest path to 20 is a structured wholesale trial, not more online marketing.",
      score: { value: 64, rationale: "Early revenue and repeat café orders, but sales depend on the founder's time." },
      priorities: [
        { title: "Run a 4-week café trial programme", why: "Cafés that taste consistent quality for a month tend to switch suppliers.", impact: "high", effort: "medium", metric: "Trial cafés converted to monthly orders" },
        { title: "Launch a monthly subscription", why: "Online buyers already reorder; a subscription locks in margin and cash flow.", impact: "medium", effort: "low", metric: "Active subscribers" },
        { title: "Secure a second green-bean supplier", why: "Supply gaps would break wholesale promises just as volume grows.", impact: "high", effort: "medium", metric: "Weeks of stock on hand" },
      ],
      risks: ["Founder-led sales will cap growth at roughly 10 cafés.", "A single supplier failure could stop deliveries for weeks."],
      tasks: [
        task("Pitch a 4-week trial supply to the 10 busiest cafés in Bole", "List ten cafés, visit with two roast profiles, and offer fixed trial pricing.", "high", 7),
        task("Draft a one-page wholesale price list with volume tiers", "Three tiers by kilograms per month, with delivery days and terms.", "medium", 10),
      ],
    },
  },
  paralegal: {
    hours: 2,
    sources: [],
    output: {
      summary: "Core registration looks done, but VAT registration and written wholesale terms are the biggest gaps before scaling.",
      jurisdiction: "Federal Democratic Republic of Ethiopia (Addis Ababa)",
      score: { value: 41, rationale: "Trading licence likely in place; tax, food-safety and contract items are unclear." },
      checklist: [
        { area: "Tax", requirement: "VAT registration once turnover passes the legal threshold", likely_status: "likely_missing", risk: "high", action: "Confirm current turnover against the threshold with an accountant this month." },
        { area: "Licensing", requirement: "Food handling and export permits for roasted coffee", likely_status: "unknown", risk: "high", action: "Ask the Ethiopian Coffee and Tea Authority which permits apply to roasted exports." },
        { area: "Contracts", requirement: "Written wholesale supply terms", likely_status: "likely_missing", risk: "medium", action: "Put payment, delivery and returns terms in a one-page agreement." },
        { area: "Registration", requirement: "Commercial registration and trade licence", likely_status: "likely_done", risk: "low", action: "Keep renewal dates in the calendar." },
      ],
      documents: [
        { name: "Wholesale supply agreement", purpose: "Sets price, payment days and quality standards with cafés." },
        { name: "Online terms of sale", purpose: "Covers refunds and delivery for subscription customers." },
      ],
      questions_for_a_lawyer: ["Which permits does a small roaster need to export roasted, not green, coffee?", "Do subscription payments change our VAT position?"],
      tasks: [task("Register for VAT before wholesale invoices pass the threshold", "Check the last 12 months of sales with an accountant and file if needed.", "high", 3)],
    },
  },
  trend_hawk: {
    hours: 1,
    sources: [
      { url: "https://example.com/specialty-coffee-demand", title: "Example source: café specialty demand report" },
      { url: "https://example.com/subscription-commerce", title: "Example source: subscription commerce trends" },
    ],
    output: {
      summary: "Specialty café openings and online subscriptions are both growing; traceability is becoming a buying criterion.",
      score: { value: 72, rationale: "Demand trends favour small specialty roasters with a clear origin story." },
      signals: [
        { trend: "More specialty cafés opening in central districts", evidence: "Demo data: several new specialty cafés reported this year.", source_urls: ["https://example.com/specialty-coffee-demand"], relevance: "high", opportunity: "Target new openings before they sign a supplier.", time_horizon: "now" },
        { trend: "Buyers asking for roast dates and origin", evidence: "Demo data: traceability labels increasingly cited in reviews.", source_urls: ["https://example.com/subscription-commerce"], relevance: "medium", opportunity: "Print origin and roast date on every bag.", time_horizon: "3-6 months" },
      ],
      tasks: [task("Build a list of cafés opening in the next 3 months", "Check permits notices and social media, then contact owners early.", "medium", 14)],
    },
  },
  competitor_radar: {
    hours: 1,
    sources: [{ url: "https://example.com/local-roaster-a", title: "Example source: Local roaster A website" }],
    output: {
      summary: "Established roasters compete on price and distribution; none lead on freshness or traceability, which is your opening.",
      score: { value: 55, rationale: "Smaller distribution than incumbents, but a clear quality position." },
      competitors: [
        { name: "Local roaster A", website: "https://example.com/local-roaster-a", positioning: "Mass-market roasted coffee in supermarkets.", pricing: "Not public", strengths: ["Wide distribution", "Brand recognition"], weaknesses: ["No roast dates", "Blends only"], recent_moves: "Demo data: opened a second café.", threat: "medium", source_urls: ["https://example.com/local-roaster-a"] },
        { name: "Supermarket house brands", website: "", positioning: "Lowest-price bags for home brewing.", pricing: "Lowest in market", strengths: ["Price"], weaknesses: ["Low freshness", "No wholesale service"], recent_moves: "No recent moves found.", threat: "low", source_urls: [] },
      ],
      gaps_to_win: ["Roast-date freshness guarantees for cafés", "Single-origin story that cafés can put on their menus"],
      tasks: [task("Publish origin and roast date on every bag", "Update labels and the website product pages.", "medium", 14)],
    },
  },
  operational_radar: {
    hours: 2,
    sources: [],
    output: {
      summary: "Orders, invoicing and stock live in chats and notebooks; that will break first as wholesale grows.",
      score: { value: 58, rationale: "Lean and responsive today, but manual in every core process." },
      areas: [
        { area: "Order intake", finding: "Wholesale orders arrive by phone and messaging apps.", risk: "high", recommendation: "Use one order form cafés can fill in, feeding a single sheet." },
        { area: "Inventory", finding: "Green-bean stock is tracked by memory.", risk: "medium", recommendation: "Weekly stock count in a shared sheet with reorder levels." },
      ],
      automations: [
        { process: "Wholesale invoicing", how: "Generate invoices from the order sheet each Friday.", hours_saved_per_month: 6 },
        { process: "Subscription renewals", how: "Use a payment link with automatic monthly billing.", hours_saved_per_month: 4 },
      ],
      tasks: [task("Set up a single order form for wholesale customers", "One form with café name, kilos, roast and delivery day.", "high", 5)],
    },
  },
};

for (const [agent, r] of Object.entries(reports) as [AgentId, (typeof reports)[AgentId]][]) {
  const [run] = await db
    .insert(agentRuns)
    .values({ companyId: company.id, agentKey: agent, status: "succeeded", output: r.output, sources: r.sources, model: "demo-data", createdAt: hoursAgo(r.hours), startedAt: hoursAgo(r.hours), finishedAt: hoursAgo(r.hours - 0.05) })
    .returning();
  await db.insert(tasks).values(
    (r.output as { tasks: ReturnType<typeof task>[] }).tasks.map((t) => ({ companyId: company.id, runId: run.id, agentKey: agent, title: t.title, detail: t.detail, priority: t.priority, dueInDays: t.due_in_days, createdAt: hoursAgo(r.hours) })),
  );
}

// One agent the owner "built", with a report, so the custom-agent pages have something to show.
const [pricing] = await db
  .insert(customAgents)
  .values({
    companyId: company.id,
    name: "Pricing Analyst",
    role: "Reviews our pricing against the market and suggests changes that protect margin.",
    instructions: "Find how competitors in our region price comparable coffee, including wholesale tiers. Compare with our prices and recommend changes or tests we could run.",
    tools: ["web_search", "read_page"],
    scoring: true,
    scoreLabel: "Pricing strength",
    schedule: "weekly",
    lastScheduledAt: hoursAgo(3),
  })
  .returning();
const pricingKey = customKey(pricing.id);
const [pricingRun] = await db
  .insert(agentRuns)
  .values({
    companyId: company.id,
    agentKey: pricingKey,
    customAgentId: pricing.id,
    status: "succeeded",
    model: "demo-data",
    createdAt: hoursAgo(3),
    startedAt: hoursAgo(3),
    finishedAt: hoursAgo(2.95),
    sources: [{ url: "https://example.com/wholesale-prices", title: "Example source: wholesale coffee price list" }],
    output: {
      summary: "Retail bags are priced in line with rivals, but wholesale is 15% below the market for the same quality.",
      score: { value: 52, rationale: "Healthy retail margin, underpriced wholesale." },
      findings: [
        { title: "Wholesale price is below comparable roasters", detail: "Demo data: rivals charge more per kilo for similar single-origin beans.", importance: "high", source_urls: ["https://example.com/wholesale-prices"] },
        { title: "No volume tiers", detail: "Cafés ordering 20kg pay the same as 2kg buyers, so there's no reason to consolidate orders.", importance: "medium", source_urls: [] },
      ],
      tasks: [{ title: "Add a 10kg+ wholesale tier and raise the base rate by 10%", detail: "Announce it to current cafés a month ahead.", priority: "high", due_in_days: 10 }],
    },
  })
  .returning();
await db.insert(tasks).values({ companyId: company.id, runId: pricingRun.id, agentKey: pricingKey, customAgentId: pricing.id, title: "Add a 10kg+ wholesale tier and raise the base rate by 10%", detail: "Announce it to current cafés a month ahead.", priority: "high", dueInDays: 10, createdAt: hoursAgo(3) });
const { token } = await createSession(db, user.id);
console.log(`Demo company seeded.\n  Email:    ${EMAIL}\n  Password: ${password}\n  Session:  ${token}`);
process.exit(0);
