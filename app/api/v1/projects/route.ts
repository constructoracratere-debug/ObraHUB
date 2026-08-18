import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * GET /api/v1/projects — Public API v1 (read).
 * Auth: Authorization: Bearer <api key> (plaintext key; sha256 must exist
 * in api_keys). Returns the key owner's projects with health.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Bearer api key required" }, { status: 401 });

  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(token).digest("hex");

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: keyRow } = await admin.from("api_keys").select("id, user_id").eq("key_hash", hash).maybeSingle();
  if (!keyRow) return NextResponse.json({ error: "Invalid api key" }, { status: 401 });
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  // Proyectos del dueño de la llave + salud (service role ya valida).
  const userClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const projects = (await listProjects(userClient)).filter((p) => p.id === keyRow.user_id ? false : true);
  const ids = (projects ?? []).map((p) => p.id);
  const { data: health } = ids.length
    ? await userClient.from("project_health").select("project_id, name, progress, spi, alerts, critical, next_milestone_date").in("project_id", ids)
    : { data: [] };
  const hBy = new Map(((health ?? []) as Array<Record<string, any>>).map((h) => [h.project_id, h]));

  return NextResponse.json({
    version: "v1",
    projects: (projects ?? []).map((p: Record<string, any>) => ({
      slug: p.slug, name: p.name, city: p.city,
      health: hBy.get(p.id) ?? null,
    })),
  });
}
