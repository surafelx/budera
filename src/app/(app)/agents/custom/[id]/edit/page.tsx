import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customAgents } from "@/db/schema";
import { SCHEDULES, type Schedule } from "@/agents/custom";
import { TOOL_IDS, type ToolId } from "@/tools/meta";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { DeleteAgentButton } from "@/components/agents/DeleteAgentButton";
import { describeSetup } from "@/llm/config";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Edit agent" };
export const dynamic = "force-dynamic";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { company } = await requireCompany();
  const db = await getDb();
  const [agent] = await db.select().from(customAgents).where(and(eq(customAgents.id, id), eq(customAgents.companyId, company.id))).limit(1);
  if (!agent) notFound();
  const setup = describeSetup();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href={`/agents/custom/${agent.id}`}>{agent.name}</Link> / Edit
          </p>
          <h1>Edit {agent.name}</h1>
          <p className="page-sub">Changes apply from the next run. Existing reports stay as they were.</p>
        </div>
      </header>
      <AgentBuilder
        mode="edit"
        agentId={agent.id}
        searchAvailable={Boolean(setup.searchProvider)}
        schedulingEnabled={setup.schedulingEnabled}
        initial={{
          name: agent.name,
          role: agent.role,
          instructions: agent.instructions,
          tools: agent.tools.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t)),
          scoring: agent.scoring,
          scoreLabel: agent.scoreLabel,
          schedule: (SCHEDULES as readonly string[]).includes(agent.schedule) ? (agent.schedule as Schedule) : "manual",
          model: agent.model,
        }}
      />
      <DeleteAgentButton agentId={agent.id} name={agent.name} />
    </div>
  );
}
