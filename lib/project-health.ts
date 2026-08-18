import type { SupabaseClient } from "@supabase/supabase-js";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail, listBitacoraEntries } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

/**
 * Recomputes one project's health card and upserts it into project_health.
 * Called after writes that move the needle (bitácora, budgets). The
 * portfolio/cron layers then read ONE row per project — no per-project
 * loops — which is what keeps ObraHub fast at 200+ active projects.
 */
export async function refreshProjectHealth(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  try {
    const [tasks, budgets] = await Promise.all([
      listTasks(supabase, projectId),
      listBudgets(supabase, projectId),
    ]);
    const entries = await listBitacoraEntries(supabase, projectId, { from: "2000-01-01", to: "2999-12-31" });
    const rain = entries.map((e) => ({ entryDate: e.entryDate, rainHours: e.rainHours }));
    const points = entries.flatMap((e) =>
      (e.taskProgress ?? []).map((tp) => ({ entryDate: e.entryDate, taskId: tp.taskId, progress: tp.progress })),
    );
    const items = budgets[0] ? (await getBudgetDetail(supabase, budgets[0].id))?.items ?? [] : [];

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

    const today = new Date().toISOString().slice(0, 10);
    const next = tasks
      .map((t) => ({ name: t.name, end: String(t.endDate).slice(0, 10), progress: Number(t.progress ?? 0) }))
      .filter((t) => t.end >= today && t.progress < 100)
      .sort((a, b) => (a.end < b.end ? -1 : 1))[0] ?? null;

    const { data: proj } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();

    await supabase.from("project_health").upsert(
      {
        project_id: projectId,
        name: (proj as Record<string, any> | null)?.name ?? "",
        progress: Math.round(d.kpis.progressEarned * 100) / 100,
        spi: d.kpis.spi != null ? Math.round(d.kpis.spi * 100) / 100 : null,
        alerts: alerts.length,
        critical: alerts.filter((a) => a.level === "critica").length,
        tasks_total: tasks.length,
        total_budget: d.bac > 0 ? d.bac : null,
        next_milestone_name: next?.name ?? null,
        next_milestone_date: next?.end ?? null,
        last_bitacora_date: entries.length > 0 ? entries[0].entryDate : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
  } catch (e) {
    console.error("refreshProjectHealth:", e); // best-effort
  }
}
