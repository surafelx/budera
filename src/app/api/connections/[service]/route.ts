import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteConnection, isServiceId, saveConnection } from "@/connections/store";
import { ConfigError } from "@/llm/config";
import { DEMO_READ_ONLY, isDemoUser } from "@/lib/demo";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { currentWorkspace } from "@/lib/session";

async function context(request: Request, params: Promise<{ service: string }>) {
  if (!sameOrigin(request)) return { error: jsonError("Request blocked.", 403) };
  const workspace = await currentWorkspace();
  if (!workspace) return { error: jsonError("Sign in first.", 401) };
  if (!workspace.company) return { error: jsonError("Add a company first.", 409) };
  const { service } = await params;
  if (!isServiceId(service)) return { error: jsonError("Unknown service.", 404) };
  return { workspace, company: workspace.company, service };
}

/** Save a connection's settings and secrets. Blank secret fields keep what's already saved. */
export async function PUT(request: Request, { params }: { params: Promise<{ service: string }> }) {
  const ctx = await context(request, params);
  if (ctx.error) return ctx.error;
  if (isDemoUser(ctx.workspace.user)) return jsonError(DEMO_READ_ONLY, 403);

  const body = (await readJson(request)) as { config?: unknown; secrets?: unknown } | null;
  const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  try {
    const result = await saveConnection(await getDb(), ctx.company.id, ctx.service, { config: asRecord(body?.config), secrets: asRecord(body?.secrets) });
    if (!result.ok) return jsonError("Some fields need another look.", 422, { fields: result.fields });
    return NextResponse.json({ ok: true, connection: result.view });
  } catch (error) {
    if (error instanceof ConfigError) return jsonError(error.message, 503);
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ service: string }> }) {
  const ctx = await context(request, params);
  if (ctx.error) return ctx.error;
  if (isDemoUser(ctx.workspace.user)) return jsonError(DEMO_READ_ONLY, 403);
  const removed = await deleteConnection(await getDb(), ctx.company.id, ctx.service);
  if (!removed) return jsonError("That service isn't connected.", 404);
  return NextResponse.json({ ok: true });
}
