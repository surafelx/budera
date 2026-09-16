"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId } from "@/agents/registry";

type Status = "queued" | "running" | "succeeded" | "failed";
type StatusMap = Partial<Record<AgentId, { status: Status; error: string | null } | null>>;

const POLL_MS = 4000;

/**
 * Starts one or more agents, then polls until they finish and refreshes the page with the new reports.
 * Pass `initiallyRunning` when the page loads while agents are still working, so polling resumes.
 */
export function RunButton({
  agents,
  label,
  initiallyRunning = false,
  variant = "primary",
}: {
  agents: AgentId[];
  label: string;
  initiallyRunning?: boolean;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [working, setWorking] = useState(initiallyRunning);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/runs/status", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { agents: StatusMap };
      const active = agents.filter((a) => {
        const s = data.agents[a]?.status;
        return s === "queued" || s === "running";
      });
      if (active.length > 0) {
        setMessage(active.length === 1 ? "1 agent still working…" : `${active.length} agents still working…`);
        timer.current = setTimeout(poll, POLL_MS);
        return;
      }
      const failed = agents.filter((a) => data.agents[a]?.status === "failed");
      setWorking(false);
      setMessage(failed.length > 0 ? (failed.length === agents.length ? "The run failed. See the details below." : `${failed.length} of ${agents.length} agents failed. See the details below.`) : "Done. Your brief is updated.");
      router.refresh();
    } catch {
      timer.current = setTimeout(poll, POLL_MS * 2);
    }
  }, [agents, router]);

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
      const data = (await res.json()) as { error?: string; runs?: unknown[] };
      if (!res.ok) {
        setWorking(false);
        setMessage(data.error ?? "Couldn't start the agents. Try again.");
        return;
      }
      setMessage(agents.length > 1 ? "Agents are working. Research can take a few minutes." : "Working. This can take a minute or two.");
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
