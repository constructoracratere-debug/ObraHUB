/**
 * 🚀 CADENA DE OBRA — el modelo manda, los números se derivan.
 *
 * Del MISMO FloorPlan que dibuja los planos 2D y escribe el IFC 3D:
 *   takeoff (cantidades) → presupuesto APU (COP + AIU) → cronograma
 *   (fechas, dependencias, rendimientos) → insumos de bitácora.
 * TODO determinístico: misma entrada, mismo presupuesto y mismo
 * cronograma — auditable línea por línea, cero alucinación.
 *
 * Ratios mano de obra/equipo por categoría: APU regionales promedio
 * (cuadrilla 4 oficiales + 4 ayudantes, rendimientos SISDEN/S10 tipo).
 * AIU colombiano estándar: A 10% · I 3% · U 10%.
 */
import type { FloorPlan } from "./design/schema";
import { takeoff, type TakeoffLine } from "./passport/takeoff";
import { PRICES, type PriceLine } from "./passport/prices";
import type { APUBudget, APUItem, APULineItem } from "./budget";

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Precio del KB que matchea la línea de takeoff (por prefijo). */
function priceOf(material: string): PriceLine {
  const key = Object.keys(PRICES).find((k) => material.toLowerCase().includes(k.toLowerCase()));
  return key ? PRICES[key] : { cop: 0, unit: "und", source: "—", updated: "?" };
}

/** % mano de obra y equipo sobre materiales por categoría (APU regional). */
const LABOR: Record<TakeoffLine["category"], { mo: number; eq: number }> = {
  estructura: { mo: 0.55, eq: 0.22 },
  mamposteria: { mo: 0.65, eq: 0.05 },
  carpinteria: { mo: 0.35, eq: 0.02 },
  acabados: { mo: 0.55, eq: 0.03 },
  cubiertas: { mo: 0.45, eq: 0.08 },
};

/** Rendimiento por MATERIAL (unidades homogéneas — jamás sumar und+m³+m²).
 *  Cuadrilla estándar: 1 oficial + 2 ayudantes por frente. */
const ITEM_RATE: Array<[RegExp, number, string]> = [
  [/ladrillo/i, 800, "800 ladrillos/día"],
  [/acero/i, 150, "150 kg/día (armadora)"],
  [/zapata/i, 6, "6 m³/día (fundida zapatas)"],
  [/concreto/i, 4, "4 m³/día (fundida + vaciado)"],
  [/pañete|mortero/i, Infinity, "incluido en muro"],
  [/puerta/i, 3, "3 und/día (carpintero)"],
  [/ventana/i, 4, "4 m²/día"],
  [/cer[áa]mica/i, 30, "30 m²/día"],
  [/acabado piso/i, 30, "30 m²/día"],
];

const AIU = { administracion: 10, imprevistos: 3, utilidad: 10 };
const IVA = 0.19;

/** Un capítulo por categoría de takeoff + preliminares derivados del área. */
const CHAPTER_OF: Record<TakeoffLine["category"], string> = {
  estructura: "3. Estructura",
  mamposteria: "4. Mampostería",
  carpinteria: "7. Carpintería",
  acabados: "8. Acabados",
  cubiertas: "5. Cubiertas",
};

export type ChainBudget = {
  budget: APUBudget;
  lines: Array<{ chapter: string; material: string; unit: string; qty: number; unitPrice: number; source: string }>;
};

