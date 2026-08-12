import ExcelJS from "exceljs";

/**
 * Lightweight budget representation extracted from an Excel file.
 * This is what gets sent to the schedule AI to generate a Gantt chart.
 */
export type ImportedBudget = {
  titulo: string;
  capitulos: Array<{
    nombre: string;
    items: Array<{
      codigo: string;
      descripcion: string;
      unidad: string;
      cantidad: number;
    }>;
  }>;
};

/**
 * Parses an ObraHub-generated budget Excel (.xlsx) back into a structured
 * budget object that the schedule AI can use to generate a construction
 * Gantt chart.
 *
 * Also gracefully handles generic Excel files with columns like
 * "Descripción" / "Cantidad" / "Unidad" — the parser falls back to
 * detecting any row with text in column B as a potential task.
 *
 * Works in the browser (ExcelJS ships a browser build).
 */
export async function parseBudgetExcel(file: File): Promise<ImportedBudget> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  // Prefer the "Presupuesto" sheet, fall back to first sheet
  const ws =
    wb.getWorksheet("Presupuesto") ??
    wb.getWorksheet("presupuesto") ??
    wb.worksheets[0];

  if (!ws) {
    throw new Error("El archivo Excel no contiene hojas.");
  }

  // Extract the title from row 2 (A2), which is where the budget title goes
  const tituloCell = ws.getCell("A2");
  const titulo =
    typeof tituloCell.value === "string" && tituloCell.value.trim()
      ? tituloCell.value.trim()
      : file.name.replace(/\.xlsx?$/i, "");

  const capitulos: ImportedBudget["capitulos"] = [];
  let currentChapter: ImportedBudget["capitulos"][number] | null = null;
  let totalItems = 0;

  // Walk all rows. We identify:
  //   - Chapter headers: merged A:H rows with UPPER CASE text + dark fill
  //     (or any row where A has text but B,C,D are empty and A is long)
  //   - Item rows: A has a code (short, like "CAP.1.2" or "1.2.3"),
  //     B has a description, C has unit, D has quantity
  //   - Detail rows: B starts with "└" — skip these
  //   - Header row (row 5): "Código" in A — skip
  //   - Total row: B = "TOTAL PRESUPUESTO" — skip
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 5) return; // skip title + header rows

    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    const cellC = row.getCell(3);
    const cellD = row.getCell(4);

    const valA = cellText(cellA.value);
    const valB = cellText(cellB.value);
    const valC = cellText(cellC.value);
    const valD = cellNumber(cellD.value);

    // Skip empty rows
    if (!valA && !valB) return;

    // Skip detail rows (indented sub-items)
    if (valB.startsWith("└") || valB.startsWith("  └")) return;

    // Skip total row
    if (valB.toUpperCase().includes("TOTAL PRESUPUESTO")) return;

    // Detect chapter header:
    //   Option 1: Row is merged A:H with UPPER text + dark blue fill
    //   Option 2: valA is uppercase text, no valC/valD (no unit/qty)
    const isChapterFill = isChapterCell(cellA);
    const isUpperLong =
      valA.length > 3 &&
      valA === valA.toUpperCase() &&
      !valC &&
      valD === null &&
      !valA.match(/^[\d.]+$/); // not a code like "1.2"

    if (isChapterFill || isUpperLong) {
      const chapterName = valA || valB;
      if (chapterName) {
        currentChapter = { nombre: chapterName, items: [] };
        capitulos.push(currentChapter);
      }
      return;
    }

    // Detect item row: has a code in A and a description in B
    const hasCode = !!valA.match(/^[A-Za-z]?\d/) || !!valA.match(/^\d/);
    const hasDescription = valB.length > 2;

    if (hasCode && hasDescription) {
      const item = {
        codigo: valA,
        descripcion: valB,
        unidad: valC || "global",
        cantidad: valD ?? 1,
      };
      if (!currentChapter) {
        // No chapter seen yet — create a default one
        currentChapter = { nombre: "PRESUPUESTO", items: [] };
        capitulos.push(currentChapter);
      }
      currentChapter.items.push(item);
      totalItems++;
    }
  });

  // Filter out empty chapters
  const filtered = capitulos.filter((c) => c.items.length > 0);

  if (filtered.length === 0) {
    throw new Error(
      "No se pudieron detectar ítems de presupuesto en el Excel. Asegúrate de que el archivo tenga columnas Código, Descripción, Unidad y Cantidad.",
    );
  }

  return {
    titulo,
    capitulos: filtered,
  };
}

/** Extracts text from a cell value (handles shared strings, formulas, etc.) */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    // { formula, result } or { richText, hyperlinks, ... }
    const v = value as {
      formula?: string;
      result?: unknown;
      richText?: Array<{ text: string }>;
      text?: string;
    };
    if (v.result !== null && v.result !== undefined) {
      return String(v.result).trim();
    }
    if (v.richText) {
      return v.richText.map((r) => r.text).join("").trim();
    }
    if (v.text) return v.text.trim();
  }
  return "";
}

/** Extracts a number from a cell value */
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

/** Checks if a cell has the chapter-header fill color */
function isChapterCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as
    | { type?: string; pattern?: string; fgColor?: { argb?: string } }
    | undefined;
  if (!fill || fill.type !== "pattern") return false;
  const argb = fill.fgColor?.argb;
  // CHAPTER_FILL = FF2A4A6B in our Excel export
  return argb === "FF2A4A6B" || argb === "2A4A6B";
}
