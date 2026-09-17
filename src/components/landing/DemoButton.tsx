"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Opens a fresh sample workspace: no sign-up, sample data only. */
export function DemoButton({ className = "btn btn-on-ink", label = "Try the live demo" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const data = (await res.json()) as { next?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The demo couldn't start. Try again.");
      router.push(data.next ?? "/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The demo couldn't start. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={busy}>
        {busy ? "Setting up the demo…" : label}
      </button>
      {error && (
        <span className="demo-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
