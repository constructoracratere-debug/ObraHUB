"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GanttChart } from "@/app/_components/gantt-chart";
import type { GanttTask } from "@/app/_components/gantt-chart";
import type { ProjectTask } from "@/lib/gantt-tasks";
import { parseBudgetExcel } from "@/lib/excel-import";
import type { ImportedBudget } from "@/lib/excel-import";
import type { ScheduleTask } from "@/lib/schedule";

type LocalGanttTask = GanttTask;

/**
 * Seguimiento de Obra — Interactive Gantt chart.
 *
 * Features:
 * - Generate schedule from prompt OR imported Excel budget
 * - Drag/resize bars to adjust dates (auto-saves)
 * - Edit existing schedule via natural language ("mueve acabados 2 semanas")
 * - Side panel with hierarchical task tree + quick milestone list
 * - Click a task in the tree → highlights + scrolls to it in the chart
 */
export function GanttTool({ projectSlug }: { projectSlug: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [ganttTasks, setGanttTasks] = useState<LocalGanttTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTreePanel, setShowTreePanel] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Excel import state
  const [importedBudget, setImportedBudget] = useState<ImportedBudget | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit-via-prompt state
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Tree search state
  const [treeSearch, setTreeSearch] = useState("");
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`);
      const data = await res.json();
      if (res.ok) {
        const loaded: ProjectTask[] = data.tasks ?? [];
        setTasks(loaded);
        setHasSchedule(loaded.length > 0);
        setGanttTasks(convertToGantt(loaded));
      }
    } catch {
      // empty state
    } finally {
      setIsLoading(false);
    }
  }, [projectSlug]);

  // Load existing tasks on mount
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Convert DB tasks → Gantt format with parent-child hierarchy
  function convertToGantt(dbTasks: ProjectTask[]): LocalGanttTask[] {
    const ganttMap = new Map<string, LocalGanttTask>();
    let lastSummaryId: string | null = null;

    dbTasks.forEach((t, i) => {
      const ganttTask: LocalGanttTask = {
        id: t.id,
        text: t.name,
        start: new Date(t.startDate),
        end: new Date(t.endDate),
        progress: t.progress / 100,
        type:
          t.taskType === "milestone"
            ? "milestone"
            : t.taskType === "summary"
            ? "summary"
            : "task",
        details: t.description ?? undefined,
        open: true,
        sortOrder: i,
      };

      if (ganttTask.type === "summary") {
        lastSummaryId = t.id;
        ganttTask.parent = undefined;
      } else {
        ganttTask.parent = lastSummaryId ?? undefined;
      }

      ganttMap.set(t.id, ganttTask);
    });

    return Array.from(ganttMap.values());
  }

  // ---- Excel import ----
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    try {
      const budget = await parseBudgetExcel(file);
      setImportedBudget(budget);
      setPrompt(`Generar cronograma basado en el presupuesto: ${budget.titulo}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error al leer el Excel");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      setImportError("Solo se aceptan archivos Excel (.xlsx, .xls)");
      return;
    }
    // Simulate change event
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      void handleFileUpload({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
    }
  }

  // ---- Generate schedule (from prompt OR Excel budget) ----
  async function handleGenerate() {
    const value = prompt.trim();
    if (!value || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: { prompt: string; budget?: ImportedBudget } = { prompt: value };
      if (importedBudget) {
        body.budget = importedBudget;
      }

      const res = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al generar");
      }

      const schedule = data.schedule;
      const tasksToSave = schedule.tasks.map(
        (t: ScheduleTask, i: number) => ({
          name: t.name,
          description: t.description ?? "",
          startDate: t.startDate,
          endDate: t.endDate,
          progress: t.progress ?? 0,
          dependencies: t.dependencies ?? [],
          taskType: t.type ?? "task",
          sortOrder: i,
        }),
      );

      const saveRes = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: tasksToSave }),
        },
      );

      if (!saveRes.ok) throw new Error("Error al guardar el cronograma");

      await loadTasks();
      setHasSchedule(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el cronograma");
    } finally {
      setIsGenerating(false);
    }
  }

  // ---- Edit schedule via AI ----
  async function handleEditSchedule() {
    const instruction = editPrompt.trim();
    if (!instruction || isEditing) return;

    setIsEditing(true);
    setError(null);

    try {
      // Build ScheduleTask[] from current DB tasks
      const currentScheduleTasks: ScheduleTask[] = tasks.map((t) => ({
        name: t.name,
        description: t.description ?? undefined,
        startDate: t.startDate,
        endDate: t.endDate,
        progress: t.progress,
        dependencies: t.dependencies,
        type: t.taskType,
        duration: Math.round(
          (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) /
            86400000,
        ),
      }));

      const title = tasks[0]?.name
        ? `Cronograma - ${tasks[0].name}`
        : "Cronograma de Obra";
      const startDate = tasks[0]?.startDate ?? new Date().toISOString().split("T")[0];

      const res = await fetch("/api/schedules/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: currentScheduleTasks,
          instruction,
          title,
          startDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al editar");
      }

      const schedule = data.schedule;
      const tasksToSave = schedule.tasks.map(
        (t: ScheduleTask, i: number) => ({
          name: t.name,
          description: t.description ?? "",
          startDate: t.startDate,
          endDate: t.endDate,
          progress: t.progress ?? 0,
          dependencies: t.dependencies ?? [],
          taskType: t.type ?? "task",
          sortOrder: i,
        }),
      );

      const saveRes = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: tasksToSave }),
        },
      );

      if (!saveRes.ok) throw new Error("Error al guardar los cambios");

      await loadTasks();
      setEditPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar el cronograma");
    } finally {
      setIsEditing(false);
    }
  }

  // ---- Debounced auto-save on drag/resize ----
  const debouncedSave = useCallback(
    (updatedTask: LocalGanttTask) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: updatedTask.id,
            startDate: updatedTask.start.toISOString().split("T")[0],
            endDate: updatedTask.end.toISOString().split("T")[0],
            progress: Math.round(updatedTask.progress * 100),
          }),
        });
      }, 800);
    },
    [projectSlug],
  );

  function handleTaskChange(updated: LocalGanttTask) {
    setGanttTasks((prev) => {
      const next = prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      void debouncedSave(updated);
      return next;
    });
  }

  // ---- Derived data for tree panel ----
  const chapters = useMemo(() => {
    return ganttTasks.filter((t) => t.type === "summary");
  }, [ganttTasks]);

  const milestones = useMemo(() => {
    return ganttTasks.filter((t) => t.type === "milestone");
  }, [ganttTasks]);

  // Build chapter → children map
  const chapterChildren = useMemo(() => {
    const map = new Map<string, LocalGanttTask[]>();
    let lastChapterId: string | null = null;

    for (const task of ganttTasks) {
      if (task.type === "summary") {
        lastChapterId = task.id;
        if (!map.has(task.id)) map.set(task.id, []);
      } else if (lastChapterId && task.parent === lastChapterId) {
        const arr = map.get(lastChapterId) ?? [];
        arr.push(task);
        map.set(lastChapterId, arr);
      } else if (!task.parent && task.type === "task") {
        // Task without chapter — skip or could show in "uncategorized"
      }
    }
    return map;
  }, [ganttTasks]);

  const totalTasks = ganttTasks.length;
  const avgProgress =
    totalTasks > 0
      ? Math.round(
          (ganttTasks.reduce((s, t) => s + t.progress, 0) / totalTasks) * 100,
        )
      : 0;

  function toggleChapter(id: string) {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredTasks = useMemo(() => {
    if (!treeSearch.trim()) return null;
    const q = treeSearch.toLowerCase();
    return ganttTasks.filter((t) => t.text.toLowerCase().includes(q));
  }, [treeSearch, ganttTasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-slate-500">Cargando cronograma…</p>
      </div>
    );
  }

  return (
    <div className="w-full py-2">
      {/* ===== Generate screen ===== */}
      {!hasSchedule && (
        <div className="mb-6">
          <label
            htmlFor="gantt-prompt"
            className="mb-1.5 block text-sm font-medium text-slate-300"
          >
            Describe el proyecto para generar el cronograma
          </label>
          <textarea
            id="gantt-prompt"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleGenerate();
              }
            }}
            placeholder="Ej. Construcción de casa de 2 pisos, 180m², en Bogotá, estructura en concreto reforzado, acabados de primera"
            disabled={isGenerating}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
          />

          {/* Excel import zone */}
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void handleFileUpload(e)}
              className="hidden"
            />
            <div
              onDrop={(e) => handleDrop(e)}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.01] px-4 py-4 text-center transition hover:border-blue-500/30 hover:bg-blue-500/[0.02] sm:flex-row sm:gap-3"
            >
              {importedBudget ? (
                <>
                  <span className="flex items-center gap-2 text-sm text-emerald-400">
                    <span className="text-base">📊</span>
                    <span className="font-medium">{importedBudget.titulo}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {importedBudget.capitulos.length} capítulos ·{" "}
                    {importedBudget.capitulos.reduce((s, c) => s + c.items.length, 0)} ítems
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setImportedBudget(null);
                      setPrompt("");
                    }}
                    className="text-xs text-slate-500 underline hover:text-slate-300"
                  >
                    Quitar
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-slate-400">
                    O sube un Excel de Costos para generar el cronograma basado en el presupuesto
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50 sm:mt-0"
                  >
                    {isImporting ? "Leyendo Excel…" : "📊 Subir Excel (.xlsx)"}
                  </button>
                </>
              )}
            </div>
            {importError && (
              <p className="mt-2 text-xs text-red-400">{importError}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!prompt.trim() || isGenerating}
            className="mt-3 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating
              ? "Generando cronograma…"
              : importedBudget
              ? "Generar cronograma desde Excel"
              : "Generar cronograma"}
          </button>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-2xl ring-1 ring-purple-500/20">
              📊
            </div>
            <p className="text-sm font-medium text-white">
              Seguimiento de Obra — Cronograma Gantt
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Genera un cronograma profesional con secuencia constructiva
              colombiana. Importa un Excel de Costos, o describe el proyecto.
              Arrastra las tareas para ajustar fechas — todo se guarda
              automáticamente.
            </p>
          </div>
        </div>
      )}

      {/* ===== Schedule view ===== */}
      {hasSchedule && ganttTasks.length > 0 && (
        <div className="space-y-4">
          {/* Top toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasSchedule(false);
                  setPrompt("");
                  setImportedBudget(null);
                }}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                ← Regenerar
              </button>
              <button
                type="button"
                onClick={() => setShowTreePanel((s) => !s)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  showTreePanel
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                    : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/5"
                }`}
              >
                ☰ Tareas
              </button>
              <span className="hidden text-xs text-slate-600 sm:inline">
                {totalTasks} tareas · Guardado automático
              </span>
            </div>
          </div>

          {/* Main layout: tree panel + chart */}
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Side panel: Task tree */}
            {showTreePanel && (
              <div className="w-full shrink-0 rounded-2xl border border-white/[0.08] bg-[#0a1120] lg:w-72">
                {/* Search */}
                <div className="border-b border-white/[0.06] p-2.5">
                  <input
                    type="text"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="🔍 Buscar tarea…"
                    className="w-full rounded-lg border border-white/[0.06] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none"
                  />
                </div>

                {/* Tree content — scrollable */}
                <div className="max-h-[400px] overflow-y-auto p-1.5 lg:max-h-[550px]">
                  {filteredTasks ? (
                    /* Search results */
                    <div className="space-y-0.5">
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Resultados ({filteredTasks.length})
                      </p>
                      {filteredTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition ${
                            selectedTaskId === task.id
                              ? "bg-amber-500/10 text-amber-300"
                              : "text-slate-300 hover:bg-white/[0.04]"
                          }`}
                        >
                          {task.type === "milestone" && <span className="text-purple-400">◆</span>}
                          {task.type === "summary" && <span className="text-blue-400">▣</span>}
                          {task.type === "task" && <span className="text-emerald-400">●</span>}
                          <span className="truncate">{task.text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      {/* Chapters with children */}
                      {chapters.map((chapter) => {
                        const children = chapterChildren.get(chapter.id) ?? [];
                        const isCollapsed = collapsedChapters.has(chapter.id);
                        return (
                          <div key={chapter.id} className="mb-0.5">
                            <button
                              type="button"
                              onClick={() => toggleChapter(chapter.id)}
                              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition ${
                                selectedTaskId === chapter.id
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "text-blue-300 hover:bg-blue-500/[0.06]"
                              }`}
                            >
                              <span className="text-[10px] text-slate-500">
                                {isCollapsed ? "▸" : "▾"}
                              </span>
                              <span className="text-blue-400">▣</span>
                              <span className="flex-1 truncate">{chapter.text}</span>
                              <span className="text-[9px] text-slate-600">
                                {children.length}
                              </span>
                            </button>
                            {!isCollapsed && (
                              <div className="ml-4 border-l border-white/[0.06] pl-1">
                                {children.map((child) => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={() => setSelectedTaskId(child.id)}
                                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
                                      selectedTaskId === child.id
                                        ? "bg-amber-500/10 text-amber-300"
                                        : child.type === "milestone"
                                        ? "text-purple-300 hover:bg-purple-500/[0.06]"
                                        : "text-slate-400 hover:bg-white/[0.04]"
                                    }`}
                                  >
                                    {child.type === "milestone" ? (
                                      <span className="text-purple-400">◆</span>
                                    ) : (
                                      <span className="text-emerald-400/60">●</span>
                                    )}
                                    <span className="truncate">{child.text}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Milestones quick list */}
                      {milestones.length > 0 && (
                        <div className="mt-3 border-t border-white/[0.06] pt-2">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Hitos ({milestones.length})
                          </p>
                          {milestones.map((ms) => (
                            <button
                              key={ms.id}
                              type="button"
                              onClick={() => setSelectedTaskId(ms.id)}
                              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
                                selectedTaskId === ms.id
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "text-purple-300 hover:bg-purple-500/[0.06]"
                              }`}
                            >
                              <span className="text-purple-400">◆</span>
                              <span className="truncate">{ms.text}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
              <GanttChart
                tasks={ganttTasks}
                onTaskChange={handleTaskChange}
                selectedTaskId={selectedTaskId}
                onTaskSelect={(id) => setSelectedTaskId(id)}
              />
            </div>
          </div>

          {/* Edit via AI */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">
              ✏️ Editar cronograma con IA
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleEditSchedule();
                  }
                }}
                placeholder="Ej. Mover todos los acabados una semana después"
                disabled={isEditing}
                className="flex-1 rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-purple-500/40 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void handleEditSchedule()}
                disabled={!editPrompt.trim() || isEditing}
                className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditing ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
            {/* Quick chips */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                "Añadir 5 días a la estructura",
                "Mover acabados una semana después",
                "Agregar hito de inspección eléctrica",
                "Eliminar el capítulo de exteriores",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setEditPrompt(suggestion)}
                  className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Total Tareas
              </p>
              <p className="mt-1 text-sm font-bold text-slate-200">{totalTasks}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Hitos
              </p>
              <p className="mt-1 text-sm font-bold text-purple-400">
                {milestones.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Capítulos
              </p>
              <p className="mt-1 text-sm font-bold text-blue-400">
                {chapters.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Progreso
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-400">{avgProgress}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
