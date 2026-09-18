"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { AgentTemplate, CustomAgentInput } from "@/agents/custom";
import { SERVICES } from "@/connections/catalog";
import { TOOL_IDS, TOOL_INFO, type ToolId } from "@/tools/meta";
import { AgentGlyph } from "@/components/app/AgentGlyph";
import { HandNote } from "@/components/app/HandNote";

const EMPTY: CustomAgentInput = { name: "", role: "", instructions: "", tools: [], scoring: false, scoreLabel: "", schedule: "manual", model: "" };

const SCHEDULE_TEXT = {
  manual: { label: "When I run it", hint: "Runs only when you press Run." },
  daily: { label: "Every day", hint: "Runs once a day, early morning UTC." },
  weekly: { label: "Every week", hint: "Runs once a week." },
} as const;

export function AgentBuilder({
  mode,
  agentId,
  initial,
  templates = [],
  usableTools,
  schedulingEnabled,
}: {
  mode: "create" | "edit";
  agentId?: string;
  initial?: CustomAgentInput;
  templates?: AgentTemplate[];
  usableTools: ToolId[];
  schedulingEnabled: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [draft, setDraft] = useState<CustomAgentInput>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState("");

  const set = <K extends keyof CustomAgentInput>(key: K, value: CustomAgentInput[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const cls = (k: string) => `field${errors[k] ? " has-error" : ""}`;
  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;

  function applyTemplate(t: AgentTemplate) {
    setTemplate(t.id);
    setDraft(t.agent);
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAlert("");
    try {
      const res = await fetch(mode === "create" ? "/api/custom-agents" : `/api/custom-agents/${agentId}`, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as { error?: string; fields?: Record<string, string>; next?: string };
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setAlert(data.error ?? "Couldn't save the agent. Try again.");
        return;
      }
      router.push(data.next ?? "/agents");
      router.refresh();
    } catch {
      setAlert("Couldn't reach Budera. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="builder" onSubmit={submit} noValidate>
      <div className="builder-main">
        {mode === "create" && templates.length > 0 && (
          <section className="panel">
            <header className="panel-head">
              <h2>Start from a template</h2>
              <p>Pick one to fill in the form, then make it yours. Or start from scratch below.</p>
            </header>
            <div className="templates">
              {templates.map((t) => (
                <button key={t.id} type="button" className={`template${template === t.id ? " on" : ""}`} aria-pressed={template === t.id} onClick={() => applyTemplate(t)}>
                  <AgentGlyph agentKey={`template:${t.id}`} name={t.label} size={34} />
                  <span className="template-text">
                    <strong>{t.label}</strong>
                    <span>{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <header className="panel-head step-head">
            <span className="builder-step mono" aria-hidden="true">01</span>
            <div>
              <h2>Who it is</h2>
              <p>A name, a job and how it should think.</p>
            </div>
          </header>
          <div className="form-stack">
            <div className={cls("name")}>
              <label htmlFor={id("name")}>Name</label>
              <input id={id("name")} className="input" maxLength={40} placeholder="Pricing Analyst" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              {err("name")}
            </div>
            <div className={cls("role")}>
              <label htmlFor={id("role")}>Its job, in one sentence</label>
              <input id={id("role")} className="input" maxLength={160} placeholder="Reviews our pricing against the market and suggests changes." value={draft.role} onChange={(e) => set("role", e.target.value)} />
              {err("role")}
            </div>
            <div className={cls("instructions")}>
              <label htmlFor={id("instructions")}>Instructions</label>
              <textarea
                id={id("instructions")}
                className="textarea instructions"
                maxLength={4000}
                placeholder="What should it look at? How should it judge what it finds? What would a great result look like?"
                value={draft.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
              <span className="hint">
                The agent always sees your company profile, so you don't need to repeat it. {draft.instructions.length.toLocaleString()} / 4,000
              </span>
              {err("instructions")}
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head step-head">
            <span className="builder-step mono" aria-hidden="true">02</span>
            <div>
              <h2>What it can do</h2>
              <p>Agents without tools work from your company profile only.</p>
            </div>
          </header>
          <div className="toggles">
            {TOOL_IDS.map((t) => {
              const on = draft.tools.includes(t);
              const unavailable = !usableTools.includes(t);
            const service = TOOL_INFO[t].service;
              return (
                <label key={t} className={`toggle-row${unavailable ? " is-off" : ""}`}>
                  <input type="checkbox" className="switch" checked={on} onChange={() => set("tools", on ? draft.tools.filter((x) => x !== t) : [...draft.tools, t])} />
                  <span>
                    <strong>{TOOL_INFO[t].label}</strong>
                    <span className="hint">
                      {TOOL_INFO[t].description}
                      {unavailable && service && (
                      <>
                        {" "}
                        <a href={`/connections#${service}`} className="tool-link">
                          Connect {SERVICES[service].name}
                        </a>{" "}
                        to use this. Until then the agent skips it.
                      </>
                    )}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head step-head">
            <span className="builder-step mono" aria-hidden="true">03</span>
            <div>
              <h2>How it reports</h2>
              <p>What comes back, and when it runs.</p>
            </div>
          </header>
          <div className="form-stack">
            <label className="toggle-row">
              <input type="checkbox" className="switch" checked={draft.scoring} onChange={() => set("scoring", !draft.scoring)} />
              <span>
                <strong>Give a score out of 100</strong>
                <span className="hint">Useful for anything you want to track over time. Scores show on your dashboard.</span>
              </span>
            </label>
            {draft.scoring && (
              <div className={cls("scoreLabel")}>
                <label htmlFor={id("scoreLabel")}>What the score measures</label>
                <input id={id("scoreLabel")} className="input" maxLength={40} placeholder="Pricing strength" value={draft.scoreLabel} onChange={(e) => set("scoreLabel", e.target.value)} />
                {err("scoreLabel")}
              </div>
            )}

            <fieldset className="field choice-field">
              <legend className="label">When it runs</legend>
              <div className="choices">
                {(Object.keys(SCHEDULE_TEXT) as (keyof typeof SCHEDULE_TEXT)[]).map((s) => (
                  <label key={s} className="choice">
                    <input type="radio" name={id("schedule")} checked={draft.schedule === s} onChange={() => set("schedule", s)} />
                    <span>{SCHEDULE_TEXT[s].label}</span>
                  </label>
                ))}
              </div>
              <span className="hint">
                {SCHEDULE_TEXT[draft.schedule].hint}
                {draft.schedule !== "manual" && !schedulingEnabled && " Scheduling isn't switched on for this server yet, so it will only run when you press Run."}
              </span>
            </fieldset>

            <details className="advanced">
              <summary>Advanced</summary>
              <div className={cls("model")}>
                <label htmlFor={id("model")}>Model <span className="optional">optional</span></label>
                <input id={id("model")} className="input mono" placeholder="Uses the server default" value={draft.model} onChange={(e) => set("model", e.target.value)} spellCheck={false} />
                <span className="hint">A model name your AI provider accepts, for example a larger model for harder jobs.</span>
                {err("model")}
              </div>
            </details>
          </div>
        </section>

        {alert && (
          <p className="form-alert" role="alert">
            {alert}
          </p>
        )}
        <div className="settings-bar">
          <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="spec-wrap">
        <div className="spec-note">
          <HandNote arrow="down">your agent, as you build it</HandNote>
        </div>
        <SpecPreview draft={draft} agentKey={agentId ? `custom:${agentId}` : `draft:${draft.name.trim().toLowerCase()}`} />
      </div>
    </form>
  );
}

/** A live, read-only summary of the agent being built. Everything in it is also in the form, so it's hidden from screen readers. */
function SpecPreview({ draft, agentKey }: { draft: CustomAgentInput; agentKey: string }) {
  const instructions = draft.instructions.trim();
  return (
    <aside className="spec-preview" aria-hidden="true">
      <div className="spec-bar mono">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span>agent.spec</span>
        <span className="spec-live">
          <i />
          Live
        </span>
      </div>
      <div className="spec-body">
        <div className="spec-id">
          <AgentGlyph agentKey={agentKey} name={draft.name || "New agent"} state="idle" size={52} />
          <div>
            <strong>{draft.name.trim() || "Untitled agent"}</strong>
            <span>{draft.role.trim() || "Its job, in one sentence, shows up here."}</span>
          </div>
        </div>
        <dl className="spec-lines mono">
          <div>
            <dt>tools</dt>
            <dd>{draft.tools.length ? draft.tools.map((t) => <span key={t} className="spec-chip">{t}</span>) : <span className="muted">profile only</span>}</dd>
          </div>
          <div>
            <dt>output</dt>
            <dd>{draft.scoring ? `score/100 · ${draft.scoreLabel.trim() || "…"}` : "brief + tasks"}</dd>
          </div>
          <div>
            <dt>runs</dt>
            <dd>{SCHEDULE_TEXT[draft.schedule].label.toLowerCase()}</dd>
          </div>
          <div>
            <dt>model</dt>
            <dd>{draft.model.trim() || <span className="muted">server default</span>}</dd>
          </div>
        </dl>
        <div className="spec-prompt">
          <span className="eyebrow">Instructions</span>
          <p className="mono">
            {instructions ? (instructions.length > 420 ? `${instructions.slice(0, 420)}…` : instructions) : <span className="muted">Waiting for instructions</span>}
            <span className="caret" />
          </p>
        </div>
      </div>
      <p className="spec-foot mono">Reads your company profile on every run</p>
    </aside>
  );
}