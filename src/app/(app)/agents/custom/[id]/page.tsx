import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { agentRuns, customAgents, tasks } from "@/db/schema";
import { customKey, customNeeds, customWorkflow } from "@/agents/registry";
import { expireStaleRuns } from "@/agents/runner";
import type { CustomOutput } from "@/agents/schemas";
import { TOOL_INFO, type Source, type ToolId } from "@/tools/meta";
import { CustomReport } from "@/components/app/AgentReport";
import { AgentGlyph, agentState } from "@/components/app/AgentGlyph";
import { AgentPlaybook } from "@/components/app/AgentPlaybook";
import { serviceStates } from "@/connections/status";
import { listConnections } from "@/connections/store";
import { RunButton } from "@/components/app/RunButton";
import { TaskList } from "@/components/app/TaskList";
import { byPriorityThenDue, dueLabel, relativeTime, scoreBand } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custom agent" };

const SCHEDULE = { manual: "Runs when you press Run", daily: "Runs daily", weekly: "Runs weekly" } as Record<string, string>;

export default async function CustomAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { company } = await requireCompany();
  const db = await getDb();
  const [agent] = await db.select().from(customAgents).where(and(eq(customAgents.id, id), eq(customAgents.companyId, company.id))).limit(1);
  if (!agent) notFound();

  await expireStaleRuns(db, company.id);
  const key = customKey(agent.id);
  const runs = await db.select().from(agentRuns).where(and(eq(agentRuns.companyId, company.id), eq(agentRuns.agentKey, key))).orderBy(desc(agentRuns.createdAt)).limit(12);
  const agentTasks = await db.select().from(tasks).where(and(eq(tasks.companyId, company.id), eq(tasks.agentKey, key))).orderBy(desc(tasks.createdAt)).limit(30);
  const latest = runs[0];
  const report = runs.find((r) => r.status === "succeeded");
  const busy = latest?.status === "queued" || latest?.status === "running";
  const output = report?.output as CustomOutput | undefined;
  const sources = (report?.sources ?? []) as Source[];
  const states = serviceStates(await listConnections(db, company.id));

  return (
    <div className="page">
      <header className="page-head">
        <div className="agent-id">
          <AgentGlyph agentKey={key} name={agent.name} state={agentState(latest, Boolean(report))} size={64} />
          <div>
            <p className="eyebrow">
              <Link href="/agents">Your agents</Link> · {SCHEDULE[agent.schedule] ?? "Manual"}
            </p>
            <h1>{agent.name}</h1>
            <p className="page-sub">{agent.role}</p>
            <p className="agent-tools mono">
              {agent.tools.length ? (
                agent.tools.map((t) => (
                  <span key={t} className="tool-tag">
                    {TOOL_INFO[t as ToolId]?.label ?? t}
                  </span>
                ))
              ) : (
                <span className="tool-tag plain">Works from your company profile</span>
              )}
              {agent.model && <span className="tool-tag plain">model {agent.model}</span>}
            </p>
          </div>
        </div>
        <div className="head-actions">
          <Link href={`/agents/custom/${agent.id}/edit`} className="btn btn-ghost">
            Edit
          </Link>
          <RunButton agents={[key]} label={report ? "Run again" : `Run ${agent.name}`} initiallyRunning={busy} />
        </div>
      </header>

      {latest?.status === "failed" && latest.error && (
        <p className="form-alert" role="alert">
          The last run failed: {latest.error}
        </p>
      )}

      {!report || !output ? (
        <section className="panel empty-state">
          <h2>{busy ? "Working on the first report" : "No report yet"}</h2>
          <p>{busy ? "Researching and writing it up. This usually takes one to four minutes." : "Press Run to get this agent's first report."}</p>
        </section>
      ) : (
        <>
          <section className={`panel report-head${output.score ? "" : " no-score"}`}>
            {output.score && (
              <div className={`big-score band-${scoreBand(output.score.value)}`} style={{ "--v": output.score.value } as CSSProperties}>
                <span className="big-score-value">{output.score.value}</span>
                <span className="big-score-label">{agent.scoreLabel || "Score"}</span>
              </div>
            )}
            <div className="report-summary">
              <p className="report-lede">{output.summary}</p>
              {output.score && <p className="muted">{output.score.rationale}</p>}
              <p className="report-stamp mono">
                Updated {report.finishedAt ? relativeTime(report.finishedAt) : ""}
                {sources.length > 0 ? ` · ${sources.length} sources` : ""}
              </p>
            </div>
          </section>

          <CustomReport output={output} sources={sources} />

          <section className="panel">
            <header className="panel-head">
              <h2>Tasks from {agent.name}</h2>
            </header>
            <TaskList
              showAgent={false}
              tasks={[...agentTasks]
                .sort((a, b) => (a.status === b.status ? byPriorityThenDue(a, b) : a.status === "open" ? -1 : 1))
                .map((t) => ({ id: t.id, agentName: agent.name, title: t.title, detail: t.detail, priority: t.priority, status: t.status, dueLabel: dueLabel(t.createdAt, t.dueInDays, t.status, t.completedAt) }))}
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

      <AgentPlaybook name={agent.name} steps={customWorkflow(agent)} needs={customNeeds(agent.tools)} states={states} />

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
                <span className="muted">
                  {r.status === "succeeded" && (r.output as CustomOutput | null)?.score ? `Score ${(r.output as CustomOutput).score!.value}` : r.status === "failed" ? r.error ?? "" : r.model ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
