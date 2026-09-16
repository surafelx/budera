import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentRuns, tasks } from "@/db/schema";
import { agentBySlug } from "@/agents/registry";
import { expireStaleRuns } from "@/agents/runner";
import { TOOL_INFO, type Source } from "@/tools/meta";
import { AgentReport } from "@/components/app/AgentReport";
import { AgentGlyph, agentState } from "@/components/app/AgentGlyph";
import { RunButton } from "@/components/app/RunButton";
import { TaskList } from "@/components/app/TaskList";
import { byPriorityThenDue, dueLabel, relativeTime, scoreBand } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const meta = agentBySlug((await params).slug);
  return { title: meta?.name ?? "Agent" };
}

export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const meta = agentBySlug((await params).slug);
  if (!meta) notFound();
  const { company } = await requireCompany();
  const db = await getDb();
  await expireStaleRuns(db, company.id);

  const runs = await db.select().from(agentRuns).where(and(eq(agentRuns.companyId, company.id), eq(agentRuns.agentKey, meta.id))).orderBy(desc(agentRuns.createdAt)).limit(12);
  const latest = runs[0];
  const report = runs.find((r) => r.status === "succeeded");
  const agentTasks = await db.select().from(tasks).where(and(eq(tasks.companyId, company.id), eq(tasks.agentKey, meta.id))).orderBy(desc(tasks.createdAt)).limit(30);
  const busy = latest?.status === "queued" || latest?.status === "running";
  const output = report?.output as { summary: string; score: { value: number; rationale: string } } | undefined;
  const sources = (report?.sources ?? []) as Source[];

  return (
    <div className="page">
      <header className="page-head">
        <div className="agent-id">
          <AgentGlyph agentKey={meta.id} name={meta.name} state={agentState(latest, Boolean(report))} size={64} />
          <div>
            <p className="eyebrow">Built in · {meta.role}</p>
            <h1>{meta.name}</h1>
            <p className="page-sub">{meta.watches}</p>
            <p className="agent-tools mono">
              {meta.tools.length ? meta.tools.map((t) => <span key={t} className="tool-tag">{TOOL_INFO[t].label}</span>) : <span className="tool-tag plain">Works from your company profile</span>}
            </p>
          </div>
        </div>
        <RunButton agents={[meta.id]} label={report ? "Run again" : `Run ${meta.name}`} initiallyRunning={busy} />
      </header>

      {latest?.status === "failed" && latest.error && (
        <p className="form-alert" role="alert">
          The last run failed: {latest.error}
        </p>
      )}

      {!report || !output ? (
        <section className="panel empty-state">
          <h2>{busy ? "Working on your first report" : "No report yet"}</h2>
          <p>{busy ? (meta.tools.length ? "Researching the web and writing it up. This usually takes two to four minutes." : "This usually takes a minute or two.") : meta.returns}</p>
        </section>
      ) : (
        <>
          <section className="panel report-head">
            <div className={`big-score band-${scoreBand(output.score.value)}`} style={{ "--v": output.score.value } as CSSProperties}>
              <span className="big-score-value">{output.score.value}</span>
              <span className="big-score-label">{meta.scoreLabel}</span>
            </div>
            <div className="report-summary">
              <p className="report-lede">{output.summary}</p>
              <p className="muted">{output.score.rationale}</p>
              <p className="report-stamp mono">
                Updated {report.finishedAt ? relativeTime(report.finishedAt) : ""}
                {sources.length > 0 ? ` · ${sources.length} sources` : ""}
              </p>
            </div>
          </section>

          <AgentReport agent={meta.id} output={report.output} sources={sources} />

          <section className="panel">
            <header className="panel-head">
              <h2>Tasks from {meta.name}</h2>
            </header>
            <TaskList
              showAgent={false}
              tasks={[...agentTasks]
                .sort((a, b) => (a.status === b.status ? byPriorityThenDue(a, b) : a.status === "open" ? -1 : 1))
                .map((t) => ({ id: t.id, agentName: meta.name, title: t.title, detail: t.detail, priority: t.priority, status: t.status, dueLabel: dueLabel(t.createdAt, t.dueInDays, t.status, t.completedAt) }))}
              emptyText="No tasks from this agent."
            />
          </section>

          {sources.length > 0 && (
            <section className="panel">
              <details className="sources">
                <summary>All {sources.length} sources from this run</summary>
                <ol>
                  {sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </>
      )}

      {runs.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <h2>Run history</h2>
          </header>
          <ul className="history">
            {runs.map((r) => (
              <li key={r.id}>
                <span className={`pill ${r.status === "succeeded" ? "ok" : r.status === "failed" ? "fail" : "busy"}`}>{r.status}</span>
                <span>{relativeTime(r.createdAt)}</span>
                <span className="muted">{r.status === "succeeded" && r.output ? `Score ${(r.output as { score: { value: number } }).score.value}` : r.error ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
