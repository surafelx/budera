"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = "queued" | "running" | "succeeded" | "failed";
type StatusMap = Record<string, { status: Status; error: string | null } | undefined>;

const POLL_MS = 4000;

/**
 * Starts one or more agents by key ("growth_gps" or "custom:<id>"), polls until they finish, then refreshes
 * the page. Pass `initiallyRunning` when the page loads while agents are still working, so polling resumes.
 */
export function RunButton({
  agents,
  label,
  initiallyRunning = false,
  variant = "primary",
}: {
  agents: string[];
  label: string;
  initiallyRunning?: boolean;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [working, setWorking] = useState(initiallyRunning);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = agents.join(",");

  const poll = useCallback(async () => {
    const keys = key.split(",");
    try {
      const res = await fetch("/api/runs/status", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { agents: StatusMap };
      const active = keys.filter((a) => data.agents[a]?.status === "queued" || data.agents[a]?.status === "running");
      if (active.length > 0) {
        setMessage(active.length === 1 ? "1 agent still working…" : `${active.length} agents still working…`);
        timer.current = setTimeout(poll, POLL_MS);
        return;
      }
      const failed = keys.filter((a) => data.agents[a]?.status === "failed");
      setWorking(false);
      setMessage(
        failed.length === 0 ? "Done. Your brief is updated." : failed.length === keys.length ? "The run failed. See the details below." : `${failed.length} of ${keys.length} agents failed. See the details below.`,
      );
      router.refresh();
    } catch {
      timer.current = setTimeout(poll, POLL_MS * 2);
    }
  }, [key, router]);

  useEffect(() => {
    if (initiallyRunning) timer.current = setTimeout(poll, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [initiallyRunning, poll]);

  async function start() {
    setWorking(true);
    setMessage("Starting…");
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agents }) });
      const data = (await res.json()) as { error?: string; message?: string; runs?: unknown[] };
      if (!res.ok) {
        setWorking(false);
        setMessage(data.error ?? "Couldn't start the agents. Try again.");
        return;
      }
      if (data.runs && data.runs.length === 0) {
        setMessage(data.message ?? "Already working.");
      } else {
        setMessage(agents.length > 1 ? "Agents are working. Research can take a few minutes." : "Working. This can take a minute or two.");
      }
      router.refresh();
      timer.current = setTimeout(poll, POLL_MS);
    } catch {
      setWorking(false);
      setMessage("Couldn't reach Budera. Check your connection and try again.");
    }
  }

  return (
    <div className="run-button">
      <button type="button" className={`btn ${variant === "primary" ? "btn-primary" : "btn-ghost"}`} onClick={start} disabled={working}>
        {working && <span className="spinner" aria-hidden="true" />}
        {working ? "Running…" : label}
      </button>
      <span className="run-status" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
