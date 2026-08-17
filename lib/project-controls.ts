import type { SupabaseClient } from "@supabase/supabase-js";
import type { APUBudget, APUItem } from "@/lib/budget";

/**
 * Data layer for the project-controls spine: persistent APU budgets and the
 * daily site log (bitácora).
 *
 * Budgets were previously ephemeral (generated → shown → exported → gone).
 * Persisting them — with an optional task link per item — is what lets the
 * cost side (5D) join the schedule side (4D) and later feed earned value,
 * alerts and the weekly assembly report.
 */

// --------------------------------------------------------------------------
// Budgets
// --------------------------------------------------------------------------

export type SavedBudgetSummary = {
  id: string;
  title: string;
  source: "ai" | "ifc" | "manual";
  costosDirectos: number;
  total: number;
  itemCount: number;
  createdAt: string;
};

export type SavedBudgetDetail = SavedBudgetSummary & {
  prompt: string | null;
  items: Array<{
    id: string;
    chapter: string;
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: number;
    costoDirecto: number;
    precioUnitarioTotal: number;
    subtotal: number;
    cantidadEjecutada: number;
    taskId: string | null;
    detalle: { materiales: unknown[]; manoObra: unknown[]; equipos: unknown[]; aiu?: { administracion: number; imprevistos: number; utilidad: number }; escenarios?: unknown[] } | null;
  }>;
};

/** Saves a full AI-generated budget (with its items) for a project. */
export async function saveBudget(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    ownerId: string;
    budget: APUBudget;
    prompt?: string;
    source?: "ai" | "ifc" | "manual";
  },
): Promise<string> {
  const { budget, projectId, ownerId } = params;
  const r = budget.resumen;

  const { data: row, error } = await supabase
    .from("budgets")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      title: budget.titulo,
      prompt: params.prompt ?? null,
      source: params.source ?? "ai",
      costos_directos: r.costosDirectos ?? 0,
      aiu_total: r.aiuTotal ?? 0,
      valor_aiu: r.valorAIU ?? 0,
      subtotal_con_aiu: r.subtotalConAIU ?? 0,
      valor_iva: r.valorIVA ?? 0,
      total: r.total ?? 0,
    })
    .select("id")
    .single();
  if (error || !row) throw error ?? new Error("No se pudo guardar el presupuesto");

  // Flatten chapters → items with (chapter, sort) so the budget can be
  // reassembled and each row is independently linkable to a task.
  const items: Array<Record<string, unknown>> = [];
  let sort = 0;
  for (const chapter of budget.capitulos ?? []) {
    for (const item of chapter.items ?? []) {
      items.push(itemToRow(row.id as string, chapter.nombre ?? "", item, sort++));
    }
  }
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("budget_items").insert(items);
    if (itemsError) throw itemsError;
  }
  return row.id as string;
}

function itemToRow(budgetId: string, chapter: string, item: APUItem, sort: number) {
  return {
    // Full line breakdown so a reopened budget is IDENTICAL to the generated one.
    detalle: {
      materiales: Array.isArray(item.materiales) ? item.materiales : [],
      manoObra: Array.isArray(item.manoObra) ? item.manoObra : [],
      equipos: Array.isArray(item.equipos) ? item.equipos : [],
      aiu: item.aiu ?? { administracion: 0, imprevistos: 0, utilidad: 0 },
      escenarios: Array.isArray(item.escenarios) ? item.escenarios : [],
    },
    budget_id: budgetId,
    chapter,
    codigo: item.codigo ?? "",
    descripcion: item.descripcion ?? "",
    unidad: item.unidad ?? "",
    cantidad: Number(item.cantidad ?? 0),
    costo_directo: Number(item.costoDirecto ?? 0),
    precio_unitario_total: Number(item.precioUnitarioTotal ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    sort_order: sort,
  };
}

/** Lists a project's budgets (newest first) with item counts. */
export async function listBudgets(
  supabase: SupabaseClient,
  projectId: string,
): Promise<SavedBudgetSummary[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("id, title, source, costos_directos, total, created_at, budget_items(count)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    title: r.title,
    source: (r.source ?? "ai") as SavedBudgetSummary["source"],
    costosDirectos: Number(r.costos_directos ?? 0),
    total: Number(r.total ?? 0),
    itemCount: Number(r.budget_items?.[0]?.count ?? 0),
    createdAt: r.created_at,
  }));
}

