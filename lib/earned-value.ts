/**
 * Earned Value engine (Valor Ganado) — pure functions.
 *
 * Joins the three legs of the project-controls spine:
 *   • Schedule  (Gantt tasks)              → what SHOULD be done (PV)
 *   • Site log  (bitácora progress series) → what WAS done (EV)
 *   • Budget    (APU items linked to tasks)→ what it COSTS (BAC/AC)
 *
 * Output: KPIs (SPI/CPI/SV/CV), the S-curve series, per-task semaphore
 * and a projected finish date — the language of weekly assemblies.
 */

export type ControlTask = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  progress: number; // 0-100 (current, mirrored from bitácora or manual)
};

export type ControlItem = {
  id: string;
  chapter: string;
  descripcion: string;
  cantidad: number;
  precioUnitarioTotal: number;
  subtotal: number;
  cantidadEjecutada: number;
  taskId: string | null;
};

export type ProgressPoint = {
  entryDate: string; // YYYY-MM-DD
  taskId: string;
  progress: number;
};

export type ControlDashboard = {
  window: { start: string; end: string };
  bac: number; // budget at completion (linked items)
  linkedItems: number;
  totalItems: number;
  kpis: {
    pv: number; // planned value (COP) to date
    ev: number; // earned value (COP) to date
    ac: number; // actual cost (COP) — from cantidad_ejecutada, 0 if none
    spi: number | null;
    cpi: number | null;
    progressPlanned: number; // % planned weighted by budget
    progressEarned: number; // % real weighted by budget
    projectedEnd: string | null;
  };
  series: Array<{ date: string; planned: number; earned: number | null }>;
  tasks: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    progress: number;
    planned: number; // planned % today
    delta: number; // real - planned
    status: "atrasada" | "en_punto" | "adelantada" | "no_iniciada";
    budget: number; // linked subtotal
  }>;
  rainHoursTotal: number;
  rainDays: number;
  daysWithEntries: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / DAY_MS);
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00`) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Linear planned % of a task at a date (0 before start, 100 after end). */
export function plannedPctAt(task: { startDate: string; endDate: string }, date: string): number {
  if (date < task.startDate) return 0;
  if (date >= task.endDate) return 100;
  const total = dayDiff(task.startDate, task.endDate);
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, (dayDiff(task.startDate, date) / total) * 100));
}

/**
 * Computes the full control dashboard.
 *
 * @param tasks     Gantt tasks
 * @param items     APU budget items (with optional task links)
 * @param progress  bitácora progress points (date, task, cumulative %)
 * @param rain      rain hours per recorded day (for the weather KPI)
 */
export function computeDashboard(
  tasks: ControlTask[],
  items: ControlItem[],
  progress: ProgressPoint[],
  rain: Array<{ entryDate: string; rainHours: number }> = [],
): ControlDashboard {
  const today = todayISO();

  // ---- Budget weights per task -------------------------------------------
  const budgetByTask = new Map<string, number>();
  let bac = 0;
  let linkedItems = 0;
  for (const it of items) {
    if (it.taskId && it.subtotal > 0) {
      budgetByTask.set(it.taskId, (budgetByTask.get(it.taskId) ?? 0) + it.subtotal);
      bac += it.subtotal;
      linkedItems++;
    }
  }
  // Fallback when nothing is linked: equal weights so the S-curve still works.
  const equalWeight = bac === 0 && tasks.length > 0 ? 1 / tasks.length : 0;

  const weightOf = (t: ControlTask) => budgetByTask.get(t.id) ?? equalWeight;

  // ---- Real progress per task: latest bitácora value ≤ today -------------
  // (sorted once, then the latest per task as of a given date is found by
  // folding the series chronologically).
  const sortedPoints = [...progress].sort((a, b) =>
    a.entryDate === b.entryDate ? 0 : a.entryDate < b.entryDate ? -1 : 1,
  );
  const progressNow = new Map<string, number>();
  for (const t of tasks) progressNow.set(t.id, t.progress); // Gantt as baseline
  for (const p of sortedPoints) {
    if (p.entryDate <= today) progressNow.set(p.taskId, p.progress);
  }
  // Full history: date → (taskId → cumulative %) for the earned curve.
  const historyByDate = new Map<string, Map<string, number>>();
  {
    let current = new Map<string, number>();
    for (const t of tasks) current.set(t.id, t.progress && sortedPoints.length === 0 ? t.progress : 0);
    // Start from zero and let the series speak; seed only if no points at all.
    if (sortedPoints.length === 0) {
      for (const t of tasks) current.set(t.id, t.progress);
    }
    for (const p of sortedPoints) {
      current = new Map(current);
      current.set(p.taskId, p.progress);
      historyByDate.set(p.entryDate, current);
    }
  }

  const earnedPctAsOf = (date: string, fallback: Map<string, number>): Map<string, number> => {
    // Latest history snapshot at or before `date`; tasks never seen keep 0.
    let snap: Map<string, number> | null = null;
    for (const [d, m] of historyByDate) {
      if (d <= date) snap = m;
      else break;
    }
    const out = new Map<string, number>();
    for (const t of tasks) {
      out.set(t.id, snap?.get(t.id) ?? (date >= today ? fallback.get(t.id) ?? 0 : 0));
    }
    return out;
  };

  // ---- Time window ---------------------------------------------------------
  let winStart = "";
  let winEnd = "";
  for (const t of tasks) {
    if (!winStart || t.startDate < winStart) winStart = t.startDate;
    if (!winEnd || t.endDate > winEnd) winEnd = t.endDate;
  }
  if (!winStart) {
    winStart = today;
    winEnd = today;
  }
  const totalDays = Math.max(0, dayDiff(winStart, winEnd));
  // Cap the series at ~18 months of points for rendering sanity.
  const stepDays = Math.max(1, Math.ceil(totalDays / 540));

  // ---- KPIs at today -------------------------------------------------------
  let pv = 0;
  let ev = 0;
  for (const t of tasks) {
    const w = weightOf(t);
    pv += w * (plannedPctAt(t, today) / 100);
    ev += w * ((progressNow.get(t.id) ?? 0) / 100);
  }
  let ac = 0;
  for (const it of items) {
    if (it.cantidadEjecutada > 0) ac += it.cantidadEjecutada * it.precioUnitarioTotal;
  }

  const base = bac > 0 ? bac : 1;
  const progressPlanned = bac > 0 || equalWeight > 0 ? (pv / base) * 100 : 0;
  const progressEarned = bac > 0 || equalWeight > 0 ? (ev / base) * 100 : 0;
  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;

  // Projection: elapsed / SPI — a date-only linear extrapolation.
  let projectedEnd: string | null = null;
  if (spi != null && spi > 0.05 && totalDays > 0 && today >= winStart) {
    const elapsed = Math.min(totalDays, dayDiff(winStart, today));
    projectedEnd = addDays(winStart, Math.round(elapsed / spi));
  }

  // ---- S-curve series ------------------------------------------------------
  const series: ControlDashboard["series"] = [];
  const hasBudget = bac > 0 || equalWeight > 0;
  for (let d = winStart; d <= winEnd || series.length === 0; d = addDays(d, stepDays)) {
    let plannedPct = 0;
    let earnedPct = 0;
    for (const t of tasks) {
      const w = weightOf(t);
      plannedPct += w * (plannedPctAt(t, d) / 100);
    }
    if (d <= today) {
      const snap = earnedPctAsOf(d, progressNow);
      for (const t of tasks) earnedPct += weightOf(t) * ((snap.get(t.id) ?? 0) / 100);
    }
    series.push({
      date: d,
      planned: hasBudget ? (plannedPct / base) * 100 : 0,
      earned: d <= today && hasBudget ? (earnedPct / base) * 100 : null,
    });
    if (d >= winEnd) break;
  }

  // ---- Per-task semaphore ---------------------------------------------------
  const taskRows = tasks.map((t) => {
    const planned = plannedPctAt(t, today);
    const real = progressNow.get(t.id) ?? 0;
    const delta = real - planned;
    let status: ControlDashboard["tasks"][number]["status"];
    if (today < t.startDate) status = "no_iniciada";
    else if (delta < -10) status = "atrasada";
    else if (delta > 10) status = "adelantada";
    else status = "en_punto";
    return {
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      progress: real,
      planned,
      delta,
      status,
      budget: budgetByTask.get(t.id) ?? 0,
    };
  });

  const rainHoursTotal = rain.reduce((s, r) => s + r.rainHours, 0);
  const rainDays = rain.filter((r) => r.rainHours > 0).length;

  return {
    window: { start: winStart, end: winEnd },
    bac,
    linkedItems,
    totalItems: items.length,
    kpis: {
      pv,
      ev,
      ac,
      spi,
      cpi,
      progressPlanned,
      progressEarned,
      projectedEnd,
    },
    series,
    tasks: taskRows,
    rainHoursTotal,
    rainDays,
    daysWithEntries: new Set(progress.map((p) => p.entryDate)).size,
  };
}
