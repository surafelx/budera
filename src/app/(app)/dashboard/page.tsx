import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tasks, type AgentRun } from "@/db/schema";
import { AGENT_IDS, AGENTS, customKey } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { expireStaleRuns, latestRuns, latestSuccessfulRuns } from "@/agents/runner";
import { AgentGlyph, agentHue, agentState } from "@/components/app/AgentGlyph";
import { HandNote } from "@/components/app/HandNote";
import { RunButton } from "@/components/app/RunButton";
import { isUsable, serviceStates } from "@/connections/status";
import { listConnections } from "@/connections/store";
import { TaskList } from "@/components/app/TaskList";
import { agentHref, agentNames, allAgentKeys, listCustomAgents } from "@/lib/agents-data";
import { byPriorityThenDue, dueLabel, relativeTime, scoreBand } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Brief" };
export const dynamic = "force-dynamic";

type Scored = { summary: string; score?: { value: number; rationale: string } };

function Tile({ agentKey, href, name, run, report, scoreLabel, emptyText }: { agentKey: string; href: string; name: string; run?: AgentRun; report?: AgentRun; scoreLabel: string; emptyText: string }) {
  const out = report?.output as Scored | undefined;
  const state = agentState(run, Boolean(report));
  const busy = state === "working";
  return (
    <Link href={href} className={`score-tile state-${state}`} style={{ "--h": agentHue(agentKey) } as CSSProperties}>
      <div className="score-top">
        <AgentGlyph agentKey={agentKey} name={name} state={state} size={34} />
        {busy ? <span className="pill busy">Working</span> : state === "failed" ? <span className="pill fail">Failed</span> : report ? <span className="pill ok">Ready</span> : <span className="pill none">Idle</span>}
      </div>
      <span className="score-agent">{name}</span>
      {out?.score ? (
        <>
          <p className={`score-value band-${scoreBand(out.score.value)}`}>
            {out.score.value}
            <span>/100</span>
          </p>
          <p className="score-label">{scoreLabel}</p>
          <span className="score-bar" aria-hidden="true">
            <i style={{ width: `${out.score.value}%` }} />
          </span>
        </>
      ) : out ? (
        <p className="score-summary">{out.summary}</p>
      ) : (
        <p className="score-empty">{busy ? "Working on the first report…" : emptyText}</p>
      )}
      {report?.finishedAt && <p className="score-when mono">{relativeTime(report.finishedAt)}</p>}
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, company } = await requireCompany();
  const db = await getDb();
  await expireStaleRuns(db, company.id);
  const [latest, reports, openTasks, customs, views] = await Promise.all([
    latestRuns(db, company.id),
    latestSuccessfulRuns(db, company.id),
    db.select().from(tasks).where(and(eq(tasks.companyId, company.id), eq(tasks.status, "open"))).orderBy(desc(tasks.createdAt)),
    listCustomAgents(db, company.id),
    listConnections(db, company.id),
  ]);
  const modelReady = isUsable(serviceStates(views).ai_model);

  const keys = allAgentKeys(customs);
  const names = agentNames(customs);
  const anyRunning = keys.some((k) => latest[k]?.status === "queued" || latest[k]?.status === "running");
  const hasReports = Object.keys(reports).length > 0;
  const top = [...openTasks].sort(byPriorityThenDue).slice(0, 8);
  const working = keys.filter((k) => latest[k]?.status === "queued" || latest[k]?.status === "running").length;
  const failing = keys.filter((k) => latest[k]?.status === "failed").length;
  const highPriority = openTasks.filter((t) => t.priority === "high").length;
  const fleetState = working ? "is-working" : failing ? "is-failing" : hasReports ? "" : "is-idle";
  const fleetText = working ? `${working} agent${working === 1 ? "" : "s"} working` : failing ? `${failing} need${failing === 1 ? "s" : ""} attention` : hasReports ? "All agents standing by" : "Waiting for the first run";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>
            {greeting}, {user.name.split(" ")[0]}.
          </h1>
          <p className="page-sub">
            {hasReports ? `Here's where ${company.name} stands, and what to do next.` : `Run your agents to get ${company.name}'s first brief. It takes a few minutes.`}
          </p>
        </div>
        <div className="head-cta">
          {!hasReports && <HandNote arrow="right">one click runs them all</HandNote>}
          <RunButton agents={keys} label={hasReports ? "Run all agents again" : "Run all agents"} initiallyRunning={anyRunning} />
        </div>
      </header>

      {!modelReady && (
        <Link href="/connections#ai_model" className="build-callout setup-callout">
          <strong>Connect an AI model to run your agents.</strong>
          <span>Add an API key for OpenAI, OpenRouter, Groq or any OpenAI-compatible provider. Then connect web search and your business data so reports use real numbers.</span>
        </Link>
      )}

      <section className="fleet" aria-label="Agent status">
        <p className={`fleet-live mono ${fleetState}`} role="status">
          <i aria-hidden="true" />
          {fleetText}
        </p>
        <dl className="fleet-stats">
          <div>
            <dt>Agents</dt>
            <dd>{keys.length}</dd>
          </div>
          <div>
            <dt>Reports</dt>
            <dd>{Object.keys(reports).length}</dd>
          </div>
          <div>
            <dt>Open tasks</dt>
            <dd>{openTasks.length}</dd>
          </div>
          <div>
            <dt>High priority</dt>
            <dd className={highPriority ? "hot" : undefined}>{highPriority}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Built-in agents" className="scores">
        {AGENT_IDS.map((id) => (
          <Tile key={id} agentKey={id} href={agentHref(id)} name={AGENTS[id].name} run={latest[id]} report={reports[id]} scoreLabel={AGENTS[id].scoreLabel} emptyText={AGENTS[id].returns} />
        ))}
      </section>

      <section aria-labelledby="your-agents">
        <div className="section-title">
          <h2 id="your-agents">Your agents</h2>
          {customs.length < MAX_CUSTOM_AGENTS && (
            <Link href="/agents/new" className="btn btn-ghost btn-sm">
              Build an agent
            </Link>
          )}
        </div>
        {customs.length === 0 ? (
          <Link href="/agents/new" className="build-callout">
            <strong>Build an agent for a job only your business has.</strong>
            <span>A pricing analyst, a grant scout, a hiring advisor. Start from a template in under a minute.</span>
          </Link>
        ) : (
          <div className="scores">
            {customs.map((c) => {
              const k = customKey(c.id);
              return <Tile key={c.id} agentKey={k} href={agentHref(k)} name={c.name} run={latest[k]} report={reports[k]} scoreLabel={c.scoreLabel} emptyText={c.role} />;
            })}
          </div>
        )}
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head row">
            <div>
              <h2>This week</h2>
              <p>The most urgent open tasks across all agents.</p>
            </div>
            <Link href="/tasks" className="btn btn-ghost btn-sm">
              All tasks ({openTasks.length})
            </Link>
          </header>
          <TaskList
            tasks={top.map((t) => ({
              id: t.id,
              agentName: names[t.agentKey] ?? "Agent",
              title: t.title,
              detail: t.detail,
              priority: t.priority,
              status: t.status,
              dueLabel: dueLabel(t.createdAt, t.dueInDays, t.status, t.completedAt),
            }))}
            emptyText={hasReports ? "No open tasks. Nice work." : "Tasks from your agents will show up here."}
          />
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Summaries</h2>
            <p>One line from each agent's latest report.</p>
          </header>
          <ul className="summaries">
            {keys.map((k) => {
              const report = reports[k];
              const run = latest[k];
              return (
                <li key={k}>
                  <AgentGlyph agentKey={k} name={names[k]} size={26} />
                  <Link href={agentHref(k)} className="summary-name">
                    {names[k]}
                  </Link>
                  {run?.status === "failed" && run.error ? (
                    <p className="summary-error">{run.error}</p>
                  ) : report ? (
                    <p>{(report.output as Scored).summary}</p>
                  ) : (
                    <p className="muted">No report yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
