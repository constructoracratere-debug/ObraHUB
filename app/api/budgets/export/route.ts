import { NextResponse } from "next/server";
import { buildBudgetWorkbook } from "@/lib/excel";
import type { APUBudget } from "@/lib/budget";

/**
 * POST /api/budgets/export
 * Body: { budget: APUBudget }
 * Returns a .xlsx file download.
 */
export async function POST(request: Request) {
  try {
    let body: { budget?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.budget) {
      return NextResponse.json({ error: "budget is required" }, { status: 400 });
    }

    const buffer = await buildBudgetWorkbook(body.budget as APUBudget);

    const filename = `Presupuesto_ObraHub_${Date.now()}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Excel export error:", error);
    return NextResponse.json({ error: "Error al exportar Excel" }, { status: 500 });
  }
}
