import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/projects/[slug]/control[?budgetId=<uuid>]
 *
 * The control dashboard aggregate: earned-value KPIs (PV/EV/AC, SPI/CPI),
 * S-curve series, per-task semaphore and rain summary. Uses the latest
 * saved budget by default.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const budgetId = new URL(request.url).searchParams.get("budgetId");

    const [tasks, budgets] = await Promise.all([
      listTasks(supabase, project.id),
      listBudgets(supabase, project.id),
    ]);
    if (budgets.length === 0) {
      return NextResponse.json({
        dashboard: null,
        budgets: [],
        reason: "no_budget",
        tasksCount: tasks.length,
      });
    }

    const chosen: { id: string } | undefined =
      (budgetId && budgets.find((b) => b.id === budgetId)) || budgets[0] || undefined;
    if (!chosen) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }
    const detail = await getBudgetDetail(supabase, chosen.id);
    if (!detail) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    // Bitácora progress series (all days — projects are short-lived enough).
    const { data: entries } = await supabase
      .from("bitacora_entries")
      .select("id, entry_date, rain_hours")
      .eq("project_id", project.id)
      .order("entry_date", { ascending: true });
    const entryIds = ((entries ?? []) as Array<Record<string, any>>).map((e) => e.id as string);

    const points: Array<{ entryDate: string; taskId: string; progress: number }> = [];
    if (entryIds.length > 0) {
      const { data: prog } = await supabase
        .from("bitacora_task_progress")
        .select("entry_id, task_id, progress")
        .in("entry_id", entryIds);
      const dateByEntry = new Map(
        ((entries ?? []) as Array<Record<string, any>>).map((e) => [e.id as string, String(e.entry_date).slice(0, 10)]),
      );
      for (const p of ((prog ?? []) as Array<Record<string, any>>)) {
        const d = dateByEntry.get(p.entry_id);
        if (d) points.push({ entryDate: d, taskId: p.task_id, progress: Number(p.progress ?? 0) });
      }
    }

    const rain = ((entries ?? []) as Array<Record<string, any>>).map((e) => ({
      entryDate: String(e.entry_date).slice(0, 10),
      rainHours: Number(e.rain_hours ?? 0),
    }));

    const dashboard = computeDashboard(
      tasks.map((t) => ({
        id: t.id,
        name: t.name,
        startDate: String(t.startDate).slice(0, 10),
        endDate: String(t.endDate).slice(0, 10),
        progress: Number(t.progress ?? 0),
      })),
      detail.items.map((i) => ({
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

    return NextResponse.json({
      dashboard,
      alerts: buildAlerts(dashboard, rain),
      budget: { id: detail.id, title: detail.title, total: detail.total },
      budgets: budgets.map((b) => ({ id: b.id, title: b.title, total: b.total })),
      items: detail.items,
      tasksCount: tasks.length,
    });
  } catch (error) {
    console.error("GET control error:", error);
    return NextResponse.json({ error: "Failed to build control dashboard" }, { status: 500 });
  }
}
