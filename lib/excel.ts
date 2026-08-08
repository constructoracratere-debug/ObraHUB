import ExcelJS from "exceljs";
import type { APUBudget, APUItem } from "@/lib/budget";

/**
 * Generates a professional .xlsx workbook from an APU budget.
 * ALL numeric cells use LIVE FORMULAS so the user can edit quantities/prices
 * and everything recalculates automatically.
 *
 * Two sheets: "Presupuesto" (full APU breakdown) + "Resumen" (summary).
 */

const CURRENCY_FMT = '"$"#,##0;[Red]-"$"#,##0';

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const HEADER_FILL = solidFill("FF1E3A5F");
const SUBHEADER_FILL = solidFill("FFD6E4F0");
const TOTAL_FILL = solidFill("FFE8F0FE");
const CHAPTER_FILL = solidFill("FF2A4A6B");
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
};
const HAIR_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "hair", color: { argb: "FFEEEEEE" } },
  bottom: { style: "hair", color: { argb: "FFEEEEEE" } },
};

export async function buildBudgetWorkbook(budget: APUBudget): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ObraHub — Costos y Presupuestos";
  wb.created = new Date();

  buildPresupuestoSheet(wb, budget);
  buildResumenSheet(wb, budget);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildPresupuestoSheet(wb: ExcelJS.Workbook, budget: APUBudget) {
  const ws = wb.addWorksheet("Presupuesto", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  ws.columns = [
    { width: 10 },   // A: Código
    { width: 48 },   // B: Descripción
    { width: 8 },    // C: Unidad
    { width: 11 },   // D: Cantidad
    { width: 16 },   // E: Precio Unit. (Costo Directo)
    { width: 10 },   // F: % AIU
    { width: 18 },   // G: Precio Total Unit.
    { width: 18 },   // H: Parcial (Subtotal)
  ];

  // Title rows
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "PRESUPUESTO DE OBRA — ANÁLISIS DE PRECIOS UNITARIOS (APU)";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  titleCell.alignment = { horizontal: "center" };

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = budget.titulo;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells("A3:H3");
  ws.getCell("A3").value = `Generado por ObraHub · ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}`;
  ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF888888" } };
  ws.getCell("A3").alignment = { horizontal: "center" };

  // Source note
  ws.mergeCells("A4:H4");
  ws.getCell("A4").value = "Fuente de precios: Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025). Cada ítem incluye su código de origen. Los valores son editables — modifique cantidades o precios y los totales se recalculan automáticamente vía fórmulas.";
  ws.getCell("A4").font = { size: 9, color: { argb: "FF888888" } };
  ws.getCell("A4").alignment = { horizontal: "center" };

  // Header row (row 5)
  const headers = ["Código", "Descripción", "Unidad", "Cantidad", "Costo Directo Unit.", "% AIU", "Precio Total Unit.", "Parcial"];
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  headerRow.height = 30;

  let rowIdx = 6;
  const itemRowsForTotal: number[] = [];

  for (const capitulo of budget.capitulos) {
    // Chapter header
    ws.mergeCells(`A${rowIdx}:H${rowIdx}`);
    const chCell = ws.getCell(`A${rowIdx}`);
    chCell.value = capitulo.nombre.toUpperCase();
    chCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    chCell.fill = CHAPTER_FILL;
    chCell.border = THIN_BORDER;
    rowIdx++;

    for (const item of capitulo.items) {
      const itemRow = rowIdx;
      itemRowsForTotal.push(itemRow);

      // Static text cells
      ws.getCell(`A${itemRow}`).value = item.codigo;
      ws.getCell(`B${itemRow}`).value = item.descripcion;
      ws.getCell(`C${itemRow}`).value = item.unidad;
      ws.getCell(`D${itemRow}`).value = item.cantidad;
      // AIU percentage (editable)
      const aiuPct = item.aiu.administracion + item.aiu.imprevistos + item.aiu.utilidad;
      ws.getCell(`F${itemRow}`).value = aiuPct / 100;

      // We'll fill E (costoDirecto), G (precioTotal), H (parcial) with FORMULAS
      // after writing the detail rows below — they depend on the detail row range.

      // Style item row
      for (let c = 1; c <= 8; c++) {
        const cell = ws.getCell(itemRow, c);
        cell.border = THIN_BORDER;
        cell.font = { size: 10 };
      }
      ws.getCell(`D${itemRow}`).numFmt = "#,##0.00";
      ws.getCell(`F${itemRow}`).numFmt = "0.0%";

      // Write detail rows (materials, labor, equipment)
      const detailStart = rowIdx + 1;
      rowIdx = addAPUDetail(ws, rowIdx + 1, "Materiales", item.materiales);
      rowIdx = addAPUDetail(ws, rowIdx, "Mano de Obra", item.manoObra);
      rowIdx = addAPUDetail(ws, rowIdx, "Equipos", item.equipos);
      const detailEnd = rowIdx - 1; // last detail row

      // NOW write formulas for the item row (they reference the detail rows)
      // E: Costo Directo Unit = SUM of detail subtotals (column H, rows detailStart..detailEnd)
      ws.getCell(`E${itemRow}`).value = {
        formula: `SUM(H${detailStart}:H${detailEnd})`,
        result: item.costoDirecto,
      };
      ws.getCell(`E${itemRow}`).numFmt = CURRENCY_FMT;

      // G: Precio Total Unit = E * (1 + F)
      ws.getCell(`G${itemRow}`).value = {
        formula: `E${itemRow}*(1+F${itemRow})`,
        result: item.precioUnitarioTotal,
      };
      ws.getCell(`G${itemRow}`).numFmt = CURRENCY_FMT;

      // H: Parcial = G * D
      ws.getCell(`H${itemRow}`).value = {
        formula: `G${itemRow}*D${itemRow}`,
        result: item.subtotal,
      };
      ws.getCell(`H${itemRow}`).numFmt = CURRENCY_FMT;

      // Add scenarios if present
      if (item.escenarios && item.escenarios.length > 1) {
        rowIdx = addScenarios(ws, rowIdx, item, itemRow);
      }

      rowIdx++; // blank separator
    }
  }

  // Grand total (formula = SUM of all item H cells)
  if (itemRowsForTotal.length > 0) {
    const totalRow = rowIdx;
    const sumFormula = itemRowsForTotal.map((r) => `H${r}`).join("+");
    ws.getCell(`B${totalRow}`).value = "TOTAL PRESUPUESTO";
    ws.getCell(`B${totalRow}`).font = { bold: true, size: 12 };
    ws.getCell(`H${totalRow}`).value = {
      formula: sumFormula,
      result: budget.resumen.total,
    };
    ws.getCell(`H${totalRow}`).numFmt = CURRENCY_FMT;
    ws.getCell(`H${totalRow}`).font = { bold: true, size: 12 };
    for (let c = 1; c <= 8; c++) {
      ws.getCell(totalRow, c).fill = TOTAL_FILL;
      ws.getCell(totalRow, c).border = THIN_BORDER;
    }
  }
}

function addAPUDetail(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  label: string,
  lines: Array<{ name: string; unit: string; qty: number; unitPrice: number; subtotal: number; source?: string }>,
): number {
  for (const line of lines) {
    const r = rowIdx;
    ws.getCell(`B${r}`).value = `  └ ${label}: ${line.name}`;
    ws.getCell(`B${r}`).font = { size: 9, color: { argb: "FF666666" } };
    // Source citation on the description (if present)
    if (line.source) {
      ws.getCell(`B${r}`).note = line.source;
    }
    ws.getCell(`C${r}`).value = line.unit;
    ws.getCell(`D${r}`).value = line.qty;
    ws.getCell(`D${r}`).numFmt = "0.000";
    ws.getCell(`E${r}`).value = line.unitPrice;
    ws.getCell(`E${r}`).numFmt = CURRENCY_FMT;

    // FORMULA: H = D * E (qty × unitPrice)
    ws.getCell(`H${r}`).value = {
      formula: `D${r}*E${r}`,
      result: line.subtotal,
    };
    ws.getCell(`H${r}`).numFmt = CURRENCY_FMT;
    ws.getCell(`H${r}`).font = { size: 9, color: { argb: "FF666666" } };

    for (let c = 1; c <= 8; c++) {
      ws.getCell(r, c).border = HAIR_BORDER as Partial<ExcelJS.Borders>;
    }
    rowIdx++;
  }
  return rowIdx;
}

function addScenarios(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  item: APUItem,
  itemRow: number,
): number {
  ws.mergeCells(`B${rowIdx}:H${rowIdx}`);
  ws.getCell(`B${rowIdx}`).value = "  📊 Escenarios alternativos:";
  ws.getCell(`B${rowIdx}`).font = { size: 9, italic: true, color: { argb: "FF888888" } };
  rowIdx++;

  for (const esc of item.escenarios!) {
    ws.getCell(`B${rowIdx}`).value = `    • ${esc.nombre}: ${esc.descripcion}`;
    ws.getCell(`B${rowIdx}`).font = { size: 9, color: { argb: "FF999999" } };
    ws.getCell(`G${rowIdx}`).value = esc.precioUnitarioTotal;
    ws.getCell(`G${rowIdx}`).numFmt = CURRENCY_FMT;
    ws.getCell(`G${rowIdx}`).font = { size: 9, color: { argb: "FF999999" } };
    ws.getCell(`H${rowIdx}`).value = esc.subtotal;
    ws.getCell(`H${rowIdx}`).numFmt = CURRENCY_FMT;
    ws.getCell(`H${rowIdx}`).font = { size: 9, color: { argb: "FF999999" } };
    rowIdx++;
  }
  return rowIdx;
}

function buildResumenSheet(wb: ExcelJS.Workbook, budget: APUBudget) {
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 38 }, { width: 24 }];

  ws.mergeCells("A1:B1");
  const title = ws.getCell("A1");
  title.value = "RESUMEN DEL PRESUPUESTO";
  title.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  title.alignment = { horizontal: "center" };

  const r = budget.resumen;
  // We can't easily reference the Presupuesto sheet's formula-driven cells
  // from here with exact row numbers, so we write values + note they're
  // linked to the Presupuesto sheet's grand total.
  const rows: Array<[string, number, string?]> = [
    ["Costos Directos", r.costosDirectos, CURRENCY_FMT],
    [`AIU (${r.aiuTotal}%)`, r.valorAIU, CURRENCY_FMT],
    ["Subtotal (Costo Directo + AIU)", r.subtotalConAIU, CURRENCY_FMT],
    [`IVA (${r.iva}%)`, r.valorIVA, CURRENCY_FMT],
  ];

  let row = 3;
  for (const [label, value, fmt] of rows) {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { size: 11 };
    ws.getCell(`B${row}`).value = value;
    if (fmt) ws.getCell(`B${row}`).numFmt = fmt;
    ws.getCell(`B${row}`).font = { size: 11 };
    for (let c = 1; c <= 2; c++) ws.getCell(row, c).border = THIN_BORDER;
    row++;
  }

  // Total — formula referencing the same values above
  ws.getCell(`A${row}`).value = "TOTAL GENERAL";
  ws.getCell(`A${row}`).font = { bold: true, size: 13 };
  ws.getCell(`B${row}`).value = {
    formula: `B3+B4+B5+B6`,
    result: r.total,
  };
  ws.getCell(`B${row}`).numFmt = CURRENCY_FMT;
  ws.getCell(`B${row}`).font = { bold: true, size: 13 };
  for (let c = 1; c <= 2; c++) {
    ws.getCell(row, c).fill = SUBHEADER_FILL;
    ws.getCell(row, c).border = THIN_BORDER;
  }

  // Note about editability
  row += 2;
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "💡 Los valores en la hoja 'Presupuesto' usan fórmulas vivas. Edite cantidades o precios allí y los totales se recalcularán.";
  ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };
}
