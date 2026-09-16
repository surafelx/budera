import type { CSSProperties } from "react";
import type { AgentRun } from "@/db/schema";

export type AgentState = "idle" | "working" | "ready" | "failed";

export const STATE_LABEL: Record<AgentState, string> = { idle: "Idle", working: "Working", ready: "Report ready", failed: "Last run failed" };

const BUILT_IN_HUES: Record<string, number> = {
  growth_gps: 18,
  paralegal: 262,
  trend_hawk: 188,
  competitor_radar: 328,
  operational_radar: 148,
};

/** A stable hue per agent: fixed for built-ins, derived from the key for custom agents. */
export function agentHue(key: string): number {
  if (key in BUILT_IN_HUES) return BUILT_IN_HUES[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function agentState(latest?: Pick<AgentRun, "status"> | null, hasReport = false): AgentState {
  if (latest?.status === "queued" || latest?.status === "running") return "working";
  if (latest?.status === "failed") return "failed";
  return hasReport || latest?.status === "succeeded" ? "ready" : "idle";
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Decorative avatar with a status light. Callers put status text for screen readers next to it. */
export function AgentGlyph({ agentKey, name, state, size = 36 }: { agentKey: string; name: string; state?: AgentState; size?: number }) {
  const style = { "--h": agentHue(agentKey), "--s": `${size}px` } as CSSProperties;
  return (
    <span className="glyph" style={style} data-state={state} aria-hidden="true">
      <span className="glyph-core">{initials(name)}</span>
    </span>
  );
}
