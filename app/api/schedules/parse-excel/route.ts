import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/schedules/parse-excel
 * Accepts a multipart/form-data upload with a single .xlsx file.
 * Parses the "Presupuesto" sheet (or first sheet) and extracts
 * chapters + items in a format the schedule AI can consume.
 *
 * This runs server-side because ExcelJS's browser build is unreliable.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se encontró el archivo" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo excede 25MB" }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);

    // Prefer "Presupuesto" sheet, fall back to first sheet
    const ws =
      wb.getWorksheet("Presupuesto") ??
      wb.worksheets[0];

    if (!ws) {
      return NextResponse.json({ error: "El Excel no contiene hojas" }, { status: 400 });
    }

    // Extract title from A2
    const tituloCell = ws.getCell("A2");
    const titulo =
      typeof tituloCell.value === "string" && tituloCell.value.trim()
        ? tituloCell.value.trim()
        : file.name.replace(/\.xlsx?$/i, "");

    const capitulos: Array<{
      nombre: string;
      items: Array<{ codigo: string; descripcion: string; unidad: string; cantidad: number }>;
    }> = [];
    let currentChapter: (typeof capitulos)[number] | null = null;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 5) return;

      const cellA = row.getCell(1);
      const cellB = row.getCell(2);
      const cellC = row.getCell(3);
      const cellD = row.getCell(4);

      const valA = cellText(cellA.value);
      const valB = cellText(cellB.value);
      const valC = cellText(cellC.value);
      const valD = cellNumber(cellD.value);

      if (!valA && !valB) return;
      if (valB.startsWith("└")) return;
      if (valB.toUpperCase().includes("TOTAL PRESUPUESTO")) return;

      // Detect chapter: fill color OR merged cells (A=B=C=D) OR uppercase text
      const isChapterFill = isChapterCell(cellA);
      // Merged cells: when A:H is merged, ExcelJS copies the value to all cells
      const isMergedChapter =
        valA.length > 3 &&
        valA === valB &&
        valA === valC &&
        !valA.match(/^[\d.]+$/);
      const isUpperLong =
        valA.length > 3 &&
        valA === valA.toUpperCase() &&
        !valC &&
        valD === null &&
        !valA.match(/^[\d.]+$/);

      if (isChapterFill || isUpperLong || isMergedChapter) {
        const chapterName = valA || valB;
        if (chapterName) {
          currentChapter = { nombre: chapterName, items: [] };
          capitulos.push(currentChapter);
        }
        return;
      }

      // Detect item: has code in A + description in B
      // Codes can be: "1.2", "PRE.1.1", "CAP.3.2.1", "E5", "A1" etc.
      const hasCode = !!valA.match(/^[A-Za-z]{0,5}\.?\d/) || !!valA.match(/^\d/);
      const hasDescription = valB.length > 2;

      if (hasCode && hasDescription) {
        if (!currentChapter) {
          currentChapter = { nombre: "PRESUPUESTO", items: [] };
          capitulos.push(currentChapter);
        }
        currentChapter.items.push({
          codigo: valA,
          descripcion: valB,
          unidad: valC || "global",
          cantidad: valD ?? 1,
        });
      }
    });

    const filtered = capitulos.filter((c) => c.items.length > 0);

    if (filtered.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se detectaron ítems de presupuesto. Asegúrate de subir un Excel generado por Costos y Presupuestos.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      titulo,
      capitulos: filtered,
    });
  } catch (error) {
    console.error("Excel parse error:", error);
    return NextResponse.json(
      { error: "Error al leer el Excel. ¿Es un archivo .xlsx válido?" },
      { status: 500 },
    );
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const v = value as {
      formula?: string;
      result?: unknown;
      richText?: Array<{ text: string }>;
      text?: string;
    };
    if (v.result !== null && v.result !== undefined) return String(v.result).trim();
    if (v.richText) return v.richText.map((r) => r.text).join("").trim();
    if (v.text) return v.text.trim();
  }
  return "";
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? null : n;
  }
  if (typeof value === "object" && value !== null) {
    const v = value as { result?: unknown };
    if (typeof v.result === "number") return v.result;
    if (typeof v.result === "string") {
      const n = parseFloat(v.result.replace(/[^\d.-]/g, ""));
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function isChapterCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as
    | { type?: string; pattern?: string; fgColor?: { argb?: string } }
    | undefined;
  if (!fill || fill.type !== "pattern") return false;
  const argb = fill.fgColor?.argb;
  return argb === "FF2A4A6B" || argb === "2A4A6B";
}