/** Loads one budget with all its items (for task linking / execution). */
export async function getBudgetDetail(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<SavedBudgetDetail | null> {
  const { data: row, error } = await supabase
    .from("budgets")
    .select("id, title, source, costos_directos, total, created_at, prompt")
    .eq("id", budgetId)
    .maybeSingle();
  if (error || !row) return null;

  const { data: items, error: itemsError } = await supabase
    .from("budget_items")
    .select("id, chapter, codigo, descripcion, unidad, cantidad, costo_directo, precio_unitario_total, subtotal, cantidad_ejecutada, task_id")
    .eq("budget_id", budgetId)
    .order("sort_order", { ascending: true });
  if (itemsError) throw itemsError;

  return {
    id: row.id,
    title: row.title,
    source: row.source,
    costosDirectos: Number(row.costos_directos ?? 0),
    total: Number(row.total ?? 0),
    itemCount: (items ?? []).length,
    createdAt: row.created_at,
    prompt: row.prompt ?? null,
    items: (items ?? []).map((i: Record<string, any>) => ({
      id: i.id,
      chapter: i.chapter ?? "",
      codigo: i.codigo ?? "",
      descripcion: i.descripcion ?? "",
      unidad: i.unidad ?? "",
      cantidad: Number(i.cantidad ?? 0),
      costoDirecto: Number(i.costo_directo ?? 0),
      precioUnitarioTotal: Number(i.precio_unitario_total ?? 0),
      subtotal: Number(i.subtotal ?? 0),
      cantidadEjecutada: Number(i.cantidad_ejecutada ?? 0),
      taskId: i.task_id ?? null,
      detalle: (i.detalle ?? null) as SavedBudgetDetail["items"][number]["detalle"],
    })),
  };
}

/** Links/unlinks a budget item to a Gantt task (the 5D↔4D join). */
export async function setBudgetItemTask(
  supabase: SupabaseClient,
  itemId: string,
  taskId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("budget_items")
    .update({ task_id: taskId })
    .eq("id", itemId);
  if (error) throw error;
}

// --------------------------------------------------------------------------
// Bitácora
// --------------------------------------------------------------------------

export type BitacoraWeather = "soleado" | "nublado" | "lluvia" | "lluvia_fuerte" | "otro";

export type BitacoraEntryInput = {
  entryDate: string; // YYYY-MM-DD
  weather: BitacoraWeather;
  rainHours: number;
  workersTotal: number;
  workersDetail: Record<string, number>;
  equipment: Record<string, number>;
  observations: string;
  incidents: string;
  delays: string;
  taskProgress: Array<{ taskId: string; progress: number; note?: string }>;
};

export type BitacoraEntryView = {
  id: string;
  entryDate: string;
  weather: BitacoraWeather;
  rainHours: number;
  workersTotal: number;
  workersDetail: Record<string, number>;
  equipment: Record<string, number>;
  observations: string;
  incidents: string;
  delays: string;
  taskProgress: Array<{ taskId: string; progress: number; note: string }>;
  updatedAt: string;
};

/**
 * Upserts one day of the bitácora (entry + per-task progress snapshot) in a
 * single transaction-like flow: entry first (ON CONFLICT project+date), then
 * replace the day's progress rows.
 */
export async function upsertBitacoraEntry(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    ownerId: string;
    entry: BitacoraEntryInput;
  },
): Promise<void> {
  const { projectId, ownerId, entry } = params;
  const { data: row, error } = await supabase
    .from("bitacora_entries")
    .upsert(
      {
        project_id: projectId,
        owner_id: ownerId,
        entry_date: entry.entryDate,
        weather: entry.weather,
        rain_hours: entry.rainHours,
        workers_total: entry.workersTotal,
        workers_detail: entry.workersDetail ?? {},
        equipment: entry.equipment ?? {},
        observations: entry.observations ?? "",
        incidents: entry.incidents ?? "",
        delays: entry.delays ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,entry_date" },
    )
    .select("id")
    .single();
  if (error || !row) throw error ?? new Error("No se pudo guardar la bitácora");

  const entryId = row.id as string;
  const { error: delError } = await supabase
    .from("bitacora_task_progress")
    .delete()
    .eq("entry_id", entryId);
  if (delError) throw delError;

  const rows = (entry.taskProgress ?? [])
    .filter((p) => p.taskId && Number.isFinite(p.progress))
    .map((p) => ({
      entry_id: entryId,
      project_id: projectId,
      task_id: p.taskId,
      progress: Math.max(0, Math.min(100, Number(p.progress))),
      note: p.note ?? "",
    }));
  if (rows.length > 0) {
    const { error: insError } = await supabase.from("bitacora_task_progress").insert(rows);
    if (insError) throw insError;
  }

  // Mirror the latest progress into the Gantt task (progress field) so the
  // cronograma reflects reality without a second edit.
  for (const p of rows) {
    await supabase
      .from("project_tasks")
      .update({ progress: Number(p.progress), updated_at: new Date().toISOString() })
      .eq("id", p.task_id)
      .eq("project_id", projectId);
  }
}

/** Loads one day (by date) with its task progress snapshot. */
export async function getBitacoraEntry(
  supabase: SupabaseClient,
  projectId: string,
  entryDate: string,
): Promise<BitacoraEntryView | null> {
  const { data: row, error } = await supabase
    .from("bitacora_entries")
    .select("*")
    .eq("project_id", projectId)
    .eq("entry_date", entryDate)
    .maybeSingle();
  if (error || !row) return null;

  const { data: progress, error: pError } = await supabase
    .from("bitacora_task_progress")
    .select("task_id, progress, note")
    .eq("entry_id", row.id);
  if (pError) throw pError;

  return rowToView(row, (progress ?? []) as Array<Record<string, any>>);
}

/** Lists recent entries (for the week strip / weekly report). */
export async function listBitacoraEntries(
  supabase: SupabaseClient,
  projectId: string,
  opts: { from: string; to: string },
): Promise<BitacoraEntryView[]> {
  const { data, error } = await supabase
    .from("bitacora_entries")
    .select("*")
    .eq("project_id", projectId)
    .gte("entry_date", opts.from)
    .lte("entry_date", opts.to)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  // Progress rows are fetched in bulk for all days (one extra query).
  const ids = (data ?? []).map((r: Record<string, any>) => r.id as string);
  const progressByEntry = new Map<string, Array<Record<string, any>>>();
  if (ids.length > 0) {
    const { data: allProgress } = await supabase
      .from("bitacora_task_progress")
      .select("entry_id, task_id, progress, note")
      .in("entry_id", ids);
    for (const p of (allProgress ?? []) as Array<Record<string, any>>) {
      const list = progressByEntry.get(p.entry_id) ?? [];
      list.push(p);
      progressByEntry.set(p.entry_id, list);
    }
  }
  return (data ?? []).map((r: Record<string, any>) =>
    rowToView(r, progressByEntry.get(r.id) ?? []),
  );
}

function rowToView(row: Record<string, any>, progress: Array<Record<string, any>>): BitacoraEntryView {
  return {
    id: row.id,
    entryDate: String(row.entry_date).slice(0, 10),
    weather: (row.weather ?? "soleado") as BitacoraWeather,
    rainHours: Number(row.rain_hours ?? 0),
    workersTotal: Number(row.workers_total ?? 0),
    workersDetail: (row.workers_detail ?? {}) as Record<string, number>,
    equipment: (row.equipment ?? {}) as Record<string, number>,
    observations: row.observations ?? "",
    incidents: row.incidents ?? "",
    delays: row.delays ?? "",
    taskProgress: progress.map((p) => ({
      taskId: p.task_id as string,
      progress: Number(p.progress ?? 0),
      note: p.note ?? "",
    })),
    updatedAt: row.updated_at ?? row.created_at,
  };
}
