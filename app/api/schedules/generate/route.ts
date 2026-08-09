import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSchedule } from "@/lib/schedule";

/**
 * POST /api/schedules/generate
 * Body: { prompt: string, budget?: object }
 * Generates a Colombian-standard construction schedule (Gantt tasks).
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

    let body: { prompt?: unknown; budget?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // Include budget context if provided (from Tool 3).
    let budgetContext: string | undefined;
    if (body.budget && typeof body.budget === "object") {
      budgetContext = JSON.stringify(body.budget).slice(0, 4000);
    }

    const schedule = await generateSchedule(prompt, budgetContext);
    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Schedule generation error:", error);
    const message =
      error instanceof Error ? error.message : "Error al generar el cronograma";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