/** FloorPlan → presupuesto APU completo (directo + AIU + IVA). */
export function takeoffToBudget(plan: FloorPlan): ChainBudget {
  const lines = takeoff(plan);
  const items: APUItem[] = [];
  const trace: ChainBudget["lines"] = [];

  // Preliminares: cierre de obra + localización ≈ 3.5% del área en m² + saludable.
  const area = plan.outline.width * plan.outline.depth * Math.max(1, plan.levels);
  const items0: Array<[string, string, number, string, number]> = [
    ["Localización y replanteo", "m2", r2(area), "Topografía + jalones", 4200],
    ["Cierre de obra y campamento", "ml", r2(2 * (plan.outline.width + plan.outline.depth)), "Cinta polywoven H=2.4m", 18500],
  ];
  let code = 1;
  const cod = () => String(code++).padStart(3, "0");
  for (const [desc, unit, qty, det, pu] of items0) {
    // Desglose 50% material / 42% MO / 8% equipo — directo = pu.
    const mat = r2(pu * 0.5), mo = r2(pu * 0.42), eq = r2(pu * 0.08);
    items.push(apuItem(`P-${cod()}`, desc, unit, qty, [
      { name: det, unit, qty: r2(qty), unitPrice: mat, subtotal: r2(qty * mat), source: "APU regional 2026" },
    ], [
      { name: "Cuadrilla topografía/replanteo", unit, qty: r2(qty), unitPrice: mo, subtotal: r2(qty * mo) },
    ], [
      { name: "Herramienta menor", unit: "gl", qty: 1, unitPrice: eq, subtotal: eq },
    ], pu));
  }

  for (const l of lines) {
    const p = priceOf(l.material);
    if (p.cop <= 0 || l.qty <= 0) continue;
    const chapter = CHAPTER_OF[l.category];
    const moRatio = LABOR[l.category].mo, eqRatio = LABOR[l.category].eq;
    const mo = r2(p.cop * moRatio), eq = r2(p.cop * eqRatio);
    const directo = p.cop + mo + eq;
    items.push(apuItem(
      chapter.startsWith("3") ? `E-${cod()}` : chapter.startsWith("4") ? `M-${cod()}` : chapter.startsWith("5") ? `C-${cod()}` : chapter.startsWith("6") ? `K-${cod()}` : `A-${cod()}`,
      l.material.replace(" 3000 PSI — ", " — "), l.unit, l.qty,
      [{ name: l.material, unit: l.unit, qty: l.qty, unitPrice: p.cop, subtotal: r2(l.qty * p.cop), source: p.source }],
      [
        { name: `Mano de obra (${Math.round(moRatio * 100)}% mat.)`, unit: l.unit, qty: l.qty, unitPrice: mo, subtotal: r2(l.qty * mo), source: "Cuadrilla regional" },
      ],
      [
        { name: `Equipo (${Math.round(eqRatio * 100)}% mat.)`, unit: l.unit, qty: l.qty, unitPrice: eq, subtotal: r2(l.qty * eq), source: "Alquiler/dep." },
      ],
      directo,
    ));
    trace.push({ chapter, material: l.material, unit: l.unit, qty: l.qty, unitPrice: p.cop, source: p.source });
  }

  // ── Instalaciones + acabados de muro + aseo (APU por m² construido) ─────
  // RETIE/RAS por puntos y m²: ~48k/m² eléctrica, ~56k/m² hidrosanitaria
  // (APU regional 2026). Pintura: factor 2.8× área (muros 2 caras + cielos).
  const areaConstruida = r2(plan.outline.width * plan.outline.depth * Math.max(1, plan.levels));
  const areaLines: Array<[string, string, number, number, string, string]> = [
    ["Instalación eléctrica (puntos, redes, acometida)", "m2", areaConstruida, 48000, "RETIE — puntos y canalización", "I"],
    ["Instalación hidrosanitaria (redes, acometidas)", "m2", areaConstruida, 56000, "RAS 2017 — baterías sanitarias", "I"],
    ["Pintura vinilo interior y exterior", "m2", r2(areaConstruida * 2.8), 12500, "Imprimación + 2 manos (muros y cielos)", "A"],
    ["Aseo final, ajustes y entregas", "m2", areaConstruida, 3500, "Limpieza entregable + desmonte andamios", "Z"],
  ];
  for (const [desc, unit, qty, pu, det, ch] of areaLines) {
    const mat = r2(pu * 0.45), mo = r2(pu * 0.5), eq = r2(pu * 0.05);
    items.push(apuItem(`${ch}-${cod()}`, desc, unit, qty,
      [{ name: det, unit, qty, unitPrice: mat, subtotal: r2(qty * mat), source: "APU regional 2026" }],
      [{ name: "Cuadrilla especializada", unit, qty, unitPrice: mo, subtotal: r2(qty * mo) }],
      [{ name: "Herramienta menor", unit: "gl", qty: 1, unitPrice: eq, subtotal: eq }],
      pu));
  }

  const capitulos = orderChapters(items);
  // Costo directo = Σ(costoDirecto unitario × cantidad) — SIN AIU.
  const costosDirectos = r0(capitulos.reduce((s, c) => s + c.items.reduce((x, i) => x + i.costoDirecto * i.cantidad, 0), 0));
  const aiuPct = AIU.administracion + AIU.imprevistos + AIU.utilidad;
  const valorAIU = r0(costosDirectos * (aiuPct / 100));
  const subtotal = costosDirectos + valorAIU;
  const valorIVA = r0(subtotal * IVA);
  const budget: APUBudget = {
    titulo: `Presupuesto — ${plan.name}`,
    capitulos,
    resumen: {
      costosDirectos: costosDirectos,
      aiuTotal: aiuPct,
      valorAIU,
      subtotalConAIU: subtotal,
      iva: 19,
      valorIVA,
      total: subtotal + valorIVA,
    },
  };
  return { budget, lines: trace };
}

