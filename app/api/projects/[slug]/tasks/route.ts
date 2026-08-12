import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTasks, replaceTasks, updateTask, deleteTask } from "@/lib/gantt-tasks";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** GET /api/projects/[slug]/tasks — list all Gantt tasks for a project. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const tasks = await listTasks(supabase, project.id);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("GET tasks error:", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/tasks — replace all tasks (new schedule). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    let body: { tasks?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body.tasks)) {
      return NextResponse.json({ error: "tasks array is required" }, { status: 400 });
    }

    const tasks = await replaceTasks(
      supabase,
      project.id,
      user.id,
      body.tasks as Array<{
        name: string;
        startDate: string;
        endDate: string;
        progress?: number;
        dependencies?: string[];
        taskType?: string;
        description?: string;
        sortOrder?: number;
      }>,
    );
    return NextResponse.json({ tasks }, { status: 201 });
  } catch (error) {
    console.error("POST tasks error:", error);
    return NextResponse.json({ error: "Failed to save tasks" }, { status: 500 });
  }
}

/** PATCH /api/projects/[slug]/tasks — update a single task. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const taskId = body.id as string;
    if (!taskId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await updateTask(supabase, taskId, {
      name: body.name as string | undefined,
      description: body.description as string | undefined,
      startDate: body.startDate as string | undefined,
      endDate: body.endDate as string | undefined,
      progress: body.progress as number | undefined,
      dependencies: body.dependencies as string[] | undefined,
      taskType: body.taskType as string | undefined,
      color: body.color as string | null | undefined,
      sortOrder: body.sortOrder as number | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH tasks error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/tasks?id=<taskId> — delete a single task. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const taskId = new URL(request.url).searchParams.get("id");
    if (!taskId) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await deleteTask(supabase, taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE tasks error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
