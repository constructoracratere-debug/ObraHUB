import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { saveBudget, listBudgets, setBudgetItemTask } from "@/lib/project-controls";
import type { APUBudget } from "@/lib/budget";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/projects/[slug]/budgets — list saved budgets for the project.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const budgets = await listBudgets(supabase, project.id);
    return NextResponse.json({ budgets });
  } catch (error) {
    console.error("GET budgets error:", error);
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
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
