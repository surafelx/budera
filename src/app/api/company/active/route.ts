import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { setActiveCompany } from "@/lib/auth";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { sessionToken } from "@/lib/session";

const bodySchema = z.object({ companyId: z.uuid() });

/** Switch which company this browser session is working on. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Request blocked.", 403);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("Choose a company.", 422);

  const ok = await setActiveCompany(await getDb(), await sessionToken(), parsed.data.companyId);
  if (!ok) return jsonError("Company not found.", 404);
  return NextResponse.json({ ok: true, next: "/dashboard" });
}
