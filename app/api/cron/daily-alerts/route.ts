import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/**
 * GET /api/cron/daily-alerts — daily 7am (Colombia) email digest.
 *
 * Scale-safe: reads the denormalized project_health rows (kept fresh by
 * refreshProjectHealth on bitácora/budget writes) — ONE query for every
 * project, no per-project engine loops. Sends a branded summary to each
 * owner whose projects have alerts.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ ok: true, skipped: "no RESEND_API_KEY" });
  const resend = new Resend(resendKey);

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailBy = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  // One query: health rows with their owning project (service role sees all).
  const { data: rows } = await admin
    .from("project_health")
    .select("project_id, name, progress, spi, alerts, critical, projects(user_id)")
    .gt("alerts", 0)
    .order("critical", { ascending: false })
    .limit(1000);

  const today = new Date().toISOString().slice(0, 10);
  const byOwner = new Map<string, Array<Record<string, any>>>();
  for (const r of (rows ?? []) as Array<Record<string, any>>) {
    const owner = (r.projects as Record<string, any> | null)?.user_id;
    if (owner && emailBy.get(owner)) {
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), r]);
    }
  }

  let sent = 0;
  for (const [ownerId, projects] of byOwner) {
    try {
      const email = emailBy.get(ownerId) as string;
      const totalAlerts = projects.reduce((s, p) => s + Number(p.alerts ?? 0), 0);
      const totalCritical = projects.reduce((s, p) => s + Number(p.critical ?? 0), 0);
      const rowsHtml = projects
        .slice(0, 12)
        .map(
          (p) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${p.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#334155">${Number(p.progress ?? 0).toFixed(1)}%</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${p.spi != null && Number(p.spi) < 0.9 ? "#dc2626" : "#0f172a"}">${p.spi != null ? Number(p.spi).toFixed(2) : "—"}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${Number(p.critical ?? 0) > 0 ? "#dc2626" : "#b45309"};font-weight:700">${p.critical ?? 0} críticas / ${p.alerts ?? 0}</td></tr>`,
        )
        .join("");

      await resend.emails.send({
        from: "ObraHub <onboarding@resend.dev>",
        to: email,
        subject: `${totalCritical > 0 ? "🔴" : "🟡"} ObraHub — ${projects.length} proyecto(s) con ${totalAlerts} alerta(s)`,
        html: `
          <div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto">
            <div style="background:#0a1120;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:18px">ObraHub — Reporte diario de portafolio</h2>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px">${today} · ${projects.length} proyecto(s) con alertas</p>
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px">
              <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
                <tr style="background:#0f172a;color:#fff"><th style="padding:8px 10px;text-align:left;font-size:12px">Proyecto</th><th style="padding:8px 10px;text-align:left;font-size:12px">Avance</th><th style="padding:8px 10px;text-align:left;font-size:12px">SPI</th><th style="padding:8px 10px;text-align:left;font-size:12px">Alertas</th></tr>
                ${rowsHtml}
              </table>
              <p style="margin:14px 0 0;font-size:12px;color:#64748b">Entra a ObraHub → 📈 Control de Obra para la evidencia y recomendación de cada alerta.</p>
            </div>
          </div>`,
      });
      sent++;
    } catch (e) {
      console.error(`daily-alerts owner ${ownerId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, ownersWithAlerts: byOwner.size, sent });
}
