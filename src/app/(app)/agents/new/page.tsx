import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { MAX_CUSTOM_AGENTS, TEMPLATES } from "@/agents/custom";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { listCustomAgents } from "@/lib/agents-data";
import { describeSetup } from "@/llm/config";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Build an agent" };
export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const { company } = await requireCompany();
  const customs = await listCustomAgents(await getDb(), company.id);
  const setup = describeSetup();

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/agents">Agents</Link> / New
          </p>
          <h1>Build an agent</h1>
          <p className="page-sub">Describe a job, give it instructions and tools, and it reports on {company.name} the same way the built-in agents do.</p>
        </div>
      </header>
      {customs.length >= MAX_CUSTOM_AGENTS ? (
        <p className="form-alert" role="alert">
          You already have {MAX_CUSTOM_AGENTS} custom agents. Delete one to build another.
        </p>
      ) : (
        <AgentBuilder mode="create" templates={TEMPLATES} searchAvailable={Boolean(setup.searchProvider)} schedulingEnabled={setup.schedulingEnabled} />
      )}
    </div>
  );
}
