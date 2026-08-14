import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { saveBudget, listBudgets } from "@/lib/project-controls";
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
