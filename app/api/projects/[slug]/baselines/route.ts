import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Baselines (línea base) del cronograma — frozen snapshots of every task's
 * dates, comparable against the live schedule to expose real slippage.
 */

/** GET /api/projects/[slug]/baselines — list + ?id= for one snapshot. */
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
      const { data: row, error } = await supabase
        .from("project_baselines")
        .select("id, label, snapshot, created_at")
        .eq("id", id)
        .eq("project_id", project.id)
        .maybeSingle();
      if (error || !row) return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
      return NextResponse.json({ baseline: row });
    }

    const { data, error } = await supabase
      .from("project_baselines")
      .select("id, label, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ baselines: data ?? [] });
  } catch (error) {
    console.error("GET baselines error:", error);
    return NextResponse.json({ error: "Failed to load baselines" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/baselines — freeze the current schedule. Body: { label? } */
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

    const tasks = await listTasks(supabase, project.id);
    if (tasks.length === 0) {
      return NextResponse.json({ error: "El cronograma no tiene tareas que congelar" }, { status: 400 });
    }

    let label = "Línea base";
    try {
      const body = await request.json();
      if (typeof body?.label === "string" && body.label.trim()) label = body.label.trim().slice(0, 80);
    } catch { /* default label */ }

    const snapshot = tasks.map((t) => ({
      taskId: t.id,
      name: t.name,
      start: String(t.startDate).slice(0, 10),
      end: String(t.endDate).slice(0, 10),
    }));

    const { data: row, error } = await supabase
      .from("project_baselines")
      .insert({ project_id: project.id, owner_id: user.id, label, snapshot })
      .select("id, label, created_at")
      .single();
    if (error || !row) throw error ?? new Error("No se pudo crear la línea base");
    return NextResponse.json({ baseline: row }, { status: 201 });
  } catch (error) {
    console.error("POST baselines error:", error);
    return NextResponse.json({ error: "Failed to create baseline" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/baselines?id=<uuid> */
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
      .from("project_baselines")
      .delete()
      .eq("id", id)
      .eq("project_id", project.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE baselines error:", error);
    return NextResponse.json({ error: "Failed to delete baseline" }, { status: 500 });
  }
}
