/**
 * Sample workspace for the demo: two fictional companies with a report from every agent, custom agents, tasks and
 * sample connections. All names, figures and links are made up. Sample connections hold no secrets and are never used
 * for real requests.
 */
import type { Db } from "@/db";
import { agentRuns, companies, connections, customAgents, tasks, type Company } from "@/db/schema";
import { customKey, type AgentId } from "@/agents/registry";
import type { AgentOutputs, CustomOutput } from "@/agents/schemas";
import type { ServiceId } from "@/connections/catalog";

type Src = { url: string; title: string };
type T = { title: string; detail: string; priority: "high" | "medium" | "low"; due_in_days: number };

const task = (title: string, detail: string, priority: T["priority"], due_in_days: number): T => ({ title, detail, priority, due_in_days });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function addRun(db: Db, company: Company, agentKey: string, output: { tasks: T[] }, sources: Src[], hours: number, customAgentId: string | null = null) {
  const [run] = await db
    .insert(agentRuns)
    .values({ companyId: company.id, agentKey, customAgentId, status: "succeeded", output, sources, model: "demo-data", createdAt: hoursAgo(hours), startedAt: hoursAgo(hours), finishedAt: hoursAgo(hours - 0.05) })
    .returning();
  if (output.tasks.length) {
    await db.insert(tasks).values(
      output.tasks.map((t, i) => ({
        companyId: company.id,
        runId: run.id,
        agentKey,
        customAgentId,
        title: t.title,
        detail: t.detail,
        priority: t.priority,
        dueInDays: t.due_in_days,
        createdAt: hoursAgo(hours),
        // A few finished tasks, so the list shows progress.
        status: i === output.tasks.length - 1 && output.tasks.length > 2 ? ("done" as const) : ("open" as const),
        completedAt: i === output.tasks.length - 1 && output.tasks.length > 2 ? hoursAgo(1) : null,
      })),
    );
  }
}

async function addConnections(db: Db, company: Company, list: { service: ServiceId; config: Record<string, string>; hints: Record<string, string> }[]) {
  if (!list.length) return;
  await db.insert(connections).values(
    list.map((c) => ({
      companyId: company.id,
      service: c.service,
      config: c.config,
      secrets: null,
      secretHints: c.hints,
      status: "demo",
      statusMessage: "Sample connection with made-up details. Sign up and connect your own account to use real data.",
    })),
  );
}

const src = (slug: string, title: string): Src => ({ url: `https://example.com/demo/${slug}`, title: `Sample source: ${title}` });

