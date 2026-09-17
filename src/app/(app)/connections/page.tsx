import type { Metadata } from "next";
import { getDb } from "@/db";
import { AGENT_IDS, AGENTS, customKey, customNeeds } from "@/agents/registry";
import { SERVICE_IDS, SERVICES, type ServiceDef, type ServiceId } from "@/connections/catalog";
import { isUsable, readiness, serverFallbacks, serviceStates } from "@/connections/status";
import { listConnections } from "@/connections/store";
import { ConnectionCard } from "@/components/connections/ConnectionCard";
import { listCustomAgents } from "@/lib/agents-data";
import { isDemoUser } from "@/lib/demo";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

const CATEGORIES: { id: ServiceDef["category"]; title: string; blurb: string }[] = [
  { id: "Required", title: "Required", blurb: "Every agent needs a language model to think and write." },
  { id: "Research", title: "Research", blurb: "Lets agents look things up on the live web and cite sources." },
  { id: "Business data", title: "Business data", blurb: "Your own numbers, so reports use real revenue, orders and traffic instead of estimates." },
];

export default async function ConnectionsPage() {
  const { user, company } = await requireCompany();
  const db = await getDb();
  const [views, customs] = await Promise.all([listConnections(db, company.id), listCustomAgents(db, company.id)]);
  const states = serviceStates(views);
  const fallbacks = serverFallbacks();

  const agents = [
    ...AGENT_IDS.map((id) => ({ key: id as string, name: AGENTS[id].name, needs: AGENTS[id].needs })),
    ...customs.map((c) => ({ key: customKey(c.id), name: c.name, needs: customNeeds(c.tools) })),
  ];
  const usedBy = (service: ServiceId) =>
    agents.flatMap((a) => a.needs.filter((n) => n.service === service).map((n) => ({ key: a.key, name: a.name, need: n.need })));
  const readyCount = agents.filter((a) => readiness(a.needs, states).ready).length;
  const connectedCount = SERVICE_IDS.filter((s) => isUsable(states[s])).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Connections · {company.name}</p>
          <h1>What your agents can use</h1>
          <p className="page-sub">
            Connect a model, web search and your business data. Each agent uses what it needs, and its page shows exactly how. Settings belong to {company.name}; your other companies connect their own.
          </p>
        </div>
      </header>

      <section className="fleet" aria-label="Connection status">
        <p className={`fleet-live mono ${readyCount === agents.length ? "" : "is-working"}`}>
          <i aria-hidden="true" />
          {readyCount === agents.length ? "Every agent can run" : `${agents.length - readyCount} agent${agents.length - readyCount === 1 ? "" : "s"} need setup`}
        </p>
        <dl className="fleet-stats">
          <div>
            <dt>Services ready</dt>
            <dd>
              {connectedCount}/{SERVICE_IDS.length}
            </dd>
          </div>
          <div>
            <dt>Agents ready</dt>
            <dd>
              {readyCount}/{agents.length}
            </dd>
          </div>
          <div>
            <dt>Secrets</dt>
            <dd className="fleet-small">AES-256 encrypted</dd>
          </div>
        </dl>
      </section>

      {CATEGORIES.map((cat) => (
        <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="conn-section">
          <div className="section-title">
            <h2 id={`cat-${cat.id}`}>{cat.title}</h2>
            <span className="muted">{cat.blurb}</span>
          </div>
          <div className="conn-grid">
            {SERVICE_IDS.filter((s) => SERVICES[s].category === cat.id).map((s) => (
              <ConnectionCard
                key={s}
                service={s}
                initial={views.find((v) => v.service === s) ?? null}
                serverFallback={Boolean(fallbacks[s])}
                usedBy={usedBy(s)}
                readOnly={isDemoUser(user)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
