import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS, customKey } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { latestSuccessfulRuns } from "@/agents/runner";
import { TOOL_INFO, type ToolId } from "@/tools/meta";
import { listCustomAgents } from "@/lib/agents-data";
import { relativeTime } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

const SCHEDULE = { manual: "Runs when you press Run", daily: "Runs daily", weekly: "Runs weekly" } as Record<string, string>;

export default async function AgentsPage() {
  const { company } = await requireCompany();
  const db = await getDb();
  const [customs, reports] = await Promise.all([listCustomAgents(db, company.id), latestSuccessfulRuns(db, company.id)]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Agents</p>
          <h1>Your legion</h1>
          <p className="page-sub">Five built-in specialists, plus agents you design for the jobs only your business has.</p>
        </div>
        {customs.length < MAX_CUSTOM_AGENTS && (
          <Link href="/agents/new" className="btn btn-primary">
            Build an agent
          </Link>
        )}
      </header>

      <section aria-labelledby="yours">
        <div className="section-title">
          <h2 id="yours">Your agents</h2>
          <span className="muted">
            {customs.length} of {MAX_CUSTOM_AGENTS}
          </span>
        </div>
        {customs.length === 0 ? (
          <div className="panel empty-state">
            <h3>Build the specialist you wish you had</h3>
            <p>A pricing analyst, a grant scout, a hiring advisor: give it a job and instructions, choose whether it can research the web, and it reports like the built-in agents.</p>
            <Link href="/agents/new" className="btn btn-primary">
              Build your first agent
            </Link>
          </div>
        ) : (
          <ul className="agent-cards">
            {customs.map((c) => {
              const report = reports[customKey(c.id)];
              return (
                <li key={c.id}>
                  <Link href={`/agents/custom/${c.id}`} className="agent-card">
                    <span className="eyebrow">Custom · {SCHEDULE[c.schedule] ?? "Manual"}</span>
                    <strong>{c.name}</strong>
                    <span className="agent-card-role">{c.role}</span>
                    <span className="agent-card-tools mono">
                      {c.tools.length ? c.tools.map((t) => TOOL_INFO[t as ToolId]?.label ?? t).join(" · ") : "Profile only"}
                    </span>
                    <span className="agent-card-when mono">{report?.finishedAt ? `Last report ${relativeTime(report.finishedAt)}` : "No report yet"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="builtin">
        <div className="section-title">
          <h2 id="builtin">Built in</h2>
        </div>
        <ul className="agent-cards">
          {AGENT_IDS.map((id) => {
            const a = AGENTS[id];
            const report = reports[id];
            return (
              <li key={id}>
                <Link href={`/agents/${a.slug}`} className="agent-card">
                  <span className="eyebrow">{a.role}</span>
                  <strong>{a.name}</strong>
                  <span className="agent-card-role">{a.returns}</span>
                  <span className="agent-card-tools mono">{a.tools.length ? a.tools.map((t) => TOOL_INFO[t].label).join(" · ") : "Profile only"}</span>
                  <span className="agent-card-when mono">{report?.finishedAt ? `Last report ${relativeTime(report.finishedAt)}` : "No report yet"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
