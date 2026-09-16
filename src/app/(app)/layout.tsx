import Link from "next/link";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS, customKey } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { latestRuns } from "@/agents/runner";
import { AccountMenu } from "@/components/app/AccountMenu";
import { AgentGlyph, STATE_LABEL, agentState } from "@/components/app/AgentGlyph";
import { CompanySwitcher } from "@/components/app/CompanySwitcher";
import { NavLink } from "@/components/app/NavLink";
import { listCustomAgents } from "@/lib/agents-data";
import { MAX_COMPANIES } from "@/lib/companies";
import { requireCompany } from "@/lib/session";
import "../app.css";

const DOCK_LIMIT = 8;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, companies } = await requireCompany();
  const db = await getDb();
  const [customs, latest] = await Promise.all([listCustomAgents(db, company.id), latestRuns(db, company.id)]);

  const agents = [
    ...AGENT_IDS.map((id) => ({ key: id, name: AGENTS[id].name, href: `/agents/${AGENTS[id].slug}` })),
    ...customs.map((c) => ({ key: customKey(c.id), name: c.name, href: `/agents/custom/${c.id}` })),
  ];
  const docked = agents.slice(0, DOCK_LIMIT);
  const hidden = agents.length - docked.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard" className="app-wordmark topbar-brand" aria-label="Budera dashboard">
            <span className="app-mark" aria-hidden="true" />
            <span className="topbar-brand-text">Budera</span>
          </Link>

          <CompanySwitcher companies={companies.map((c) => ({ id: c.id, name: c.name, industry: c.industry }))} activeId={company.id} max={MAX_COMPANIES} />

          <nav aria-label="App" className="tabs">
            <NavLink href="/dashboard" className="tab">
              Brief
            </NavLink>
            <NavLink href="/tasks" className="tab">
              Tasks
            </NavLink>
            <NavLink href="/agents" className="tab">
              Agents
            </NavLink>
            <NavLink href="/settings" className="tab">
              Settings
            </NavLink>
          </nav>

          <nav aria-label="Agents" className="dock">
            {docked.map((a) => {
              const state = agentState(latest[a.key]);
              return (
                <NavLink key={a.key} href={a.href} className="dock-link">
                  <AgentGlyph agentKey={a.key} name={a.name} state={state} size={30} />
                  <span className="dock-tip" role="tooltip">
                    {a.name}
                    <span className="dock-tip-state"> · {STATE_LABEL[state]}</span>
                  </span>
                </NavLink>
              );
            })}
            {hidden > 0 && (
              <Link href="/agents" className="dock-more mono" aria-label={`${hidden} more agents`}>
                +{hidden}
              </Link>
            )}
            {customs.length < MAX_CUSTOM_AGENTS && (
              <Link href="/agents/new" className="dock-add" aria-label="Build an agent">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </Link>
            )}
          </nav>

          <AccountMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
