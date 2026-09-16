import Link from "next/link";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS, customKey } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { latestRuns } from "@/agents/runner";
import { AgentGlyph, STATE_LABEL, agentState, type AgentState } from "@/components/app/AgentGlyph";
import { Icon } from "@/components/app/Icon";
import { NavLink } from "@/components/app/NavLink";
import { SignOutButton } from "@/components/app/SignOutButton";
import { listCustomAgents } from "@/lib/agents-data";
import { requireCompany } from "@/lib/session";
import "../app.css";

function AgentLink({ href, agentKey, name, state }: { href: string; agentKey: string; name: string; state: AgentState }) {
  return (
    <NavLink href={href} className="nav-agent">
      <AgentGlyph agentKey={agentKey} name={name} state={state} size={22} />
      <span className="nav-label">{name}</span>
      {(state === "working" || state === "failed") && <span className="sr-only"> ({STATE_LABEL[state]})</span>}
    </NavLink>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company } = await requireCompany();
  const db = await getDb();
  const [customs, latest] = await Promise.all([listCustomAgents(db, company.id), latestRuns(db, company.id)]);
  const working = Object.values(latest).filter((r) => r.status === "queued" || r.status === "running").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-top">
            <Link href="/dashboard" className="app-wordmark" aria-label="Budera dashboard">
              <span className="app-mark" aria-hidden="true" />
              Budera
            </Link>
            <span className={`sys-status mono${working ? " is-working" : ""}`}>
              <i aria-hidden="true" />
              {working ? `${working} working` : "Online"}
            </span>
          </div>
          <div className="sidebar-company">
            <span className="eyebrow">Company</span>
            <strong>{company.name}</strong>
          </div>
          <nav aria-label="App" className="sidebar-nav">
            <NavLink href="/dashboard">
              <Icon name="brief" />
              Brief
            </NavLink>
            <NavLink href="/tasks">
              <Icon name="tasks" />
              Tasks
            </NavLink>
            <NavLink href="/agents" exact>
              <Icon name="agents" />
              All agents
            </NavLink>
            <span className="nav-group">Built in</span>
            {AGENT_IDS.map((id) => (
              <AgentLink key={id} href={`/agents/${AGENTS[id].slug}`} agentKey={id} name={AGENTS[id].name} state={agentState(latest[id])} />
            ))}
            <span className="nav-group">Your agents</span>
            {customs.map((c) => (
              <AgentLink key={c.id} href={`/agents/custom/${c.id}`} agentKey={customKey(c.id)} name={c.name} state={agentState(latest[customKey(c.id)])} />
            ))}
            {customs.length < MAX_CUSTOM_AGENTS && (
              <Link href="/agents/new" className="nav-link nav-new">
                <Icon name="plus" />
                New agent
              </Link>
            )}
            <span className="nav-group">Account</span>
            <NavLink href="/settings">
              <Icon name="settings" />
              Settings
            </NavLink>
            <SignOutButton>
              <Icon name="signout" />
            </SignOutButton>
          </nav>
          <p className="sidebar-user">{user.email}</p>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
