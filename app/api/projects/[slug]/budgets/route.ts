import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { saveBudget, listBudgets, setBudgetItemTask, getBudgetDetail } from "@/lib/project-controls";
import type { APUBudget } from "@/lib/budget";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/projects/[slug]/budgets — list saved budgets for the project.
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

    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const detail = await getBudgetDetail(supabase, id);
      if (!detail) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
      // Rebuild the APUBudget shape so the Costos UI can render the full
      // summary (line breakdowns live only in the original AI response).
      const chapters = new Map<string, Array<Record<string, unknown>>>();
      for (const it of detail.items) {
        const list = chapters.get(it.chapter) ?? [];
        list.push({
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          cantidad: it.cantidad,
          materiales: (it.detalle?.materiales ?? []) as unknown[],
          manoObra: (it.detalle?.manoObra ?? []) as unknown[],
          equipos: (it.detalle?.equipos ?? []) as unknown[],
          costoDirecto: it.costoDirecto,
          aiu: { administracion: 0, imprevistos: 0, utilidad: 0 },
          precioUnitarioTotal: it.precioUnitarioTotal,
          subtotal: it.subtotal,
        });
        chapters.set(it.chapter, list);
      }
      return NextResponse.json({
        budget: {
          titulo: detail.title,
          capitulos: Array.from(chapters.entries()).map(([nombre, items]) => ({ nombre, items })),
          resumen: {
            costosDirectos: detail.costosDirectos,
            aiuTotal: 22,
            valorAIU: Math.max(0, detail.total / 1.19 - detail.costosDirectos),
            subtotalConAIU: detail.total / 1.19,
            iva: 19,
            valorIVA: detail.total - detail.total / 1.19,
            total: detail.total,
          },
        },
      });
    }
    const budgets = await listBudgets(supabase, project.id);
    return NextResponse.json({ budgets });
  } catch (error) {
    console.error("GET budgets error:", error);
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[slug]/budgets?id=<budgetId> — delete a saved budget
 * (cascades to its items; the owner-only check mirrors the list query).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", id)
      .eq("project_id", project.id);
    if (error) {
      console.error("DELETE budget error:", error.message);
      return NextResponse.json({ error: "No se pudo eliminar el presupuesto" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE budgets error:", error);
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[slug]/budgets — link/unlink a budget item to a task.
 * Body: { itemId: uuid, taskId: uuid | null }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await request.json();
    const itemId = typeof body?.itemId === "string" ? body.itemId : "";
    const taskId = typeof body?.taskId === "string" && body.taskId ? body.taskId : null;
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    // The item must belong to one of this project's budgets (RLS also guards).
    const { data: item } = await supabase
      .from("budget_items")
      .select("id, budget_id, budgets!inner(project_id)")
      .eq("id", itemId)
      .maybeSingle();
    const row = item as Record<string, any> | null;
    if (!row || (row.budgets as Record<string, any>)?.project_id !== project.id) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (taskId) {
      const { count } = await supabase
        .from("project_tasks")
        .select("id", { count: "exact", head: true })
        .eq("id", taskId)
        .eq("project_id", project.id);
      if (Number(count ?? 0) === 0) {
        return NextResponse.json({ error: "Task not found in project" }, { status: 404 });
      }
    }

    await setBudgetItemTask(supabase, itemId, taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH budgets error:", error);
    return NextResponse.json({ error: "Failed to link item" }, { status: 500 });
  }
}

/**
 * POST /api/projects/[slug]/budgets — persist an AI-generated budget.
 * Body: { budget: APUBudget, prompt?: string, source?: "ai"|"ifc"|"manual" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await request.json();
    const budget = body?.budget as APUBudget | undefined;
    if (!budget || !Array.isArray(budget.capitulos)) {
      return NextResponse.json({ error: "budget (APUBudget) is required" }, { status: 400 });
    }

    const id = await saveBudget(supabase, {
      projectId: project.id,
      ownerId: user.id,
      budget,
      prompt: typeof body.prompt === "string" ? body.prompt : undefined,
      source: body.source === "ifc" || body.source === "manual" ? body.source : "ai",
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("POST budgets error:", error);
    return NextResponse.json({ error: "Failed to save budget" }, { status: 500 });
  }
}
