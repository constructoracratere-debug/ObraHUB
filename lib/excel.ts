import ExcelJS from "exceljs";
import type { APUBudget, APUItem } from "@/lib/budget";

/**
 * Generates a professional .xlsx workbook from an APU budget.
 * Two sheets: "Presupuesto" (full APU breakdown) + "Resumen" (summary).
 */

const CURRENCY_FMT = '"$"#,##0;[Red]-"$"#,##0';

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const HEADER_FILL = solidFill("FF1E3A5F");
const SUBHEADER_FILL = solidFill("FFD6E4F0");
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

/**
 * Builds the workbook and returns it as a Buffer for download.
 */
export async function buildBudgetWorkbook(budget: APUBudget): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ObraHub";
  wb.created = new Date();

  buildPresupuestoSheet(wb, budget);
  buildResumenSheet(wb, budget);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildPresupuestoSheet(wb: ExcelJS.Workbook, budget: APUBudget) {
  const ws = wb.addWorksheet("Presupuesto", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  // Column widths
  ws.columns = [
    { width: 10 },   // A: Código
    { width: 45 },   // B: Descripción
    { width: 8 },    // C: Unidad
    { width: 10 },   // D: Cantidad
    { width: 16 },   // E: Precio Unit. (Costo Directo)
    { width: 12 },   // F: % AIU
    { width: 18 },   // G: Precio Unit. Total
    { width: 18 },   // H: Parcial (Subtotal)
  ];

  // Title row
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "PRESUPUESTO DE OBRA — ANÁLISIS DE PRECIOS UNITARIOS (APU)";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  titleCell.alignment = { horizontal: "center" };

  // Subtitle (budget title)
  ws.mergeCells("A2:H2");
  const subCell = ws.getCell("A2");
  subCell.value = budget.titulo;
  subCell.font = { bold: true, size: 12 };
  subCell.alignment = { horizontal: "center" };

  // Date
  ws.mergeCells("A3:H3");
  const dateCell = ws.getCell("A3");
  dateCell.value = `Generado por ObraHub · ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}`;
  dateCell.font = { italic: true, size: 9, color: { argb: "FF888888" } };
  dateCell.alignment = { horizontal: "center" };

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

  for (const capitulo of budget.capitulos) {
    // Chapter header
    ws.mergeCells(`A${rowIdx}:H${rowIdx}`);
    const chCell = ws.getCell(`A${rowIdx}`);
    chCell.value = capitulo.nombre.toUpperCase();
    chCell.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    chCell.fill = SUBHEADER_FILL;
    chCell.border = THIN_BORDER;
    rowIdx++;

    // Items
    for (const item of capitulo.items) {
      const aiuPct = item.aiu.administracion + item.aiu.imprevistos + item.aiu.utilidad;
      ws.getCell(`A${rowIdx}`).value = item.codigo;
      ws.getCell(`B${rowIdx}`).value = item.descripcion;
      ws.getCell(`C${rowIdx}`).value = item.unidad;
      ws.getCell(`D${rowIdx}`).value = item.cantidad;
      ws.getCell(`E${rowIdx}`).value = item.costoDirecto;
      ws.getCell(`F${rowIdx}`).value = aiuPct / 100;
      ws.getCell(`G${rowIdx}`).value = item.precioUnitarioTotal;
      ws.getCell(`H${rowIdx}`).value = item.subtotal;

      // Format
      ws.getCell(`E${rowIdx}`).numFmt = CURRENCY_FMT;
      ws.getCell(`F${rowIdx}`).numFmt = "0.0%";
      ws.getCell(`G${rowIdx}`).numFmt = CURRENCY_FMT;
      ws.getCell(`H${rowIdx}`).numFmt = CURRENCY_FMT;

      for (let c = 1; c <= 8; c++) {
        ws.getCell(rowIdx, c).border = THIN_BORDER;
        ws.getCell(rowIdx, c).font = { size: 10 };
      }

      // APU detail rows (materials, labor, equipment)
      rowIdx = addAPUDetail(ws, rowIdx, "Materiales", item.materiales);
      rowIdx = addAPUDetail(ws, rowIdx, "Mano de Obra", item.manoObra);
      rowIdx = addAPUDetail(ws, rowIdx, "Equipos", item.equipos);

      // Blank separator
      rowIdx++;
    }
  }

  // Grand total
  const totalRow = rowIdx;
  ws.getCell(`B${totalRow}`).value = "TOTAL PRESUPUESTO";
  ws.getCell(`B${totalRow}`).font = { bold: true, size: 12 };
  ws.getCell(`H${totalRow}`).value = budget.resumen.total;
  ws.getCell(`H${totalRow}`).numFmt = CURRENCY_FMT;
  ws.getCell(`H${totalRow}`).font = { bold: true, size: 12 };
  for (let c = 1; c <= 8; c++) {
    ws.getCell(totalRow, c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F0FE" },
    };
    ws.getCell(totalRow, c).border = THIN_BORDER;
  }
}

function addAPUDetail(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  label: string,
  lines: Array<{ name: string; unit: string; qty: number; unitPrice: number; subtotal: number }>,
): number {
  for (const line of lines) {
    ws.getCell(`B${rowIdx}`).value = `  └ ${label}: ${line.name}`;
    ws.getCell(`B${rowIdx}`).font = { size: 9, color: { argb: "FF666666" } };
    ws.getCell(`C${rowIdx}`).value = line.unit;
    ws.getCell(`D${rowIdx}`).value = line.qty;
    ws.getCell(`D${rowIdx}`).numFmt = "0.000";
    ws.getCell(`E${rowIdx}`).value = line.unitPrice;
    ws.getCell(`E${rowIdx}`).numFmt = CURRENCY_FMT;
    ws.getCell(`H${rowIdx}`).value = line.subtotal;
    ws.getCell(`H${rowIdx}`).numFmt = CURRENCY_FMT;
    ws.getCell(`H${rowIdx}`).font = { size: 9, color: { argb: "FF666666" } };
    for (let c = 1; c <= 8; c++) {
      ws.getCell(rowIdx, c).border = {
        top: { style: "hair", color: { argb: "FFEEEEEE" } },
        bottom: { style: "hair", color: { argb: "FFEEEEEE" } },
      };
    }
    rowIdx++;
  }
  return rowIdx;
}

function buildResumenSheet(wb: ExcelJS.Workbook, budget: APUBudget) {
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 35 }, { width: 22 }];

  // Title
  ws.mergeCells("A1:B1");
  const title = ws.getCell("A1");
  title.value = "RESUMEN DEL PRESUPUESTO";
  title.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  title.alignment = { horizontal: "center" };

  const r = budget.resumen;
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

  // Total
  ws.getCell(`A${row}`).value = "TOTAL GENERAL";
  ws.getCell(`A${row}`).font = { bold: true, size: 13 };
  ws.getCell(`B${row}`).value = r.total;
  ws.getCell(`B${row}`).numFmt = CURRENCY_FMT;
  ws.getCell(`B${row}`).font = { bold: true, size: 13 };
  for (let c = 1; c <= 2; c++) {
    ws.getCell(row, c).fill = SUBHEADER_FILL;
    ws.getCell(row, c).border = THIN_BORDER;
  }
}
