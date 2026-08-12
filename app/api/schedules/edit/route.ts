import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editSchedule } from "@/lib/schedule";
import type { ScheduleTask } from "@/lib/schedule";

/**
 * POST /api/schedules/edit
 * Body: { tasks: ScheduleTask[], instruction: string, title: string, startDate: string }
 * Edits an existing construction schedule via natural language.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let body: {
      tasks?: unknown;
      instruction?: unknown;
      title?: unknown;
      startDate?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      return NextResponse.json(
        { error: "tasks array is required" },
        { status: 400 },
      );
    }

    const title =
      typeof body.title === "string" ? body.title : "Cronograma de Obra";
    const startDate =
      typeof body.startDate === "string"
        ? body.startDate
        : new Date().toISOString().split("T")[0];

    const schedule = await editSchedule(
      body.tasks as ScheduleTask[],
      instruction,
      title,
      startDate,
    );
    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Schedule edit error:", error);
    const message =
      error instanceof Error ? error.message : "Error al editar el cronograma";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
