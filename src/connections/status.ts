import { TOOL_IDS, TOOL_INFO, type ToolId } from "@/tools/meta";
import { searchProviderFromEnv } from "@/tools/search";
import { SERVICE_IDS, type ConnectionView, type ServiceId, type ServiceNeed } from "./catalog";

/** connected: saved (tested or not) · error: failed its last test · demo: sample data · server: using env settings · missing */
export type ServiceState = "connected" | "error" | "demo" | "server" | "missing";

/** Which services the server itself provides through environment variables. Never reads or exposes the values. */
export function serverFallbacks(env: NodeJS.ProcessEnv = process.env): Partial<Record<ServiceId, boolean>> {
  return { ai_model: Boolean(env.LLM_MODEL?.trim()), web_search: searchProviderFromEnv(env) !== null };
}

export function serviceStates(views: ConnectionView[], env: NodeJS.ProcessEnv = process.env): Record<ServiceId, ServiceState> {
  const fallbacks = serverFallbacks(env);
  const byService = new Map(views.map((v) => [v.service, v]));
  return Object.fromEntries(
    SERVICE_IDS.map((id) => {
      const view = byService.get(id);
      const state: ServiceState = view ? (view.status === "demo" ? "demo" : view.status === "error" ? "error" : "connected") : fallbacks[id] ? "server" : "missing";
      return [id, state];
    }),
  ) as Record<ServiceId, ServiceState>;
}

export const isUsable = (state: ServiceState) => state === "connected" || state === "server" || state === "demo";

export function readiness(needs: ServiceNeed[], states: Record<ServiceId, ServiceState>) {
  const missingRequired = needs.filter((n) => n.need === "required" && !isUsable(states[n.service])).map((n) => n.service);
  const missingOther = needs.filter((n) => n.need !== "required" && !isUsable(states[n.service])).map((n) => n.service);
  return { ready: missingRequired.length === 0, missingRequired, missingOther };
}

/** Tools whose service is usable, for the agent builder. */
export function usableTools(states: Record<ServiceId, ServiceState>): ToolId[] {
  return TOOL_IDS.filter((t) => {
    const service = TOOL_INFO[t].service;
    return !service || isUsable(states[service]);
  });
}
