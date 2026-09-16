import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { AGENT_IDS, AGENTS } from "@/agents/registry";
import { expireStaleRuns, latestRuns, latestSuccessfulRuns } from "@/agents/runner";
import type { AgentOutput } from "@/agents/schemas";
import { RunButton } from "@/components/app/RunButton";
import { TaskList } from "@/components/app/TaskList";
import { byPriorityThenDue, dueLabel, relativeTime, scoreBand } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Brief" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, company } = await requireCompany();
  const db = await getDb();
  await expireStaleRuns(db, company.id);
  const [latest, reports, openTasks] = await Promise.all([
    latestRuns(db, company.id),
    latestSuccessfulRuns(db, company.id),
    db.select().from(tasks).where(and(eq(tasks.companyId, company.id), eq(tasks.status, "open"))).orderBy(desc(tasks.createdAt)),
  ]);

  const anyRunning = AGENT_IDS.some((id) => latest[id]?.status === "queued" || latest[id]?.status === "running");
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
            {hasReports
              ? `Here's where ${company.name} stands, and what to do next.`
              : `Run your agents to get ${company.name}'s first brief. It takes a few minutes.`}
          </p>
        </div>
        <RunButton agents={[...AGENT_IDS]} label={hasReports ? "Run all agents again" : "Run all agents"} initiallyRunning={anyRunning} />
      </header>

      <section aria-label="Scores" className="scores">
        {AGENT_IDS.map((id) => {
          const meta = AGENTS[id];
          const report = reports[id];
          const run = latest[id];
          const out = report?.output as (AgentOutput & { score: { value: number; rationale: string } }) | undefined;
          const busy = run?.status === "queued" || run?.status === "running";
          const failed = run?.status === "failed";
          return (
            <Link key={id} href={`/agents/${meta.slug}`} className="score-tile">
              <div className="score-top">
                <span className="score-agent">{meta.name}</span>
                {busy ? <span className="pill busy">Working</span> : failed ? <span className="pill fail">Failed</span> : report ? <span className="pill ok">Ready</span> : <span className="pill none">Not run</span>}
              </div>
              {out ? (
                <>
                  <p className={`score-value band-${scoreBand(out.score.value)}`}>
                    {out.score.value}
                    <span>/100</span>
                  </p>
                  <p className="score-label">{meta.scoreLabel}</p>
                  <span className="score-bar" aria-hidden="true">
                    <i style={{ width: `${out.score.value}%` }} />
                  </span>
                  <p className="score-when mono">{report?.finishedAt ? relativeTime(report.finishedAt) : ""}</p>
                </>
              ) : (
                <p className="score-empty">{busy ? "Working on your first report…" : meta.returns}</p>
              )}
            </Link>
          );
        })}
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head row">
            <div>
              <h2>This week</h2>
              <p>The most urgent open tasks across all agents.</p>
            </div>
            <Link href="/tasks" className="btn btn-ghost btn-sm">All tasks ({openTasks.length})</Link>
          </header>
          <TaskList
            tasks={top.map((t) => ({
              id: t.id, agent: t.agent, title: t.title, detail: t.detail, priority: t.priority, status: t.status,
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
            {AGENT_IDS.map((id) => {
              const report = reports[id];
              const run = latest[id];
              return (
                <li key={id}>
                  <Link href={`/agents/${AGENTS[id].slug}`} className="summary-name">
                    {AGENTS[id].name}
                  </Link>
                  {run?.status === "failed" && run.error ? (
                    <p className="summary-error">{run.error}</p>
                  ) : report ? (
                    <p>{(report.output as { summary: string }).summary}</p>
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
