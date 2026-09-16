"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyFields, SECTIONS, type CompanyDraft } from "./CompanyFields";

export function SettingsForm({ initial }: { initial: CompanyDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== saved;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = (await res.json()) as { error?: string; fields?: Record<string, string> };
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setNotice({ tone: "error", text: data.error ?? "Couldn't save. Try again." });
        return;
      }
      setErrors({});
      setSaved(JSON.stringify(draft));
      setNotice({ tone: "ok", text: "Saved. Run your agents again to get a brief based on these answers." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach Budera. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={save} noValidate>
      {SECTIONS.map((s) => (
        <section key={s.id} className="panel">
          <header className="panel-head">
            <h2>{s.title}</h2>
            <p>{s.intro}</p>
          </header>
          <CompanyFields section={s.id} value={draft} onChange={setDraft} errors={errors} />
        </section>
      ))}
      <div className="settings-bar">
        {notice && (
          <p className={notice.tone === "ok" ? "notice-ok" : "form-alert"} role={notice.tone === "ok" ? "status" : "alert"}>
            {notice.text}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
