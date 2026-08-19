import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail, listBitacoraEntries } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

type RouteContext = { params: Promise<{ slug: string }> };

const DARK = "FF0A1120";
const ACCENT = "FF0EA5E9";
const GOOD = "FF10B981";
const WARN = "FFF59E0B";
const BAD = "FFEF4444";
const LIGHT = "FFF8FAFC";
const BORDER = "FFE2E8F0";

function headerRow(ws: ExcelJS.Worksheet, cols: string[], widths?: number[]) {
  const r = ws.addRow(cols);
  r.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.alignment = { vertical: "middle" };
  });
  r.height = 22;
  if (widths) widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function title(ws: ExcelJS.Worksheet, text: string, span = 8) {
  ws.mergeCells(1, 1, 1, span);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 34;
}

const day = (d: string) => Math.round(Date.parse(`${d}T00:00:00`) / 86400000);
const fmtCop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/**
 * GET /api/projects/[slug]/report-excel — ObraHub · Memoria de Obra.
 * Professional multi-sheet workbook: Portada, Resumen (KPIs), Cronograma
 * with a cell-painted Gantt, Bitácora, Presupuesto with full breakdown,
 * and Anexos (RFIs/Submittals/BCF, Punch, Órdenes de cambio).
 */
export async function GET(_r: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const proj = (await s.from("projects").select("name, city, created_at").eq("id", p.id).single()).data as Record<string, any> ?? {};

    const [tasks, budgets] = await Promise.all([listTasks(s, p.id), listBudgets(s, p.id)]);
    const entries = await listBitacoraEntries(s, p.id, { from: "2000-01-01", to: "2999-12-31" });
    const rain = entries.map((e) => ({ entryDate: e.entryDate, rainHours: e.rainHours }));
    const points = entries.flatMap((e) => (e.taskProgress ?? []).map((tp) => ({ entryDate: e.entryDate, taskId: tp.taskId, progress: tp.progress })));
    const detail = budgets[0] ? (await getBudgetDetail(s, budgets[0].id)) : null;
    const d = computeDashboard(
      tasks.map((t) => ({ id: t.id, name: t.name, startDate: String(t.startDate).slice(0, 10), endDate: String(t.endDate).slice(0, 10), progress: Number(t.progress ?? 0) })),
      (detail?.items ?? []).map((i) => ({ id: i.id, chapter: i.chapter, descripcion: i.descripcion, cantidad: i.cantidad, precioUnitarioTotal: i.precioUnitarioTotal, subtotal: i.subtotal, cantidadEjecutada: i.cantidadEjecutada, taskId: i.taskId })),
      points, rain,
    );
    const alerts = buildAlerts(d, rain);
    const { data: rfis } = await s.from("project_rfis").select("code, title, kind, status, assignee, due_date").eq("project_id", p.id).order("created_at", { ascending: false });
    const { data: punch } = await s.from("project_punch_items").select("code, title, location, status").eq("project_id", p.id);
    const { data: cos } = await s.from("project_change_orders").select("code, title, impact_total, schedule_days, status").eq("project_id", p.id);

    const wb = new ExcelJS.Workbook();
    wb.creator = "ObraHub · Cratere S.A.S.";
    wb.created = new Date();

    // ── Portada ─────────────────────────────────────────────
    const cover = wb.addWorksheet("Portada", { views: [{ showGridLines: false }] });
    cover.getColumn(1).width = 4; cover.getColumn(2).width = 46; cover.getColumn(3).width = 40;
    cover.mergeCells("B2:C2");
    cover.getCell("B2").value = "OBRahUB — MEMORIA DE OBRA";
    cover.getCell("B2").font = { bold: true, size: 24, color: { argb: "FFFFFFFF" } };
    cover.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    cover.getCell("B2").alignment = { vertical: "middle", indent: 1 };
    cover.getRow(2).height = 52;
    cover.mergeCells("B3:C3");
    cover.getCell("B3").value = `${proj.name ?? slug}${proj.city ? ` — ${proj.city}` : ""}`;
    cover.getCell("B3").font = { bold: true, size: 14, color: { argb: DARK } };
    const meta: Array<[string, string]> = [
      ["Generado", new Date().toLocaleString("es-CO")],
      ["Generado por", user.email ?? ""],
      ["Proyectos ObraHub", "Construction OS · Powered by Cratere S.A.S."],
      ["Tareas del cronograma", String(tasks.length)],
      ["Presupuesto (BAC)", d.bac > 0 ? fmtCop(d.bac) : "—"],
      ["Bitácora registrada", `${entries.length} día(s)`],
    ];
    meta.forEach(([k, v], i) => {
      const r = cover.getRow(5 + i);
      r.getCell(2).value = k; r.getCell(2).font = { bold: true, color: { argb: "FF334155" } };
      r.getCell(3).value = v;
    });

    // ── Resumen (KPIs) ─────────────────────────────────────
    const kpi = wb.addWorksheet("Resumen");
    title(kpi, "Resumen ejecutivo de obra");
    headerRow(kpi, ["Indicador", "Valor", "Lectura"], [34, 22, 46]);
    const k = d.kpis;
    const rowsK: Array<[string, string, string]> = [
      ["Avance físico real", `${k.progressEarned.toFixed(1)}%`, `Plan: ${k.progressPlanned.toFixed(1)}%`],
      ["SPI (cronograma)", k.spi != null ? k.spi.toFixed(2) : "—", k.spi == null ? "sin plan" : k.spi >= 1 ? "en hora" : k.spi >= 0.9 ? "leve atraso" : "atrasado"],
      ["CPI (costo)", k.cpi != null ? k.cpi.toFixed(2) : "—", k.cpi == null ? "sin costo real" : k.cpi >= 1 ? "bajo presupuesto" : "sobrecosto"],
      ["Fin proyectado", k.projectedEnd ?? "—", `Plan: ${d.window.end}`],
      ["Lluvia acumulada", `${d.rainHoursTotal.toFixed(1)} h`, `${d.rainDays} día(s) — causal de plazo`],
      ["Alertas activas", String(alerts.length), `${alerts.filter((a) => a.level === "critica").length} críticas`],
    ];
    rowsK.forEach((row) => {
      const r = kpi.addRow(row);
      r.getCell(2).font = { bold: true };
      r.eachCell((c) => (c.border = { bottom: { style: "thin", color: { argb: BORDER } } }));
    });
    if (alerts.length > 0) {
      kpi.addRow([]);
      const h = kpi.addRow(["Alertas para comité", "Nivel", "Evidencia"]);
      h.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }; });
      alerts.slice(0, 10).forEach((a) => {
        const r = kpi.addRow([a.title, a.level === "critica" ? "CRÍTICA" : "AVISO", a.evidence]);
        if (a.level === "critica") r.getCell(2).font = { bold: true, color: { argb: BAD } };
      });
    }

    // ── Cronograma con Gantt pintado ───────────────────────
    const g = wb.addWorksheet("Cronograma");
    title(g, "Cronograma de obra — diagrama de Gantt", 14);
    let min = Infinity, max = -Infinity;
    for (const t of tasks) { const a = day(String(t.startDate).slice(0, 10)), b = day(String(t.endDate).slice(0, 10)); min = Math.min(min, a); max = Math.max(max, b); }
    const span = Number.isFinite(min) ? Math.min(90, Math.max(1, max - min + 1)) : 1;
    const colDay = (offset: number) => min + offset;
    headerRow(g, ["Tarea", "Inicio", "Fin", "Avance", ...Array.from({ length: span }, (_, i) => (span <= 31 ? `d${i + 1}` : `s${Math.floor(i / 7) + 1}`))], [36, 12, 12, 9, ...Array(span).fill(3.2)]);
    tasks.forEach((t) => {
      const st = String(t.startDate).slice(0, 10), en = String(t.endDate).slice(0, 10);
      const r = g.addRow([t.name, st, en, `${Number(t.progress ?? 0)}%`]);
      r.getCell(4).alignment = { horizontal: "center" };
      const prog = Number(t.progress ?? 0);
      const fill = prog >= 100 ? GOOD : prog > 0 ? WARN : ACCENT;
      for (let i = 0; i < span; i++) {
        const cd = colDay(i);
        const c = r.getCell(5 + i);
        if (cd >= day(st) && cd <= day(en)) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
          // Franja de progreso: celdas más oscuras hasta el % (mini-barra)
          if (prog > 0 && cd <= day(st) + Math.round((day(en) - day(st)) * prog / 100)) {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: prog >= 100 ? "FF059669" : "FFD97706" } };
          }
        }
      }
    });

    // ── Bitácora ───────────────────────────────────────────
    const b = wb.addWorksheet("Bitácora");
    title(b, "Bitácora diaria de obra");
    headerRow(b, ["Fecha", "Clima", "Lluvia (h)", "Personal", "Detalle personal", "Equipo", "Observaciones", "Incidentes", "Atrasos"], [12, 10, 10, 10, 26, 22, 40, 26, 26]);
    entries.forEach((e) => {
      b.addRow([e.entryDate, e.weather, e.rainHours, e.workersTotal,
        Object.entries(e.workersDetail ?? {}).map(([k2, v]) => `${k2}: ${v}`).join(", "),
        Object.entries(e.equipment ?? {}).map(([k2, v]) => `${k2}: ${v}`).join(", "),
        e.observations, e.incidents, e.delays]);
    });

    // ── Presupuesto (desglose completo) ────────────────────
    const pr = wb.addWorksheet("Presupuesto");
    title(pr, `Presupuesto — ${detail?.title ?? budgets[0]?.title ?? ""}`);
    headerRow(pr, ["Capítulo", "Código", "Ítem", "Unidad", "Cantidad", "Recurso", "Tipo", "Cant.", "Vr. unit.", "Subtotal", "Fuente"], [22, 8, 34, 8, 10, 28, 13, 8, 13, 14, 24]);
    let totalRows = 0;
    for (const it of detail?.items ?? []) {
      const det = it.detalle as { materiales?: any[]; manoObra?: any[]; equipos?: any[] } | null;
      const lines: Array<[string, any[]]> = [["Material", det?.materiales ?? []], ["Mano de obra", det?.manoObra ?? []], ["Equipo", det?.equipos ?? []]];
      const has = lines.some(([, a]) => a.length > 0);
      if (!has) {
        const r = pr.addRow([it.chapter, it.codigo, it.descripcion, it.unidad, it.cantidad, "(consolidado)", "", 1, it.precioUnitarioTotal, it.subtotal, ""]);
        r.getCell(9).numFmt = "#,##0"; r.getCell(10).numFmt = "#,##0";
        totalRows++;
      }
      for (const [tipo, arr] of lines) {
        for (const l of arr) {
          const r = pr.addRow([it.chapter, it.codigo, it.descripcion, it.unidad, it.cantidad, l.name ?? "", tipo, l.qty ?? "", l.unitPrice ?? "", l.subtotal ?? "", l.source ?? ""]);
          r.getCell(9).numFmt = "#,##0"; r.getCell(10).numFmt = "#,##0";
          totalRows++;
        }
      }
    }
    void totalRows;
    if (detail) {
      pr.addRow([]);
      const tr = pr.addRow([`TOTAL: ${fmtCop(detail.total)} COP (AIU 22% + IVA 19% incluidos)`]);
      tr.font = { bold: true, color: { argb: DARK } };
      tr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    }

    // ── Anexos: issues ─────────────────────────────────────
    const an = wb.addWorksheet("Issues y Cambios");
    title(an, "RFIs · Submittals · BCF · Punch List · Órdenes de cambio");
    headerRow(an, ["Tipo", "Código", "Título", "Estado", "Responsable/Ubicación", "Vence/Impacto"], [14, 10, 44, 18, 26, 20]);
    for (const x of (rfis ?? []) as Array<Record<string, any>>) an.addRow([x.kind === "submittal" ? "Submittal" : x.kind === "bcf" ? "BCF" : "RFI", x.code, x.title, x.status, x.assignee ?? "", x.due_date ? String(x.due_date).slice(0, 10) : ""]);
    for (const x of (punch ?? []) as Array<Record<string, any>>) an.addRow(["Punch", x.code, x.title, x.status, x.location ?? "", ""]);
    for (const x of (cos ?? []) as Array<Record<string, any>>) an.addRow(["Orden de cambio", x.code, x.title, x.status, "", `${fmtCop(Number(x.impact_total ?? 0))}${Number(x.schedule_days ?? 0) > 0 ? ` · +${x.schedule_days}d` : ""}`]);

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Memoria_Obra_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("report-excel:", e);
    return NextResponse.json({ error: "No se pudo generar el Excel" }, { status: 500 });
  }
}
