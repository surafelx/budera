"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAgentButton({ agentId, name }: { agentId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/custom-agents/${agentId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string; next?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't delete the agent.");
        return;
      }
      router.push(data.next ?? "/agents");
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
        <h2>Delete this agent</h2>
        <p>Its reports and its tasks are deleted too. This can't be undone.</p>
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
          Delete agent
        </button>
      )}
    </section>
  );
}
