"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCompanyButton({ name, others }: { name: string; others: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/company", { method: "DELETE" });
      const data = (await res.json()) as { error?: string; next?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't delete the company.");
        return;
      }
      router.push(data.next ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach Budera. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel danger-zone">
      <header className="panel-head">
        <h2>Delete {name}</h2>
        <p>
          Its profile, custom agents, reports and tasks are deleted. This can't be undone.
          {others > 0 ? ` You'll switch to one of your other ${others === 1 ? "company" : `${others} companies`}.` : " You'll be asked to set up a new company."}
        </p>
      </header>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="danger-actions">
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : `Yes, delete ${name}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
          Delete company
        </button>
      )}
    </section>
  );
}
