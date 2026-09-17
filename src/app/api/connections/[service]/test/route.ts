import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { isServiceId, testConnection } from "@/connections/store";
import { DEMO_READ_ONLY, isDemoUser } from "@/lib/demo";
import { jsonError, sameOrigin } from "@/lib/http";
import { currentWorkspace } from "@/lib/session";

export const maxDuration = 60;

/** Makes one small real request with the saved connection and records whether it worked. */
export async function POST(request: Request, { params }: { params: Promise<{ service: string }> }) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const workspace = await currentWorkspace();
  if (!workspace) return jsonError("Sign in first.", 401);
  if (!workspace.company) return jsonError("Add a company first.", 409);
  if (isDemoUser(workspace.user)) return jsonError(DEMO_READ_ONLY, 403);
  const { service } = await params;
  if (!isServiceId(service)) return jsonError("Unknown service.", 404);

  const view = await testConnection(await getDb(), workspace.company.id, service);
  if (!view) return jsonError("Save this connection before testing it.", 404);
  return NextResponse.json({ ok: view.status === "ok", connection: view });
}
