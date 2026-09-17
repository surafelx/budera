import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS, customKey, customNeeds } from "@/agents/registry";
import { readiness, serviceStates } from "@/connections/status";
import { listConnections } from "@/connections/store";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { latestRuns, latestSuccessfulRuns } from "@/agents/runner";
import { AgentGlyph, agentHue, agentState } from "@/components/app/AgentGlyph";
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
  const [customs, reports, latest, views] = await Promise.all([listCustomAgents(db, company.id), latestSuccessfulRuns(db, company.id), latestRuns(db, company.id), listConnections(db, company.id)]);
  const states = serviceStates(views);
  const setupTag = (needs: Parameters<typeof readiness>[0]) => (readiness(needs, states).ready ? <span className="eyebrow">Ready</span> : <span className="pill fail">Needs setup</span>);

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
              const k = customKey(c.id);
              const report = reports[k];
              return (
                <li key={c.id}>
                  <Link href={`/agents/custom/${c.id}`} className="agent-card" style={{ "--h": agentHue(k) } as CSSProperties}>
                    <span className="agent-card-top">
                      <AgentGlyph agentKey={k} name={c.name} state={agentState(latest[k], Boolean(report))} size={40} />
                      {readiness(customNeeds(c.tools), states).ready ? <span className="eyebrow">{SCHEDULE[c.schedule] ?? "Manual"}</span> : setupTag(customNeeds(c.tools))}
                    </span>
                    <strong>{c.name}</strong>
                    <span className="agent-card-role">{c.role}</span>
                    <span className={`agent-card-tools mono${c.tools.length ? "" : " plain"}`}>
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
                <Link href={`/agents/${a.slug}`} className="agent-card" style={{ "--h": agentHue(id) } as CSSProperties}>
                  <span className="agent-card-top">
                    <AgentGlyph agentKey={id} name={a.name} state={agentState(latest[id], Boolean(report))} size={40} />
                    {setupTag(a.needs)}
                  </span>
                  <strong>{a.name}</strong>
                  <span className="agent-card-role">{a.returns}</span>
                  <span className={`agent-card-tools mono${a.tools.length ? "" : " plain"}`}>{a.tools.length ? a.tools.map((t) => TOOL_INFO[t].label).join(" · ") : "Profile only"}</span>
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
