import { z } from "zod";
import type { AgentId } from "./registry";

/**
 * Output contracts for each agent. These are sent to Claude as structured-output JSON schemas,
 * so they stick to plain objects, strings, numbers, enums and arrays. Ranges (like 0–100) are
 * described in text and enforced in code after parsing.
 */

const level = z.enum(["high", "medium", "low"]);

const score = z.object({
  value: z.number().describe("0 to 100, where 100 is excellent"),
  rationale: z.string().describe("One or two sentences explaining the score"),
});

const task = z.object({
  title: z.string().describe("Imperative, specific, under 90 characters"),
  detail: z.string().describe("How to do it, in two or three sentences"),
  priority: level,
  due_in_days: z.number().describe("Whole days from today, 1 to 30"),
});

export const growthGpsSchema = z.object({
  summary: z.string(),
  score,
  priorities: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      impact: level,
      effort: level,
      metric: z.string().describe("The number to watch to know it's working"),
    }),
  ),
  risks: z.array(z.string()),
  tasks: z.array(task),
});

export const paralegalSchema = z.object({
  summary: z.string(),
  jurisdiction: z.string().describe("The legal jurisdiction this checklist assumes"),
  score,
  checklist: z.array(
    z.object({
      area: z.string().describe("For example: registration, tax, employment, data protection, contracts, IP, licensing"),
      requirement: z.string(),
      likely_status: z.enum(["likely_done", "unknown", "likely_missing"]),
      risk: level,
      action: z.string(),
    }),
  ),
  documents: z.array(z.object({ name: z.string(), purpose: z.string() })),
  questions_for_a_lawyer: z.array(z.string()),
  tasks: z.array(task),
});

export const trendHawkSchema = z.object({
  summary: z.string(),
  score,
  signals: z.array(
    z.object({
      trend: z.string(),
      evidence: z.string().describe("What was observed, with dates where known"),
      source_urls: z.array(z.string()).describe("URLs from the research sources only"),
      relevance: level,
      opportunity: z.string().describe("What this company could do about it"),
      time_horizon: z.enum(["now", "3-6 months", "6-18 months"]),
    }),
  ),
  tasks: z.array(task),
});

export const competitorRadarSchema = z.object({
  summary: z.string(),
  score,
  competitors: z.array(
    z.object({
      name: z.string(),
      website: z.string(),
      positioning: z.string(),
      pricing: z.string().describe("What is publicly known, or 'Not public'"),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      recent_moves: z.string(),
      threat: level,
      source_urls: z.array(z.string()).describe("URLs from the research sources only"),
    }),
  ),
  gaps_to_win: z.array(z.string()),
  tasks: z.array(task),
});

export const operationalRadarSchema = z.object({
  summary: z.string(),
  score,
  areas: z.array(
    z.object({
      area: z.string().describe("For example: sales, delivery, finance, hiring, support, tooling"),
      finding: z.string(),
      risk: level,
      recommendation: z.string(),
    }),
  ),
  automations: z.array(z.object({ process: z.string(), how: z.string(), hours_saved_per_month: z.number() })),
  tasks: z.array(task),
});

/** Output for agents owners build themselves: a summary, findings and tasks, with an optional score. */
const finding = z.object({
  title: z.string(),
  detail: z.string(),
  importance: level,
  source_urls: z.array(z.string()).describe("URLs from the research sources only; empty if none"),
});

export const customScoredSchema = z.object({ summary: z.string(), score, findings: z.array(finding), tasks: z.array(task) });
export const customPlainSchema = z.object({ summary: z.string(), findings: z.array(finding), tasks: z.array(task) });
export type CustomOutput = z.infer<typeof customPlainSchema> & { score?: z.infer<typeof score> };

export function normalizeCustomOutput(output: CustomOutput, allowedUrls?: Set<string>): CustomOutput {
  const o = structuredClone(output);
  if (o.score) o.score.value = clamp(o.score.value, 0, 100);
  o.tasks = o.tasks.slice(0, 8).map((t) => ({ ...t, due_in_days: clamp(t.due_in_days, 1, 30) }));
  o.findings = o.findings.slice(0, 12).map((f) => ({ ...f, source_urls: allowedUrls ? f.source_urls.filter((u) => allowedUrls.has(u)) : [] }));
  return o;
}

export const AGENT_SCHEMAS = {
  growth_gps: growthGpsSchema,
  paralegal: paralegalSchema,
  trend_hawk: trendHawkSchema,
  competitor_radar: competitorRadarSchema,
  operational_radar: operationalRadarSchema,
} satisfies Record<AgentId, z.ZodTypeAny>;

export type AgentOutputs = { [K in AgentId]: z.infer<(typeof AGENT_SCHEMAS)[K]> };
export type AgentTask = z.infer<typeof task>;
export type AgentOutput = AgentOutputs[AgentId];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

/** Enforce the ranges the schema can only describe, and keep only source URLs that research actually returned. */
export function normalizeOutput<K extends AgentId>(agent: K, output: AgentOutputs[K], allowedUrls?: Set<string>): AgentOutputs[K] {
  const o = structuredClone(output) as AgentOutputs[K] & { score: { value: number }; tasks: AgentTask[] };
  o.score.value = clamp(o.score.value, 0, 100);
  o.tasks = o.tasks.slice(0, 8).map((t) => ({ ...t, due_in_days: clamp(t.due_in_days, 1, 30) }));
  if (allowedUrls) {
    const keep = (urls: string[]) => urls.filter((u) => allowedUrls.has(u));
    if (agent === "trend_hawk") {
      const t = o as unknown as AgentOutputs["trend_hawk"];
      t.signals = t.signals.map((s) => ({ ...s, source_urls: keep(s.source_urls) }));
    }
    if (agent === "competitor_radar") {
      const c = o as unknown as AgentOutputs["competitor_radar"];
      c.competitors = c.competitors.map((x) => ({ ...x, source_urls: keep(x.source_urls) }));
    }
  }
  if (agent === "operational_radar") {
    const r = o as unknown as AgentOutputs["operational_radar"];
    r.automations = r.automations.map((a) => ({ ...a, hours_saved_per_month: clamp(a.hours_saved_per_month, 0, 400) }));
  }
  return o;
}
