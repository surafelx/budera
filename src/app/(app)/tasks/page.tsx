import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { TaskList } from "@/components/app/TaskList";
import { agentNames, allAgentKeys, listCustomAgents } from "@/lib/agents-data";
import { byPriorityThenDue, dueLabel } from "@/lib/format";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ agent?: string; show?: string }> }) {
  const { company } = await requireCompany();
  const { agent: agentParam, show } = await searchParams;
  const db = await getDb();
  const customs = await listCustomAgents(db, company.id);
  const keys = allAgentKeys(customs);
  const names = agentNames(customs);
  const agent = agentParam && keys.includes(agentParam) ? agentParam : undefined;
  const showDone = show === "done";

  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.companyId, company.id), eq(tasks.status, showDone ? "done" : "open"), agent ? eq(tasks.agentKey, agent) : undefined))
    .orderBy(desc(showDone ? tasks.completedAt : tasks.createdAt))
    .limit(200);
  const list = showDone ? rows : [...rows].sort(byPriorityThenDue);

  const href = (params: { agent?: string; show?: string }) => {
    const q = new URLSearchParams();
    if (params.agent) q.set("agent", params.agent);
    if (params.show) q.set("show", params.show);
    const s = q.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>{showDone ? "Done" : "To do"}</h1>
          <p className="page-sub">When an agent runs again, its unfinished tasks are replaced with fresh ones. Finished tasks stay here.</p>
        </div>
      </header>

      <nav className="filters" aria-label="Filter tasks">
        <div className="segmented">
          <Link href={href({ agent })} className={!showDone ? "on" : ""} aria-current={!showDone ? "page" : undefined}>
            To do
          </Link>
          <Link href={href({ agent, show: "done" })} className={showDone ? "on" : ""} aria-current={showDone ? "page" : undefined}>
            Done
          </Link>
        </div>
        <div className="chips">
          <Link href={href({ show: showDone ? "done" : undefined })} className={!agent ? "on" : ""}>
            All agents
          </Link>
          {keys.map((k) => (
            <Link key={k} href={href({ agent: k, show: showDone ? "done" : undefined })} className={agent === k ? "on" : ""}>
              {names[k]}
            </Link>
          ))}
        </div>
      </nav>

      <section className="panel">
        <TaskList
          key={`${agent ?? "all"}-${showDone}`}
          showAgent={!agent}
          tasks={list.map((t) => ({
            id: t.id,
            agentName: names[t.agentKey] ?? "Agent",
            title: t.title,
            detail: t.detail,
            priority: t.priority,
            status: t.status,
            dueLabel: dueLabel(t.createdAt, t.dueInDays, t.status, t.completedAt),
          }))}
          emptyText={showDone ? "Nothing marked done yet." : "No open tasks here. Run an agent to get new ones."}
        />
      </section>
    </div>
  );
}
