import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail, listBitacoraEntries } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

/**
 * GET /api/portfolio — health cards for every project of the signed-in user:
 * progress ring value, SPI, alerts count, days since last bitácora entry and
 * the next upcoming milestone/task. Feeds the Home dashboard.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const projects = await listProjects(supabase);
    const today = new Date().toISOString().slice(0, 10);

    const cards = await Promise.all(
      (projects ?? []).map(async (pRaw: unknown) => {
        try {
          const p = pRaw as { id?: string; name: string; slug: string };
          const pid = p.id ?? "";
          if (!pid) throw new Error("no id");
          const [tasks, budgets] = await Promise.all([
            listTasks(supabase, pid),
            listBudgets(supabase, pid),
          ]);

          const entries = await listBitacoraEntries(supabase, pid, {
            from: "2000-01-01",
            to: "2999-12-31",
          });
          const rain = entries.map((e) => ({ entryDate: e.entryDate, rainHours: e.rainHours }));

          const points = entries.flatMap((e) =>
            (e.taskProgress ?? []).map((tp) => ({ entryDate: e.entryDate, taskId: tp.taskId, progress: tp.progress })),
          );

          const items = budgets[0] ? (await getBudgetDetail(supabase, budgets[0].id))?.items ?? [] : [];
          const d = computeDashboard(
            tasks.map((t) => ({
              id: t.id,
              name: t.name,
              startDate: String(t.startDate).slice(0, 10),
              endDate: String(t.endDate).slice(0, 10),
              progress: Number(t.progress ?? 0),
            })),
            items.map((i) => ({
              id: i.id,
              chapter: i.chapter,
              descripcion: i.descripcion,
              cantidad: i.cantidad,
              precioUnitarioTotal: i.precioUnitarioTotal,
              subtotal: i.subtotal,
              cantidadEjecutada: i.cantidadEjecutada,
              taskId: i.taskId,
            })),
            points,
            rain,
          );
          const alerts = buildAlerts(d, rain);

          const nextTask = tasks
            .map((t) => ({ name: t.name, end: String(t.endDate).slice(0, 10), progress: Number(t.progress ?? 0) }))
            .filter((t) => t.end >= today && t.progress < 100)
            .sort((a, b) => (a.end < b.end ? -1 : 1))[0] ?? null;

          const lastEntry = entries.length > 0 ? entries[0].entryDate : null;
          const daysSinceBitacora = lastEntry
            ? Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${lastEntry}T00:00:00`)) / 86400000)
            : null;

          return {
            slug: (pRaw as { name: string; slug: string }).slug,
            name: (pRaw as { name: string; slug: string }).name,
            progress: Math.round(d.kpis.progressEarned * 10) / 10,
            spi: d.kpis.spi != null ? Math.round(d.kpis.spi * 100) / 100 : null,
            alerts: alerts.length,
            critical: alerts.filter((a) => a.level === "critica").length,
            totalBudget: d.bac > 0 ? d.bac : null,
            tasksTotal: tasks.length,
            nextMilestone: nextTask ? { name: nextTask.name, date: nextTask.end } : null,
            daysSinceBitacora,
          };
        } catch {
          // A project with no data yet still shows a (neutral) card.
          return {
            slug: (pRaw as { name: string; slug: string }).slug,
            name: (pRaw as { name: string; slug: string }).name,
            progress: 0,
            spi: null,
            alerts: 0,
            critical: 0,
            totalBudget: null,
            tasksTotal: 0,
            nextMilestone: null,
            daysSinceBitacora: null,
          };
        }
      }),
    );

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("GET portfolio error:", error);
    return NextResponse.json({ error: "Failed to build portfolio" }, { status: 500 });
  }
}
