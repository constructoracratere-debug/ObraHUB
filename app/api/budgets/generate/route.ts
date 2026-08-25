import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPriceItems } from "@/lib/prices";
import { generateBudget } from "@/lib/budget";

/**
 * POST /api/budgets/generate
 * Body: { prompt: string, country?: string }
 * Generates an APU budget from a natural language prompt.
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

    let body: { prompt?: unknown; country?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const country = body.country === "mexico" ? "mexico" : "colombia";

    // Load the price database for context.
    const prices = await listPriceItems(supabase, country);
    if (prices.length === 0) {
      return NextResponse.json(
        { error: "No hay precios disponibles en la base de datos" },
        { status: 500 },
      );
    }

    const budget = await generateBudget(prompt, prices, country);
    return NextResponse.json({ budget });
  } catch (error) {
    console.error("Budget generation error:", error);
    const message = error instanceof Error ? error.message : "Error al generar el presupuesto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