export async function seedDemoWorkspace(db: Db, ownerId: string): Promise<{ companyIds: string[] }> {
  /* ---------------- Company 1: a coffee roaster with store and payment data ---------------- */
  const [kaffa] = await db
    .insert(companies)
    .values({
      ownerId,
      name: "Kaffa Roasters (demo)",
      website: "https://example.com/kaffa",
      industry: "Specialty coffee roasting",
      country: "Addis Ababa, Ethiopia",
      stage: "Early revenue",
      teamSize: "2–5",
      revenueBand: "$10k–$50k / month",
      offering: "Single-origin roasted coffee sold by the bag online, and wholesale to cafés and hotels.",
      businessModel: "Wholesale contracts plus direct online sales and subscriptions at a higher margin.",
      targetCustomers: "Independent cafés and boutique hotels in Addis Ababa, and coffee lovers ordering online.",
      competitors: ["Highland Bean Co.", "Supermarket house brands"],
      goals: "Supply 20 cafés, grow online subscriptions to 300, and ship a first small export order.",
      challenges: "Inconsistent green-bean supply, and no time to chase wholesale leads.",
      createdAt: hoursAgo(24 * 40),
    })
    .returning();

  await addConnections(db, kaffa, [
    { service: "ai_model", config: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini", researchModel: "openai/gpt-4.1-nano", structuredMode: "json_schema" }, hints: { apiKey: "••••demo" } },
    { service: "web_search", config: { provider: "tavily" }, hints: { apiKey: "••••demo" } },
    { service: "stripe", config: {}, hints: { secretKey: "••••demo" } },
    { service: "shopify", config: { shopDomain: "kaffa-demo.myshopify.com" }, hints: { accessToken: "••••demo" } },
  ]);

  const kaffaReports: { [K in AgentId]: { output: AgentOutputs[K]; sources: Src[]; hours: number } } = {
    growth_gps: {
      hours: 2,
      sources: [],
      output: {
        summary:
          "Shopify shows 412 online orders in 90 days with 38% from repeat buyers, and Stripe wholesale invoices grew 22% over the quarter. Demand is proven; the bottleneck is founder-led wholesale sales, not marketing.",
        score: { value: 64, rationale: "Revenue is growing month over month and repeat rates are strong, but wholesale growth depends on the founder's time." },
        priorities: [
          { title: "Run a 4-week café trial programme", why: "Stripe shows the 6 cafés that trialled last quarter now make up 41% of wholesale revenue.", impact: "high", effort: "medium", metric: "Trial cafés converted to monthly orders" },
          { title: "Turn repeat online buyers into subscribers", why: "157 Shopify customers ordered twice or more in 90 days but only 94 subscribe.", impact: "medium", effort: "low", metric: "Active subscriptions (Stripe)" },
          { title: "Secure a second green-bean supplier", why: "Two stock-outs in August cancelled 23 online orders.", impact: "high", effort: "medium", metric: "Weeks of stock on hand" },
        ],
        risks: ["Founder-led wholesale sales will cap growth at roughly 10 cafés.", "Refunds rose to 4.1% in September, mostly from late deliveries."],
        tasks: [
          task("Pitch a 4-week trial supply to the 10 busiest cafés in Bole", "List ten cafés, visit with two roast profiles, and offer fixed trial pricing.", "high", 7),
          task("Email the 63 repeat buyers who don't subscribe yet", "Offer the first month at 15% off with free delivery.", "medium", 5),
          task("Draft a one-page wholesale price list with volume tiers", "Three tiers by kilograms per month, with delivery days and terms.", "medium", 10),
        ],
      },
    },
    paralegal: {
      hours: 3,
      sources: [src("revenue-authority-vat", "Ethiopian revenue authority VAT registration guide"), src("coffee-authority-export", "Coffee and tea authority export licensing page")],
      output: {
        summary: "Core registration looks done, but VAT registration and written wholesale terms are the biggest gaps before scaling. Export needs a licence you don't appear to have yet.",
        jurisdiction: "Federal Democratic Republic of Ethiopia (Addis Ababa)",
        score: { value: 47, rationale: "Trading licence in place; VAT, export licensing and wholesale contracts are the open items." },
        checklist: [
          { area: "Tax", requirement: "VAT registration once annual turnover passes the legal threshold", likely_status: "likely_missing", risk: "high", action: "Your Stripe and Shopify revenue suggests you're close to the threshold. Confirm with an accountant this month." },
          { area: "Licensing", requirement: "Export licence for roasted coffee", likely_status: "likely_missing", risk: "high", action: "Apply before accepting any export order; ask which quality certificates apply to roasted beans." },
          { area: "Contracts", requirement: "Written wholesale supply terms", likely_status: "likely_missing", risk: "medium", action: "Put payment, delivery and returns terms in a one-page agreement." },
          { area: "Consumer", requirement: "Clear online refund and delivery policy", likely_status: "unknown", risk: "medium", action: "Publish the policy on the store and in order confirmation emails." },
          { area: "Registration", requirement: "Commercial registration and trade licence", likely_status: "likely_done", risk: "low", action: "Keep renewal dates in the calendar." },
        ],
        documents: [
          { name: "Wholesale supply agreement", purpose: "Sets price, payment days and quality standards with cafés." },
          { name: "Online terms of sale and refund policy", purpose: "Covers refunds and delivery for store and subscription customers." },
        ],
        questions_for_a_lawyer: ["Which permits does a small roaster need to export roasted, not green, coffee?", "Do subscription payments change when VAT is due?"],
        tasks: [
          task("Confirm VAT position with an accountant", "Share the last 12 months of Stripe and Shopify revenue and file if needed.", "high", 3),
          task("Publish a refund and delivery policy", "Add it to the store footer and order emails.", "medium", 7),
        ],
      },
    },
    trend_hawk: {
      hours: 1,
      sources: [src("specialty-cafe-openings", "City café openings report 2026"), src("subscription-commerce", "Subscription commerce trends in East Africa"), src("traceability-labels", "Consumer interest in coffee traceability")],
      output: {
        summary: "Specialty café openings and online subscriptions are both growing, and traceability is becoming a buying criterion. Conditions favour a small roaster with a clear origin story.",
        score: { value: 72, rationale: "Demand trends favour small specialty roasters with fresh, traceable coffee." },
        signals: [
          { trend: "More specialty cafés opening in central districts", evidence: "Sample: 14 new specialty cafés opened in the city this year.", source_urls: ["https://example.com/demo/specialty-cafe-openings"], relevance: "high", opportunity: "Reach new cafés before they sign a supplier.", time_horizon: "now" },
          { trend: "Coffee subscriptions growing online", evidence: "Sample: subscription orders for specialty food up year over year.", source_urls: ["https://example.com/demo/subscription-commerce"], relevance: "high", opportunity: "Make subscription the default option on product pages.", time_horizon: "now" },
          { trend: "Buyers asking for roast dates and origin", evidence: "Sample: traceability labels increasingly cited in reviews.", source_urls: ["https://example.com/demo/traceability-labels"], relevance: "medium", opportunity: "Print origin and roast date on every bag.", time_horizon: "3-6 months" },
        ],
        tasks: [task("Build a list of cafés opening in the next 3 months", "Check permit notices and social media, then contact owners early.", "medium", 14)],
      },
    },
    competitor_radar: {
      hours: 1,
      sources: [src("highland-bean", "Highland Bean Co. website"), src("highland-bean-pricing", "Highland Bean Co. wholesale price list")],
      output: {
        summary: "Established roasters compete on price and distribution; none lead on freshness or traceability, which is your opening.",
        score: { value: 58, rationale: "Smaller distribution than incumbents, but a clearer quality position." },
        competitors: [
          {
            name: "Highland Bean Co.",
            website: "https://example.com/demo/highland-bean",
            positioning: "Mass-market roasted coffee in supermarkets and hotels.",
            pricing: "Sample: wholesale from about 18% below your current rate",
            strengths: ["Wide distribution", "Brand recognition"],
            weaknesses: ["No roast dates", "Blends only"],
            recent_moves: "Sample: opened a second café and launched a loyalty app.",
            threat: "medium",
            source_urls: ["https://example.com/demo/highland-bean", "https://example.com/demo/highland-bean-pricing"],
          },
          { name: "Supermarket house brands", website: "", positioning: "Lowest-price bags for home brewing.", pricing: "Lowest in market", strengths: ["Price"], weaknesses: ["Low freshness", "No wholesale service"], recent_moves: "No recent moves found.", threat: "low", source_urls: [] },
        ],
        gaps_to_win: ["Roast-date freshness guarantees for cafés", "Single-origin story cafés can put on their menus"],
        tasks: [task("Publish origin and roast date on every bag", "Update labels and the store's product pages.", "medium", 14)],
      },
    },
    operational_radar: {
      hours: 2,
      sources: [],
      output: {
        summary: "Stripe shows 7% of payment attempts failing and Shopify's median fulfilment time is 2.6 days. Orders, invoicing and stock are still manual, and that will break first as wholesale grows.",
        score: { value: 56, rationale: "Responsive team, but failed payments and slow fulfilment are costing revenue." },
        areas: [
          { area: "Payments", finding: "Stripe: 31 of 442 payment attempts failed in 90 days, mostly expired cards on subscriptions.", risk: "high", recommendation: "Turn on automatic card-update emails and retry failed subscription payments." },
          { area: "Fulfilment", finding: "Shopify: median 2.6 days to ship, and 18 paid orders are unfulfilled right now.", risk: "high", recommendation: "Batch roasting on Monday and Thursday, and ship the next morning." },
          { area: "Wholesale orders", finding: "Café orders arrive by phone and messaging apps.", risk: "medium", recommendation: "One order form that feeds a single sheet." },
        ],
        automations: [
          { process: "Wholesale invoicing", how: "Create Stripe invoices from the order sheet every Friday.", hours_saved_per_month: 6 },
          { process: "Failed payment follow-up", how: "Stripe smart retries plus an automatic card-update email.", hours_saved_per_month: 4 },
        ],
        tasks: [
          task("Ship the 18 unfulfilled paid orders", "Clear the backlog before the weekend and email a delivery date.", "high", 2),
          task("Turn on Stripe smart retries and card-update emails", "Settings → Billing → Subscriptions and emails.", "high", 3),
          task("Set up a single order form for wholesale customers", "One form with café name, kilos, roast and delivery day.", "medium", 7),
        ],
      },
    },
  };
  for (const [agent, r] of Object.entries(kaffaReports) as [AgentId, (typeof kaffaReports)[AgentId]][]) {
    await addRun(db, kaffa, agent, r.output as { tasks: T[] }, r.sources, r.hours);
  }

  const [pricing] = await db
    .insert(customAgents)
    .values({
      companyId: kaffa.id,
      name: "Pricing Analyst",
      role: "Reviews our pricing against the market and suggests changes that protect margin.",
      instructions:
        "Find how competitors in our region price comparable coffee, including wholesale tiers. Use our Shopify sales to see which bags and sizes sell best. Compare with our prices and recommend changes or tests we could run.",
      tools: ["web_search", "read_page", "shopify_sales"],
      scoring: true,
      scoreLabel: "Pricing strength",
      schedule: "weekly",
      lastScheduledAt: hoursAgo(3),
    })
    .returning();
  const pricingOutput: CustomOutput & { tasks: T[] } = {
    summary: "Retail bags are priced in line with rivals and Shopify shows the 500g bag drives 61% of revenue, but wholesale is about 15% below market for the same quality.",
    score: { value: 52, rationale: "Healthy retail margin, underpriced wholesale." },
    findings: [
      { title: "Wholesale price is below comparable roasters", detail: "Sample: rivals charge more per kilo for similar single-origin beans.", importance: "high", source_urls: ["https://example.com/demo/highland-bean-pricing"] },
      { title: "The 500g bag is the real best seller", detail: "Shopify: 61% of revenue and 54% of orders in 90 days. The 250g bag rarely sells.", importance: "medium", source_urls: [] },
      { title: "No volume tiers", detail: "Cafés ordering 20kg pay the same as 2kg buyers, so there's no reason to consolidate orders.", importance: "medium", source_urls: [] },
    ],
    tasks: [
      task("Add a 10kg+ wholesale tier and raise the base rate by 10%", "Announce it to current cafés a month ahead.", "high", 10),
      task("Test a 1kg bag at a 12% per-gram discount", "Run it for four weeks on the store and compare average order value.", "medium", 14),
    ],
  };
  await addRun(db, kaffa, customKey(pricing.id), pricingOutput, [src("highland-bean-pricing", "Highland Bean Co. wholesale price list")], 3, pricing.id);

  const [funding] = await db
    .insert(customAgents)
    .values({
      companyId: kaffa.id,
      name: "Funding Scout",
      role: "Finds grants, accelerators, competitions and investors we qualify for.",
      instructions:
        "Search for open grants, accelerator programmes, pitch competitions and investors that fund food and agriculture companies at our stage in Ethiopia. Only include opportunities open now or within three months, with deadlines.",
      tools: ["web_search", "read_page"],
      scoring: false,
      schedule: "weekly",
      lastScheduledAt: hoursAgo(26),
    })
    .returning();
  const fundingOutput: CustomOutput & { tasks: T[] } = {
    summary: "Two open opportunities fit well: an agri-food accelerator closing in five weeks, and an export-readiness grant for small food producers.",
    findings: [
      { title: "Agri-food accelerator, cohort 6", detail: "Sample: equity-free programme for early-revenue food companies in East Africa. Closes in 5 weeks.", importance: "high", source_urls: ["https://example.com/demo/agrifood-accelerator"] },
      { title: "Export readiness grant", detail: "Sample: covers certification and first shipment costs for small producers.", importance: "high", source_urls: ["https://example.com/demo/export-grant"] },
      { title: "City pitch competition", detail: "Sample: small cash prize and investor exposure; strong fit for your origin story.", importance: "low", source_urls: ["https://example.com/demo/pitch-night"] },
    ],
    tasks: [task("Start the accelerator application", "Draft the traction section using Stripe and Shopify numbers.", "high", 12)],
  };
  await addRun(
    db,
    kaffa,
    customKey(funding.id),
    fundingOutput,
    [src("agrifood-accelerator", "Agri-food accelerator cohort 6"), src("export-grant", "Export readiness grant"), src("pitch-night", "City pitch competition")],
    26,
    funding.id,
  );

  /* ---------------- Company 2: a service business with only model and search connected ---------------- */
  const [lumen] = await db
    .insert(companies)
    .values({
      ownerId,
      name: "Lumen Studio (demo)",
      website: "https://example.com/lumen",
      industry: "Brand and web design agency",
      country: "Nairobi, Kenya",
      stage: "Growing",
      teamSize: "6–20",
      revenueBand: "$10k–$50k / month",
      offering: "Brand identity, websites and product design for startups and growing SMEs.",
      businessModel: "Fixed-price projects plus monthly design retainers.",
      targetCustomers: "Funded startups and growing consumer brands in East Africa.",
      competitors: ["Northlight Creative", "Freelancers on global marketplaces"],
      goals: "Move half of revenue to retainers and win two regional enterprise clients.",
      challenges: "Lumpy project revenue and long sales cycles.",
      createdAt: hoursAgo(24 * 12),
    })
    .returning();
  await addConnections(db, lumen, [
    { service: "ai_model", config: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", researchModel: "", structuredMode: "json_schema" }, hints: { apiKey: "••••demo" } },
    { service: "web_search", config: { provider: "brave" }, hints: { apiKey: "••••demo" } },
  ]);

  const lumenGrowth: AgentOutputs["growth_gps"] = {
    summary: "Referrals bring steady projects, but only 18% of revenue is recurring. Packaging a retainer for existing clients is the fastest path to predictable growth. Connecting Stripe would replace these estimates with real numbers.",
    score: { value: 61, rationale: "Strong portfolio and referrals; revenue swings month to month." },
    priorities: [
      { title: "Offer a design retainer to the last 12 project clients", why: "Past clients already trust the team and keep needing small design work.", impact: "high", effort: "low", metric: "Retainer revenue as a share of total" },
      { title: "Publish three enterprise-grade case studies", why: "Enterprise buyers ask for proof of process and results.", impact: "medium", effort: "medium", metric: "Enterprise proposals requested" },
    ],
    risks: ["Two clients make up 40% of this quarter's revenue.", "Freelance marketplaces are pulling prices down on small jobs."],
    tasks: [
      task("Draft a 3-tier monthly retainer offer", "Define hours, response times and price for each tier.", "high", 7),
      task("Write the fintech rebrand case study", "Problem, process, results, with a client quote.", "medium", 14),
    ],
  };
  await addRun(db, lumen, "growth_gps", lumenGrowth as unknown as { tasks: T[] }, [], 5);

  const lumenCompetitors: AgentOutputs["competitor_radar"] = {
    summary: "Local agencies compete on portfolio and relationships; global freelancers win on price. Lumen's gap is enterprise-ready process and retainers.",
    score: { value: 63, rationale: "Better design quality than most local rivals; weaker enterprise credentials." },
    competitors: [
      {
        name: "Northlight Creative",
        website: "https://example.com/demo/northlight",
        positioning: "Full-service agency for banks and telecoms.",
        pricing: "Not public",
        strengths: ["Enterprise clients", "Large team"],
        weaknesses: ["Slow turnaround", "Dated digital work"],
        recent_moves: "Sample: hired a new head of digital.",
        threat: "high",
        source_urls: ["https://example.com/demo/northlight"],
      },
      { name: "Freelancers on global marketplaces", website: "", positioning: "Low-cost logo and web work.", pricing: "Often 60–80% cheaper", strengths: ["Price", "Speed"], weaknesses: ["No strategy", "Inconsistent quality"], recent_moves: "No recent moves found.", threat: "medium", source_urls: [] },
    ],
    gaps_to_win: ["Fast, modern digital work for enterprise teams", "Design retainers with clear response times"],
    tasks: [task("Pitch a digital refresh to one Northlight client", "Lead with speed and a two-week sprint offer.", "medium", 21)],
  };
  await addRun(db, lumen, "competitor_radar", lumenCompetitors as unknown as { tasks: T[] }, [src("northlight", "Northlight Creative website")], 6);

  const lumenTrends: AgentOutputs["trend_hawk"] = {
    summary: "Startup funding in the region is recovering and more consumer brands are rebranding for export markets.",
    score: { value: 66, rationale: "Improving demand for brand work, with tighter budgets for large projects." },
    signals: [
      { trend: "Regional startup funding recovering", evidence: "Sample: funding rounds up quarter over quarter.", source_urls: ["https://example.com/demo/startup-funding"], relevance: "high", opportunity: "Offer a launch-ready brand package for newly funded startups.", time_horizon: "now" },
      { trend: "Consumer brands preparing for export", evidence: "Sample: more local brands entering regional retail chains.", source_urls: ["https://example.com/demo/export-brands"], relevance: "medium", opportunity: "Packaging and brand-system work for export-ready SKUs.", time_horizon: "3-6 months" },
    ],
    tasks: [task("Build a list of startups that raised this quarter", "Reach out with a brand audit offer.", "medium", 10)],
  };
  await addRun(db, lumen, "trend_hawk", lumenTrends as unknown as { tasks: T[] }, [src("startup-funding", "Regional startup funding tracker"), src("export-brands", "Local brands in regional retail")], 8);

  await db.insert(customAgents).values({
    companyId: lumen.id,
    name: "Hiring Advisor",
    role: "Advises on the next hires, roles and timing based on our goals and team size.",
    instructions: "Look at our goals, stage, team size and challenges. Decide which role we should hire next and which work we should outsource instead.",
    tools: ["web_search"],
    scoring: true,
    scoreLabel: "Team readiness",
    schedule: "manual",
  });

  return { companyIds: [kaffa.id, lumen.id] };
}
