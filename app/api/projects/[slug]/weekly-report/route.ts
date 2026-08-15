import { NextRequest, NextResponse } from "next/server";
import pptxgen from "pptxgenjs";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail } from "@/lib/project-controls";
import { computeDashboard } from "@/lib/earned-value";
import { buildAlerts } from "@/lib/alerts";

type RouteContext = { params: Promise<{ slug: string }> };

const DARK = "0A1120";
const ACCENT = "0EA5E9";
const GOOD = "10B981";
const WARN = "F59E0B";
const BAD = "EF4444";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/projects/[slug]/weekly-report — assembly-ready weekly PPTX.
 * Deterministic (no AI call): KPIs, alerts, S-curve, task semaphore and the
 * week's bitácora, straight from the control dashboard.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const { data: projRow } = await supabase
      .from("projects")
      .select("name, slug")
      .eq("id", project.id)
      .single();
    const projectName = (projRow as Record<string, any> | null)?.name ?? slug;
    const projectSlugName = (projRow as Record<string, any> | null)?.slug ?? slug;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 6 * 86400000);
    const from = iso(weekAgo);
    const to = iso(now);

    const [tasks, budgets] = await Promise.all([
      listTasks(supabase, project.id),
      listBudgets(supabase, project.id),
    ]);
    const budget = budgets[0] ? await getBudgetDetail(supabase, budgets[0].id) : null;

    const { data: entries } = await supabase
      .from("bitacora_entries")
      .select("id, entry_date, weather, rain_hours, workers_total, observations")
      .eq("project_id", project.id)
      .order("entry_date", { ascending: true });
    const entryRows = (entries ?? []) as Array<Record<string, any>>;

    const points: Array<{ entryDate: string; taskId: string; progress: number }> = [];
    if (entryRows.length > 0) {
      const { data: prog } = await supabase
        .from("bitacora_task_progress")
        .select("entry_id, task_id, progress")
        .in("entry_id", entryRows.map((e) => e.id as string));
      const dateBy = new Map(entryRows.map((e) => [e.id as string, String(e.entry_date).slice(0, 10)]));
      for (const p of ((prog ?? []) as Array<Record<string, any>>)) {
        const d = dateBy.get(p.entry_id);
        if (d) points.push({ entryDate: d, taskId: p.task_id, progress: Number(p.progress ?? 0) });
      }
    }
    const rain = entryRows.map((e) => ({
      entryDate: String(e.entry_date).slice(0, 10),
      rainHours: Number(e.rain_hours ?? 0),
    }));

    const d = computeDashboard(
      tasks.map((t) => ({
        id: t.id, name: t.name,
        startDate: String(t.startDate).slice(0, 10),
        endDate: String(t.endDate).slice(0, 10),
        progress: Number(t.progress ?? 0),
      })),
      (budget?.items ?? []).map((i) => ({
        id: i.id, chapter: i.chapter, descripcion: i.descripcion, cantidad: i.cantidad,
        precioUnitarioTotal: i.precioUnitarioTotal, subtotal: i.subtotal,
        cantidadEjecutada: i.cantidadEjecutada, taskId: i.taskId,
      })),
      points, rain,
    );
    const alerts = buildAlerts(d, rain);
    const weekEntries = entryRows.filter((e) => {
      const day = String(e.entry_date).slice(0, 10);
      return day >= from && day <= to;
    });

    const pptx = new pptxgen();
    pptx.defineLayout({ name: "W", width: 13.33, height: 7.5 });
    pptx.layout = "W";
    pptx.author = "ObraHub";
    pptx.title = `Informe semanal — ${projectName}`;

    // --- S1 Portada
    const s1 = pptx.addSlide();
    s1.background = { color: DARK };
    s1.addText("OBRahub".toUpperCase(), { x: 0.6, y: 0.5, w: 3, fontSize: 16, bold: true, color: ACCENT });
    s1.addText(projectName, { x: 0.6, y: 2.4, w: 12, fontSize: 40, bold: true, color: "FFFFFF" });
    s1.addText("Informe Semanal de Asamblea", { x: 0.6, y: 3.5, w: 12, fontSize: 22, color: "CBD5E1" });
    s1.addText(`Semana del ${from} al ${to}  ·  Generado ${iso(now)}`, {
      x: 0.6, y: 4.2, w: 12, fontSize: 13, color: "64748B",
    });

    // --- S2 Resumen ejecutivo
    const s2 = pptx.addSlide();
    s2.background = { color: "F8FAFC" };
    s2.addText("Resumen ejecutivo", { x: 0.6, y: 0.4, fontSize: 26, bold: true, color: "0F172A" });
    const k = d.kpis;
    const cop = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
    s2.addTable(
      [
        [
          { text: "Indicador", options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } } },
          { text: "Valor", options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } } },
          { text: "Lectura", options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } } },
        ],
        [{ text: "Avance físico real" }, { text: `${k.progressEarned.toFixed(1)}%` }, { text: `Plan: ${k.progressPlanned.toFixed(1)}%` }],
        [{ text: "SPI (cronograma)" }, { text: k.spi != null ? k.spi.toFixed(2) : "—" }, { text: k.spi == null ? "sin plan" : k.spi >= 1 ? "en hora" : k.spi >= 0.9 ? "leve atraso" : "atrasado" }],
        [{ text: "CPI (costo)" }, { text: k.cpi != null ? k.cpi.toFixed(2) : "—" }, { text: k.cpi == null ? "sin costo real" : k.cpi >= 1 ? "bajo presupuesto" : "sobrecosto" }],
        [{ text: "Presupuesto (BAC)" }, { text: d.bac > 0 ? cop(d.bac) : "—" }, { text: `${d.linkedItems}/${d.totalItems} ítems vinculados` }],
        [{ text: "Fin proyectado" }, { text: k.projectedEnd ?? "—" }, { text: `Plan: ${d.window.end}` }],
        [{ text: "Lluvia acumulada" }, { text: `${d.rainHoursTotal.toFixed(1)} h` }, { text: `${d.rainDays} día(s) — causal de plazo` }],
        [{ text: "Alertas activas" }, { text: String(alerts.length) }, { text: `${alerts.filter((a) => a.level === "critica").length} críticas` }],
      ],
      { x: 0.6, y: 1.3, w: 12.1, fontSize: 13, color: "0F172A", border: { pt: 1, color: "E2E8F0" }, rowH: 0.5 },
    );

    // --- S3 Curva S
    const s3 = pptx.addSlide();
    s3.background = { color: "F8FAFC" };
    s3.addText("Curva S — avance físico (%)", { x: 0.6, y: 0.4, fontSize: 26, bold: true, color: "0F172A" });
    if (d.series.length > 1) {
      const stride = Math.max(1, Math.ceil(d.series.length / 24));
      const sampled = d.series.filter((_, i) => i % stride === 0 || i === d.series.length - 1);
      const labels = sampled.map((p) => p.date.slice(5));
      s3.addChart(
        pptx.ChartType.line,
        [
          { name: "Plan %", labels, values: sampled.map((p) => +p.planned.toFixed(1)) },
          { name: "Real %", labels, values: sampled.map((p) => +(p.earned ?? 0).toFixed(1)) },
        ],
        { x: 0.6, y: 1.2, w: 12.1, h: 5.4, showLegend: true, legendPos: "b", lineSize: 2 },
      );
    } else {
      s3.addText("Sin datos suficientes para la curva.", { x: 0.6, y: 3, fontSize: 14, color: "64748B" });
    }

    // --- S4 Semáforo de tareas
    const s4 = pptx.addSlide();
    s4.background = { color: "F8FAFC" };
    s4.addText("Estado de tareas", { x: 0.6, y: 0.4, fontSize: 26, bold: true, color: "0F172A" });
    const stCls: Record<string, string> = { atrasada: BAD, en_punto: GOOD, adelantada: ACCENT, no_iniciada: "64748B" };
    s4.addTable(
      [
        ["Tarea", "Inicio", "Fin", "Plan", "Real", "Estado"].map((t) => ({
          text: t, options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } },
        })),
        ...d.tasks.slice(0, 14).map((t) => [
          { text: t.name.slice(0, 40) }, { text: t.startDate }, { text: t.endDate },
          { text: `${t.planned.toFixed(0)}%` }, { text: `${t.progress.toFixed(0)}%` },
          { text: t.status, options: { color: "FFFFFF", bold: true, fill: { color: stCls[t.status] ?? "64748B" } } },
        ]),
      ],
      { x: 0.6, y: 1.2, w: 12.1, fontSize: 12, color: "0F172A", border: { pt: 1, color: "E2E8F0" }, rowH: 0.38 },
    );

    // --- S5 Alertas
    const s5 = pptx.addSlide();
    s5.background = { color: "F8FAFC" };
    s5.addText(`Alertas para la asamblea (${alerts.length})`, { x: 0.6, y: 0.4, fontSize: 26, bold: true, color: "0F172A" });
    if (alerts.length > 0) {
      s5.addTable(
        [
          ["Nivel", "Alerta", "Evidencia", "Recomendación"].map((t) => ({
            text: t, options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } },
          })),
          ...alerts.slice(0, 8).map((a) => [
            { text: a.level === "critica" ? "CRÍTICA" : "AVISO", options: { bold: true, color: "FFFFFF", fill: { color: a.level === "critica" ? BAD : WARN } } },
            { text: a.title.slice(0, 38) }, { text: a.evidence.slice(0, 90) }, { text: a.recommendation.slice(0, 90) },
          ]),
        ],
        { x: 0.6, y: 1.2, w: 12.1, fontSize: 10.5, color: "0F172A", border: { pt: 1, color: "E2E8F0" }, rowH: 0.55 },
      );
    } else {
      s5.addText("Sin alertas activas — obra dentro de parámetros.", { x: 0.6, y: 3, fontSize: 14, color: GOOD, bold: true });
    }

    // --- S6 Bitácora de la semana
    const s6 = pptx.addSlide();
    s6.background = { color: "F8FAFC" };
    s6.addText(`Bitácora de la semana (${weekEntries.length} día(s))`, { x: 0.6, y: 0.4, fontSize: 26, bold: true, color: "0F172A" });
    if (weekEntries.length > 0) {
      s6.addTable(
        [
          ["Día", "Clima", "Lluvia", "Personal", "Novedades"].map((t) => ({
            text: t, options: { bold: true, color: "FFFFFF", fill: { color: "0F172A" } },
          })),
          ...weekEntries.map((e) => [
            { text: String(e.entry_date).slice(0, 10) }, { text: e.weather ?? "—" },
            { text: `${Number(e.rain_hours ?? 0)} h` }, { text: String(e.workers_total ?? 0) },
            { text: String(e.observations ?? "").slice(0, 80) || "—" },
          ]),
        ],
        { x: 0.6, y: 1.2, w: 12.1, fontSize: 11, color: "0F172A", border: { pt: 1, color: "E2E8F0" }, rowH: 0.45 },
      );
    } else {
      s6.addText("Sin registros de bitácora esta semana.", { x: 0.6, y: 3, fontSize: 14, color: WARN, bold: true });
    }

    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="Informe_Asamblea_${projectSlugName}_${to}.pptx"`,
      },
    });
  } catch (error) {
    console.error("weekly-report error:", error);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
