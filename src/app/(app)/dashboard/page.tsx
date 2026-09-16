import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tasks, type AgentRun } from "@/db/schema";
import { AGENT_IDS, AGENTS, customKey } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { expireStaleRuns, latestRuns, latestSuccessfulRuns } from "@/agents/runner";
import { RunButton } from "@/components/app/RunButton";
import { TaskList } from "@/components/app/TaskList";
import { agentHref, agentNames, allAgentKeys, listCustomAgents } from "@/lib/agents-data";
import { byPriorityThenDue, dueLabel, relativeTime, scoreBand } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Brief" };
export const dynamic = "force-dynamic";

type Scored = { summary: string; score?: { value: number; rationale: string } };

function Tile({ href, name, run, report, scoreLabel, emptyText }: { href: string; name: string; run?: AgentRun; report?: AgentRun; scoreLabel: string; emptyText: string }) {
  const out = report?.output as Scored | undefined;
  const busy = run?.status === "queued" || run?.status === "running";
  const failed = run?.status === "failed";
  return (
    <Link href={href} className="score-tile">
      <div className="score-top">
        <span className="score-agent">{name}</span>
        {busy ? <span className="pill busy">Working</span> : failed ? <span className="pill fail">Failed</span> : report ? <span className="pill ok">Ready</span> : <span className="pill none">Not run</span>}
      </div>
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
  const [latest, reports, openTasks, customs] = await Promise.all([
    latestRuns(db, company.id),
    latestSuccessfulRuns(db, company.id),
    db.select().from(tasks).where(and(eq(tasks.companyId, company.id), eq(tasks.status, "open"))).orderBy(desc(tasks.createdAt)),
    listCustomAgents(db, company.id),
  ]);

  const keys = allAgentKeys(customs);
  const names = agentNames(customs);
  const anyRunning = keys.some((k) => latest[k]?.status === "queued" || latest[k]?.status === "running");
  const hasReports = Object.keys(reports).length > 0;
  const top = [...openTasks].sort(byPriorityThenDue).slice(0, 8);
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
        <RunButton agents={keys} label={hasReports ? "Run all agents again" : "Run all agents"} initiallyRunning={anyRunning} />
      </header>

      <section aria-label="Built-in agents" className="scores">
        {AGENT_IDS.map((id) => (
          <Tile key={id} href={agentHref(id)} name={AGENTS[id].name} run={latest[id]} report={reports[id]} scoreLabel={AGENTS[id].scoreLabel} emptyText={AGENTS[id].returns} />
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
              return <Tile key={c.id} href={agentHref(k)} name={c.name} run={latest[k]} report={reports[k]} scoreLabel={c.scoreLabel} emptyText={c.role} />;
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