function apuItem(
  codigo: string, descripcion: string, unidad: string, cantidad: number,
  materiales: APULineItem[], manoObra: APULineItem[], equipos: APULineItem[],
  costoDirecto: number,
): APUItem {
  const precioUnitarioTotal = r0(costoDirecto * (1 + (AIU.administracion + AIU.imprevistos + AIU.utilidad) / 100));
  return {
    codigo, descripcion, unidad, cantidad: r2(cantidad), materiales, manoObra, equipos,
    costoDirecto: r0(costoDirecto), aiu: { ...AIU }, precioUnitarioTotal,
    subtotal: r0(precioUnitarioTotal * cantidad),
  };
}

function orderChapters(items: APUItem[]): APUBudget["capitulos"] {
  const order = ["1. Preliminares", "2. Cimentación", "3. Estructura", "4. Mampostería", "5. Cubiertas", "6. Instalaciones", "7. Carpintería", "8. Acabados", "9. Aseo y entregas"];
  // Zapatas → Cimentación; el resto de estructura → Estructura.
  for (const it of items) {
    if (/zapata/i.test(it.descripcion) && it.codigo.startsWith("E-")) {
      it.codigo = it.codigo.replace("E-", "F-");
    }
  }
  const CH_OF_CODE: Record<string, string> = {
    "P-": "1. Preliminares", "F-": "2. Cimentación", "E-": "3. Estructura",
    "M-": "4. Mampostería", "C-": "5. Cubiertas", "I-": "6. Instalaciones",
    "K-": "7. Carpintería", "A-": "8. Acabados", "Z-": "9. Aseo y entregas",
  };
  const byChapter = new Map<string, APUItem[]>();
  for (const it of items) {
    const ch = CH_OF_CODE[it.codigo.slice(0, 2)] ?? "8. Acabados";
    (byChapter.get(ch) ?? byChapter.set(ch, []).get(ch)!).push(it);
  }
  return order.filter((o) => byChapter.has(o)).map((nombre) => ({ nombre, items: byChapter.get(nombre)! }));
}

// ── CRONOGRAMA ─────────────────────────────────────────────────────────────

