"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { SERVICES, type ConnectionView, type ServiceId } from "@/connections/catalog";
import { AgentGlyph } from "@/components/app/AgentGlyph";

type State = "connected" | "error" | "demo" | "server" | "missing";
type UsedBy = { key: string; name: string; need: "required" | "recommended" | "optional" };

const PILL: Record<State, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "ok" },
  server: { label: "Using server settings", tone: "ok" },
  demo: { label: "Sample connection", tone: "none" },
  error: { label: "Failed test", tone: "fail" },
  missing: { label: "Not connected", tone: "none" },
};

export function ConnectionCard({
  service,
  initial,
  serverFallback,
  usedBy,
  readOnly,
}: {
  service: ServiceId;
  initial: ConnectionView | null;
  serverFallback: boolean;
  usedBy: UsedBy[];
  readOnly: boolean;
}) {
  const def = SERVICES[service];
  const router = useRouter();
  const uid = useId();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>(initial?.config ?? {});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "test" | "delete">("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const state: State = view ? (view.status === "demo" ? "demo" : view.status === "error" ? "error" : "connected") : serverFallback ? "server" : "missing";
  const pill = PILL[state];

  async function request(path: string, method: string, body?: unknown) {
    const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; connection?: ConnectionView };
    return { res, data };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setNotice(null);
    try {
      const { res, data } = await request(`/api/connections/${service}`, "PUT", { config, secrets });
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setNotice({ tone: "error", text: data.error ?? "Couldn't save. Try again." });
        return;
      }
      setErrors({});
      setSecrets({});
      setView(data.connection ?? null);
      setEditing(false);
      setNotice({ tone: "ok", text: "Saved. Test the connection to make sure it works." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach Budera. Try again." });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setNotice(null);
    try {
      const { res, data } = await request(`/api/connections/${service}/test`, "POST");
      if (data.connection) setView(data.connection);
      else if (!res.ok) setNotice({ tone: "error", text: data.error ?? "Couldn't test the connection." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach Budera. Try again." });
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    setBusy("delete");
    setNotice(null);
    try {
      const { res, data } = await request(`/api/connections/${service}`, "DELETE");
      if (!res.ok) {
        setNotice({ tone: "error", text: data.error ?? "Couldn't disconnect." });
        return;
      }
      setView(null);
      setConfig({});
      setConfirmDelete(false);
      setNotice({ tone: "ok", text: serverFallback ? "Disconnected. Agents now use the server's settings." : "Disconnected." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach Budera. Try again." });
    } finally {
      setBusy("");
    }
  }

  const id = (k: string) => `${uid}-${k}`;

  return (
    <article className={`conn-card state-${state}`} id={service} aria-labelledby={id("title")}>
      <header className="conn-head">
        <AgentGlyph agentKey={`service:${service}`} name={def.name} size={44} />
        <div className="conn-title">
          <h2 id={id("title")}>{def.name}</h2>
          <p>{def.gives}</p>
        </div>
        <span className={`pill ${pill.tone}`}>{pill.label}</span>
      </header>

      {usedBy.length > 0 && (
        <div className="conn-used">
          <span className="eyebrow">Used by</span>
          <ul>
            {usedBy.map((a) => (
              <li key={a.key} className={`used-${a.need}`}>
                <AgentGlyph agentKey={a.key} name={a.name} size={20} />
                {a.name}
                {a.need !== "optional" && <span className="used-need">{a.need}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view && (view.statusMessage || state === "connected") && (
        <p className={`conn-message ${state}`} role="status">
          {view.statusMessage || "Saved, not tested yet."}
          {view.checkedAt && <span className="mono"> · {new Date(view.checkedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </p>
      )}
      {!view && state === "server" && <p className="conn-message server">The server provides this ({def.serverFallback}). Connect your own to use a different account for this company.</p>}

      {editing ? (
        <form className="conn-form" onSubmit={save} noValidate>
          <div className="form-grid">
            {def.fields.map((f) => {
              const hint = view?.secretHints?.[f.key];
              const isSecret = f.kind === "secret" || f.kind === "secret_json";
              const value = isSecret ? secrets[f.key] ?? "" : config[f.key] ?? "";
              const set = (v: string) => (isSecret ? setSecrets((s) => ({ ...s, [f.key]: v })) : setConfig((c) => ({ ...c, [f.key]: v })));
              const placeholder = isSecret && hint ? `Saved (${hint}). Leave blank to keep it.` : f.placeholder;
              return (
                <div key={f.key} className={`field${errors[f.key] ? " has-error" : ""}${f.kind === "secret_json" ? " span-2" : ""}`}>
                  <label htmlFor={id(f.key)}>
                    {f.label} {!f.required && <span className="optional">optional</span>}
                    {isSecret && <span className="secret-tag mono">encrypted</span>}
                  </label>
                  {f.kind === "select" ? (
                    <select id={id(f.key)} className="select" value={value || f.options?.[0]?.value} onChange={(e) => set(e.target.value)}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === "secret_json" ? (
                    <textarea id={id(f.key)} className="textarea mono" rows={5} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} spellCheck={false} autoComplete="off" />
                  ) : (
                    <input
                      id={id(f.key)}
                      className={`input${isSecret ? " mono" : ""}`}
                      type={isSecret ? "password" : f.kind === "url" ? "url" : "text"}
                      value={value}
                      placeholder={placeholder}
                      onChange={(e) => set(e.target.value)}
                      autoComplete={isSecret ? "new-password" : "off"}
                      spellCheck={false}
                    />
                  )}
                  {errors[f.key] ? <span className="error">{errors[f.key]}</span> : f.hint && <span className="hint">{f.hint}</span>}
                </div>
              );
            })}
          </div>

          <details className="conn-setup">
            <summary>How to get these</summary>
            <ol>
              {def.setup.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <a href={def.docsUrl} target="_blank" rel="noopener noreferrer">
              {def.name} documentation ↗
            </a>
          </details>

          <p className="conn-note">Secrets are encrypted before they're stored and are never shown again. Only the last characters are kept so you can tell which key is saved.</p>

          <div className="conn-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== ""}>
              {busy === "save" ? "Saving…" : "Save connection"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setErrors({}); setSecrets({}); setConfig(view?.config ?? {}); }} disabled={busy !== ""}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="conn-actions">
          {readOnly ? (
            <span className="muted conn-readonly">Connections are read-only in the demo.</span>
          ) : (
            <>
              <button type="button" className={`btn btn-sm ${view ? "btn-ghost" : "btn-primary"}`} onClick={() => { setEditing(true); setNotice(null); }}>
                {view ? (state === "demo" ? "Replace with my own" : "Edit") : "Connect"}
              </button>
              {view && state !== "demo" && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={test} disabled={busy !== ""}>
                  {busy === "test" ? "Testing…" : "Test connection"}
                </button>
              )}
              {view &&
                (confirmDelete ? (
                  <>
                    <button type="button" className="btn btn-danger btn-sm" onClick={disconnect} disabled={busy !== ""}>
                      {busy === "delete" ? "Removing…" : "Yes, remove it"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm conn-remove" onClick={() => setConfirmDelete(true)}>
                    Disconnect
                  </button>
                ))}
            </>
          )}
        </div>
      )}

      {notice && (
        <p className={notice.tone === "ok" ? "notice-ok" : "form-alert"} role={notice.tone === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}
    </article>
  );
}
