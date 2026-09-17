import Link from "next/link";
import { SERVICES, type ServiceId, type ServiceNeed } from "@/connections/catalog";
import { readiness, type ServiceState } from "@/connections/status";
import { AgentGlyph } from "./AgentGlyph";

const NEED_LABEL = { required: "Required", recommended: "Recommended", optional: "Optional" } as const;

export const STATE_TEXT: Record<ServiceState, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "ok" },
  server: { label: "Server default", tone: "ok" },
  demo: { label: "Sample", tone: "none" },
  error: { label: "Failed test", tone: "fail" },
  missing: { label: "Not connected", tone: "none" },
};

/** What an agent does on every run, and which connections it needs, with links to fix anything missing. */
export function AgentPlaybook({ name, steps, needs, states }: { name: string; steps: string[]; needs: ServiceNeed[]; states: Record<ServiceId, ServiceState> }) {
  const { ready, missingRequired } = readiness(needs, states);
  return (
    <section className="panel playbook" aria-labelledby="playbook-title">
      <header className="panel-head row">
        <div>
          <h2 id="playbook-title">How it works</h2>
          <p>What {name} does on every run, and the connections it uses.</p>
        </div>
        <span className={`pill ${ready ? "ok" : "fail"}`}>{ready ? "Ready to run" : `Needs ${missingRequired.map((s) => SERVICES[s].name).join(" and ")}`}</span>
      </header>
      <div className="playbook-grid">
        <ol className="playbook-steps">
          {steps.map((step, i) => (
            <li key={step}>
              <span className="builder-step mono" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <ul className="needs">
          {needs.map((n) => {
            const state = states[n.service];
            const text = STATE_TEXT[state];
            return (
              <li key={n.service} className="need">
                <AgentGlyph agentKey={`service:${n.service}`} name={SERVICES[n.service].name} size={32} />
                <div className="need-body">
                  <p className="need-title">
                    <strong>{SERVICES[n.service].name}</strong>
                    <span className={`need-tag need-${n.need}`}>{NEED_LABEL[n.need]}</span>
                  </p>
                  <p className="need-why">{n.why}</p>
                </div>
                <div className="need-state">
                  <span className={`pill ${text.tone}`}>{text.label}</span>
                  {(state === "missing" || state === "error") && (
                    <Link href={`/connections#${n.service}`} className="btn btn-ghost btn-sm">
                      {state === "error" ? "Fix" : "Connect"}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