export type ScheduleTask = {
  name: string;
  startDate: string;
  endDate: string;
  progress?: number;
  dependencies?: string[];
  taskType?: "task" | "milestone" | "summary";
  description?: string;
  sortOrder?: number;
};

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Presupuesto → cronograma con dependencias reales (ruta crítica constructiva). */
export function budgetToSchedule(budget: APUBudget, startFrom?: Date): ScheduleTask[] {
  // Lunes siguiente al lunes de la próxima semana — arranque limpio.
  const start = startFrom ?? (() => {
    const d = new Date();
    const monday = addDays(d, ((8 - d.getDay()) % 7 || 7));
    return monday;
  })();

  const tasks: ScheduleTask[] = [];
  const phases: Array<{ name: string; chapter: string; deps: string[]; multiplier: number }> = [
    { name: "Preliminares y localización", chapter: "1. Preliminares", deps: [], multiplier: 1 },
    { name: "Cimentación (zapatas y vigas)", chapter: "2. Cimentación", deps: [], multiplier: 1.4 },
    { name: "Estructura (columnas, vigas, losas)", chapter: "3. Estructura", deps: [], multiplier: 1.6 },
    { name: "Mampostería", chapter: "4. Mampostería", deps: [], multiplier: 1.2 },
    { name: "Cubiertas", chapter: "5. Cubiertas", deps: [], multiplier: 1 },
    { name: "Instalaciones eléctricas e hidrosanitarias", chapter: "6. Instalaciones", deps: [], multiplier: 1.1 },
    { name: "Carpintería (puertas y ventanas)", chapter: "7. Carpintería", deps: [], multiplier: 1 },
    { name: "Acabados", chapter: "8. Acabados", deps: [], multiplier: 1.3 },
    { name: "Aseo final y entregas", chapter: "9. Aseo y entregas", deps: [], multiplier: 1 },
  ];

  let cursor = new Date(start);
  let order = 0;
  for (const [i, ph] of phases.entries()) {
    const ch = budget.capitulos.find((c) => c.nombre === ph.chapter);
    if (!ch || ch.items.length === 0) continue; // capítulo sin ítems → sin actividad
    // Duración por ÍTEM (unidades homogéneas) y frentes paralelos:
    // el capítulo dura lo que dura su ítem crítico × factor logístico.
    let days = 2;
    let qtyNote = "";
    {
      let crit = { d: 0, label: "" };
      for (const it of ch.items) {
        const rate = ITEM_RATE.find(([re]) => re.test(it.descripcion))?.[1] ?? 10;
        if (!Number.isFinite(rate)) continue; // incluido en otra actividad
        const d = it.cantidad / rate;
        if (d > crit.d) crit = { d, label: `${r0(it.cantidad)} ${it.unidad} de ${it.descripcion} ÷ ${ITEM_RATE.find(([re]) => re.test(it.descripcion))?.[2] ?? "10/día"}` };
      }
      days = Math.max(2, Math.ceil(crit.d * ph.multiplier));
      qtyNote = crit.label ? ` · Crítico: ${crit.label}` : "";
    }
    const name = `${ph.name}`;
    const end = addDays(cursor, days - 1);
    tasks.push({
      name,
      startDate: iso(cursor),
      endDate: iso(end),
      dependencies: i === 0 ? [] : [tasks[tasks.length - 1]?.name ?? ""].filter(Boolean),
      taskType: "task",
      description: `${ph.chapter}${qtyNote} · Presupuesto: ${fmtCOP(ch ? ch.items.reduce((s, it) => s + it.subtotal, 0) : 0)}`,
      sortOrder: order++,
    });
    cursor = addDays(end, 1);
  }

  // Hitos: entrega de estructura y entrega final (estética de curaduría).
  if (tasks.length > 0) {
    const last = tasks[tasks.length - 1];
    tasks.push({
      name: "🏁 Entrega y aseo general",
      startDate: last.endDate,
      endDate: last.endDate,
      dependencies: [last.name],
      taskType: "milestone",
      sortOrder: order++,
    });
  }
  return tasks;
}

const fmtCOP = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });

/** Resumen de la cadena para el reporte en línea del Kit. */
export function chainSummary(plan: FloorPlan, chain: ChainBudget, tasks: ScheduleTask[]) {
  const lines = takeoff(plan);
  return {
    planName: plan.name,
    levels: plan.levels,
    area: r2(plan.outline.width * plan.outline.depth * Math.max(1, plan.levels)),
    rooms: plan.rooms.length,
    qtyLines: lines.length,
    budgetTotal: chain.budget.resumen.total,
    budgetDirecto: chain.budget.resumen.costosDirectos,
    chapters: chain.budget.capitulos.map((c) => ({
      nombre: c.nombre,
      items: c.items.length,
      subtotal: c.items.reduce((s, i) => s + i.subtotal, 0),
    })),
    scheduleStart: tasks[0]?.startDate ?? null,
    scheduleEnd: tasks[tasks.length - 1]?.endDate ?? null,
    scheduleDays: tasks.length
      ? Math.round((new Date(tasks[tasks.length - 1].endDate).getTime() - new Date(tasks[0].startDate).getTime()) / DAY) + 1
      : 0,
    tasks: tasks.map((t) => t.name),
  };
}
