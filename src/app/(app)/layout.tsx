import Link from "next/link";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS } from "@/agents/registry";
import { MAX_CUSTOM_AGENTS } from "@/agents/custom";
import { NavLink } from "@/components/app/NavLink";
import { SignOutButton } from "@/components/app/SignOutButton";
import { listCustomAgents } from "@/lib/agents-data";
import { requireCompany } from "@/lib/session";
import "../app.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company } = await requireCompany();
  const customs = await listCustomAgents(await getDb(), company.id);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="app-wordmark" aria-label="Budera dashboard">
          <span className="app-mark" aria-hidden="true" />
          Budera
        </Link>
        <div className="sidebar-company">
          <span className="eyebrow on-ink">Company</span>
          <strong>{company.name}</strong>
        </div>
        <nav aria-label="App" className="sidebar-nav">
          <NavLink href="/dashboard">Brief</NavLink>
          <NavLink href="/tasks">Tasks</NavLink>
          <NavLink href="/agents" exact>All agents</NavLink>
          <span className="nav-group mono">Built in</span>
          {AGENT_IDS.map((id) => (
            <NavLink key={id} href={`/agents/${AGENTS[id].slug}`}>
              {AGENTS[id].name}
            </NavLink>
          ))}
          <span className="nav-group mono">Your agents</span>
          {customs.map((c) => (
            <NavLink key={c.id} href={`/agents/custom/${c.id}`}>
              {c.name}
            </NavLink>
          ))}
          {customs.length < MAX_CUSTOM_AGENTS && (
            <Link href="/agents/new" className="nav-link nav-new">
              + New agent
            </Link>
          )}
          <span className="nav-group mono">Account</span>
          <NavLink href="/settings">Settings</NavLink>
          <SignOutButton />
        </nav>
        <p className="sidebar-user">{user.email}</p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
