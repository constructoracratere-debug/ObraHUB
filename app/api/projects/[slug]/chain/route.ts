import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidProjectSlug } from "@/lib/projects";
import { getKit } from "@/lib/kit";
import { sanitizeFloorPlan } from "@/lib/design/schema";
import { takeoffToBudget, budgetToSchedule, chainSummary } from "@/lib/pipeline";
import { saveBudget } from "@/lib/project-controls";
import { replaceTasks } from "@/lib/gantt-tasks";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * POST /api/projects/[slug]/chain — LA CADENA DE OBRA EN UNA SOLA LÍNEA.
 *
 *   Kit (plan 2D/3D) → takeoff → presupuesto APU (guardado) →
 *   cronograma con dependencias (guardado) → resumen para el reporte.
 *
 * 100% determinístico: los números salen del MISMO modelo que dibuja
 * los planos. Sin LLM en la ruta crítica.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: proj } = await supabase.from("projects").select("id").eq("slug", slug).maybeSingle();
  if (!proj) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const kit = await getKit(supabase, proj.id);
  if (!kit?.plan) {
    return NextResponse.json(
      { error: "El kit no tiene modelo. Abre Diseño Arquitectónico y genera (o edita) un proyecto — se publica solo." },
      { status: 400 },
    );
  }

  try {
    // 1) Sanitizar (el plan pasó por JSON en memoria — jamás confiar en crudo).
    const plan = sanitizeFloorPlan(kit.plan as Parameters<typeof sanitizeFloorPlan>[0]);

    // 2) Presupuesto determinístico + guardado como presupuesto del proyecto.
    const chain = takeoffToBudget(plan);
    const budgetId = await saveBudget(supabase, {
      projectId: proj.id,
      ownerId: user.id,
      budget: chain.budget,
      prompt: `Cadena de obra desde el kit — ${plan.name}`,
      source: "manual",
    });

    // 3) Cronograma con dependencias + reemplazo del gantt del proyecto.
    const tasks = budgetToSchedule(chain.budget);
    await replaceTasks(supabase, proj.id, user.id, tasks);

    // 4) Salud del proyecto + bitácora de la actividad.
    try {
      const { refreshProjectHealth } = await import("@/lib/project-health");
      await refreshProjectHealth(supabase, proj.id);
      const { logActivity } = await import("@/lib/project-controls");
      void logActivity(supabase, {
        projectId: proj.id,
        userId: user.id,
        kind: "budget",
        description: `Cadena de obra generada: ${chain.budget.titulo} ($${Math.round(chain.budget.resumen.total).toLocaleString("es-CO")}) + cronograma ${tasks.length} actividades`,
      });
    } catch { /* salud es best-effort */ }

    return NextResponse.json({
      ok: true,
      budgetId,
      summary: chainSummary(plan, chain, tasks),
    });
  } catch (e) {
    console.error("chain error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error generando la cadena" }, { status: 500 });
  }
}
