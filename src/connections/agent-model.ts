import type { Db } from "@/db";
import { LlmAgentModel } from "@/agents/engine";
import { OpenAICompatibleClient } from "@/llm/client";
import { assertModelUrl, loadRuntime } from "./store";

/** The model an agent runs with for one company: its own connections, falling back to the server's settings. */
export async function agentModelFor(db: Db, companyId: string): Promise<LlmAgentModel> {
  const runtime = await loadRuntime(db, companyId);
  const config = runtime.llm();
  if (runtime.llmSource === "company") await assertModelUrl(config.baseUrl);
  return new LlmAgentModel({ config, client: new OpenAICompatibleClient(config, runtime.fetch), tools: runtime.tools });
}
