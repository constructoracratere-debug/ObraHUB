import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail, listBitacoraEntries } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

/**
 * GET /api/cron/daily-alerts — daily 7am email digest of project alerts.
 * Scheduled via vercel.json crons; Vercel calls it with
 * Authorization: Bearer $CRON_SECRET (verified when the env is set).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ ok: true, skipped: "no RESEND_API_KEY" });
  const resend = new Resend(resendKey);

  // Owner email lookup (beta scale: one page).
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailBy = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const { data: projects } = await admin
    .from("projects")
    .select("id, name, user_id")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (!projects) return NextResponse.json({ ok: true, projects: 0 });

  let sent = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const p of projects as Array<Record<string, any>>) {
    try {
      const email = emailBy.get(p.user_id);
      if (!email) continue;

      const [tasks, budgets] = await Promise.all([
        listTasks(admin, p.id),
        listBudgets(admin, p.id),
      ]);
      if (tasks.length === 0) continue; // nothing to monitor yet

      const entries = await listBitacoraEntries(admin, p.id, { from: "2000-01-01", to: "2999-12-31" });
      const rain = entries.map((e) => ({ entryDate: e.entryDate, rainHours: e.rainHours }));
      const points = entries.flatMap((e) =>
        (e.taskProgress ?? []).map((tp) => ({ entryDate: e.entryDate, taskId: tp.taskId, progress: tp.progress })),
      );
      const items = budgets[0] ? (await getBudgetDetail(admin, budgets[0].id))?.items ?? [] : [];

      const d = computeDashboard(
        tasks.map((t) => ({
          id: t.id, name: t.name,
          startDate: String(t.startDate).slice(0, 10),
          endDate: String(t.endDate).slice(0, 10),
          progress: Number(t.progress ?? 0),
        })),
        items.map((i) => ({
          id: i.id, chapter: i.chapter, descripcion: i.descripcion, cantidad: i.cantidad,
          precioUnitarioTotal: i.precioUnitarioTotal, subtotal: i.subtotal,
          cantidadEjecutada: i.cantidadEjecutada, taskId: i.taskId,
        })),
        points, rain,
      );
      const alerts = buildAlerts(d, rain);
      if (alerts.length === 0) continue;

      const critical = alerts.filter((a) => a.level === "critica");
      const rows = alerts
        .slice(0, 8)
        .map((a) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;${a.level === "critica" ? "color:#dc2626;font-weight:700" : "color:#b45309"}">${a.icon} ${a.title}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px">${a.evidence}</td></tr>`)
        .join("");

      await resend.emails.send({
        from: "ObraHub <onboarding@resend.dev>",
        to: email,
        subject: `${critical.length > 0 ? "🔴" : "🟡"} ObraHub — ${p.name}: ${alerts.length} alerta(s)`,
        html: `
          <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">
            <div style="background:#0a1120;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:18px">ObraHub — Reporte diario de alertas</h2>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px">${p.name} · ${today}</p>
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px">
              <p style="margin:0 0 12px;color:#0f172a">Avance real <b>${d.kpis.progressEarned.toFixed(1)}%</b> · SPI <b>${d.kpis.spi != null ? d.kpis.spi.toFixed(2) : "—"}</b> · ${critical.length} críticas de ${alerts.length}</p>
              <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">${rows}</table>
              <p style="margin:14px 0 0;font-size:12px;color:#64748b">Entra a ObraHub → 📈 Control de Obra para evidencia y recomendaciones de cada alerta.</p>
            </div>
          </div>`,
      });
      sent++;
    } catch (e) {
      console.error(`daily-alerts project ${p.id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, projects: projects.length, sent });
}
