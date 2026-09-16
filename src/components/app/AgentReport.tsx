import type { AgentId } from "@/agents/registry";
import type { AgentOutputs, CustomOutput } from "@/agents/schemas";
import type { Source } from "@/tools/meta";

const LevelTag = ({ level, label }: { level: "high" | "medium" | "low"; label?: string }) => (
  <span className={`level-tag level-${level}`}>{label ? `${label}: ${level}` : level}</span>
);

function SourceLinks({ urls, sources }: { urls: string[]; sources: Source[] }) {
  if (urls.length === 0) return null;
  const titleFor = (u: string) => sources.find((s) => s.url === u)?.title ?? new URL(u).hostname;
  return (
    <ul className="source-links">
      {urls.map((u) => (
        <li key={u}>
          <a href={u} target="_blank" rel="noopener noreferrer">
            {titleFor(u)}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Report body for agents owners build: findings ranked by importance, with sources where research found them. */
export function CustomReport({ output, sources }: { output: unknown; sources: Source[] }) {
  const o = output as CustomOutput;
  if (o.findings.length === 0) return null;
  return (
    <section className="panel">
      <header className="panel-head"><h2>Findings</h2></header>
      <ol className="report-list">
        {o.findings.map((f) => (
          <li key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.detail}</p>
            <p className="report-meta"><LevelTag level={f.importance} label="Importance" /></p>
            <SourceLinks urls={f.source_urls} sources={sources} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AgentReport({ agent, output, sources }: { agent: AgentId; output: unknown; sources: Source[] }) {
  switch (agent) {
    case "growth_gps": {
      const o = output as AgentOutputs["growth_gps"];
      return (
        <>
          <section className="panel">
            <header className="panel-head"><h2>Priorities</h2><p>The moves with the best impact for the effort.</p></header>
            <ol className="report-list">
              {o.priorities.map((p) => (
                <li key={p.title}>
                  <h3>{p.title}</h3>
                  <p>{p.why}</p>
                  <p className="report-meta">
                    <LevelTag level={p.impact} label="Impact" />
                    <LevelTag level={p.effort} label="Effort" />
                    <span className="mono">Watch: {p.metric}</span>
                  </p>
                </li>
              ))}
            </ol>
          </section>
          {o.risks.length > 0 && (
            <section className="panel">
              <header className="panel-head"><h2>Risks</h2></header>
              <ul className="plain-list">{o.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}
        </>
      );
    }

    case "paralegal": {
      const o = output as AgentOutputs["paralegal"];
      const statusText = { likely_done: "Looks done", unknown: "Unknown", likely_missing: "Looks missing" } as const;
      return (
        <>
          <p className="disclaimer">
            Assumes <strong>{o.jurisdiction}</strong>. This is a starting checklist, not legal advice. Confirm high-risk items with a qualified local lawyer.
          </p>
          <section className="panel">
            <header className="panel-head"><h2>Compliance checklist</h2><p>Sorted as the agent ranked them.</p></header>
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr><th>Area</th><th>Requirement</th><th>Status</th><th>Risk</th><th>What to do</th></tr>
                </thead>
                <tbody>
                  {o.checklist.map((c) => (
                    <tr key={`${c.area}-${c.requirement}`}>
                      <td>{c.area}</td>
                      <td>{c.requirement}</td>
                      <td><span className={`status-tag status-${c.likely_status}`}>{statusText[c.likely_status]}</span></td>
                      <td><LevelTag level={c.risk} /></td>
                      <td>{c.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="two-col">
            <section className="panel">
              <header className="panel-head"><h2>Documents to prepare</h2></header>
              <ul className="plain-list">{o.documents.map((d) => <li key={d.name}><strong>{d.name}</strong>: {d.purpose}</li>)}</ul>
            </section>
            <section className="panel">
              <header className="panel-head"><h2>Ask a lawyer</h2></header>
              <ul className="plain-list">{o.questions_for_a_lawyer.map((q) => <li key={q}>{q}</li>)}</ul>
            </section>
          </div>
        </>
      );
    }

    case "trend_hawk": {
      const o = output as AgentOutputs["trend_hawk"];
      return (
        <section className="panel">
          <header className="panel-head"><h2>Signals</h2><p>Found by searching the web during this run.</p></header>
          <ol className="report-list">
            {o.signals.map((s) => (
              <li key={s.trend}>
                <h3>{s.trend}</h3>
                <p>{s.evidence}</p>
                <p className="report-opportunity"><strong>Opportunity:</strong> {s.opportunity}</p>
                <p className="report-meta">
                  <LevelTag level={s.relevance} label="Relevance" />
                  <span className="mono">Horizon: {s.time_horizon}</span>
                </p>
                <SourceLinks urls={s.source_urls} sources={sources} />
              </li>
            ))}
          </ol>
        </section>
      );
    }

    case "competitor_radar": {
      const o = output as AgentOutputs["competitor_radar"];
      return (
        <>
          <section className="panel">
            <header className="panel-head"><h2>Competitors</h2><p>Found by searching the web during this run.</p></header>
            <div className="competitors">
              {o.competitors.map((c) => (
                <article key={c.name} className="competitor">
                  <header>
                    <h3>{c.name}</h3>
                    <LevelTag level={c.threat} label="Threat" />
                  </header>
                  {c.website && /^https?:\/\//.test(c.website) && (
                    <a className="mono competitor-site" href={c.website} target="_blank" rel="noopener noreferrer">{c.website.replace(/^https?:\/\//, "")}</a>
                  )}
                  <p>{c.positioning}</p>
                  <dl>
                    <dt>Pricing</dt><dd>{c.pricing}</dd>
                    <dt>Recent moves</dt><dd>{c.recent_moves}</dd>
                    <dt>Strengths</dt><dd>{c.strengths.join("; ")}</dd>
                    <dt>Weaknesses</dt><dd>{c.weaknesses.join("; ")}</dd>
                  </dl>
                  <SourceLinks urls={c.source_urls} sources={sources} />
                </article>
              ))}
            </div>
          </section>
          {o.gaps_to_win.length > 0 && (
            <section className="panel">
              <header className="panel-head"><h2>Gaps you can win</h2></header>
              <ul className="plain-list">{o.gaps_to_win.map((g) => <li key={g}>{g}</li>)}</ul>
            </section>
          )}
        </>
      );
    }

    case "operational_radar": {
      const o = output as AgentOutputs["operational_radar"];
      const hours = o.automations.reduce((n, a) => n + a.hours_saved_per_month, 0);
      return (
        <>
          <section className="panel">
            <header className="panel-head"><h2>Operations check</h2></header>
            <ol className="report-list">
              {o.areas.map((a) => (
                <li key={a.area}>
                  <h3>{a.area}</h3>
                  <p>{a.finding}</p>
                  <p className="report-opportunity"><strong>Fix:</strong> {a.recommendation}</p>
                  <p className="report-meta"><LevelTag level={a.risk} label="Risk" /></p>
                </li>
              ))}
            </ol>
          </section>
          {o.automations.length > 0 && (
            <section className="panel">
              <header className="panel-head"><h2>Automate first</h2><p>About {hours} hours a month back, by the agent's estimate.</p></header>
              <div className="table-scroll">
                <table className="report-table">
                  <thead><tr><th>Process</th><th>How</th><th className="num">Hours / month</th></tr></thead>
                  <tbody>
                    {o.automations.map((a) => (
                      <tr key={a.process}><td>{a.process}</td><td>{a.how}</td><td className="num mono">{a.hours_saved_per_month}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      );
    }
  }
}
