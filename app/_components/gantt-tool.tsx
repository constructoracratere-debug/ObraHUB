"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// On mobile the tree panel starts hidden; on desktop it starts visible.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}
import { GanttChart } from "@/app/_components/gantt-chart";
import type { GanttTask } from "@/app/_components/gantt-chart";
import type { ProjectTask } from "@/lib/gantt-tasks";
import type { ImportedBudget } from "@/lib/excel-import";
import type { ScheduleTask } from "@/lib/schedule";
import type { DailyReport } from "@/lib/daily-reports";

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
  const isMobile = useIsMobile();
  const [showTreePanel, setShowTreePanel] = useState(false);
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

  // Bitácora (daily reports) state
  const [showBitacora, setShowBitacora] = useState(false);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [todayReport, setTodayReport] = useState<Partial<DailyReport>>({});
  const reportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Task edit panel state
  const [showEditPanel, setShowEditPanel] = useState(false);

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

  // ---- Bitácora (daily reports) ----
  const loadDailyReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/daily-reports`);
      const data = await res.json();
      if (res.ok) {
        setDailyReports(data.reports ?? []);
        const today = new Date().toISOString().split("T")[0];
        const existing = (data.reports ?? []).find((r: DailyReport) => r.reportDate === today);
        setTodayReport(
          existing
            ? {
                weather: existing.weather ?? "",
                workersCount: existing.workersCount,
                equipment: existing.equipment ?? "",
                notes: existing.notes ?? "",
                activitiesCompleted: existing.activitiesCompleted ?? [],
              }
            : { weather: "", workersCount: null, equipment: "", notes: "", activitiesCompleted: [] },
        );
      }
    } catch {
      // empty state
    }
  }, [projectSlug]);

  // Load existing tasks + reports on mount
  useEffect(() => {
    void loadTasks();
    void loadDailyReports();
  }, [loadTasks, loadDailyReports]);

  // Auto-open edit panel when a task is clicked
  useEffect(() => {
    if (selectedTaskId) setShowEditPanel(true);
  }, [selectedTaskId]);

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

  // ---- Excel import (server-side parse for reliability) ----
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/schedules/parse-excel", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al leer el Excel");
      }

      const budget = data as ImportedBudget;
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
    // Also sync the raw tasks array so derived stats stay correct
    setTasks((prev) =>
      prev.map((t) =>
        t.id === updated.id
          ? {
              ...t,
              startDate: updated.start.toISOString().split("T")[0],
              endDate: updated.end.toISOString().split("T")[0],
              progress: Math.round(updated.progress * 100),
            }
          : t,
      ),
    );
  }

  // Debounced auto-save for the bitácora form
  const debouncedReportSave = useCallback(
    (data: Partial<DailyReport>) => {
      if (reportSaveTimer.current) clearTimeout(reportSaveTimer.current);
      reportSaveTimer.current = setTimeout(async () => {
        const today = new Date().toISOString().split("T")[0];
        await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/daily-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportDate: today, ...data }),
        });
        void loadDailyReports();
      }, 1200);
    },
    [projectSlug, loadDailyReports],
  );

  function updateReportField(field: keyof DailyReport, value: unknown) {
    setTodayReport((prev) => {
      const next = { ...prev, [field]: value };
      void debouncedReportSave(next);
      return next;
    });
  }

  // Toggle activity completion → updates task progress + bitácora
  async function toggleActivityCompleted(taskId: string) {
    const completed = todayReport.activitiesCompleted ?? [];
    const isChecked = completed.includes(taskId);
    const newCompleted = isChecked
      ? completed.filter((id) => id !== taskId)
      : [...completed, taskId];

    updateReportField("activitiesCompleted", newCompleted);

    // Update task progress: mark 100% when checked, leave unchanged when unchecked
    const task = ganttTasks.find((t) => t.id === taskId);
    if (task) {
      const newProgress = isChecked ? task.progress : 1; // don't revert on uncheck, set 100% on check
      if (!isChecked) {
        const updated = { ...task, progress: newProgress };
        handleTaskChange(updated);
      }
    }
  }

  // ---- Task editing ----
  const selectedTask = useMemo(
    () => ganttTasks.find((t) => t.id === selectedTaskId) ?? null,
    [ganttTasks, selectedTaskId],
  );

  async function handleUpdateSelectedTask(updates: Partial<LocalGanttTask>) {
    if (!selectedTask) return;
    handleTaskChange({ ...selectedTask, ...updates });
    // Also update name/description in DB
    if (updates.text !== undefined || updates.details !== undefined) {
      await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTask.id,
          ...(updates.text !== undefined ? { name: updates.text } : {}),
          ...(updates.details !== undefined ? { description: updates.details } : {}),
        }),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? {
                ...t,
                ...(updates.text !== undefined ? { name: updates.text } : {}),
                ...(updates.details !== undefined ? { description: updates.details } : {}),
              }
            : t,
        ),
      );
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) return;
    await fetch(
      `/api/projects/${encodeURIComponent(projectSlug)}/tasks?id=${selectedTask.id}`,
      { method: "DELETE" },
    );
    setGanttTasks((prev) => prev.filter((t) => t.id !== selectedTask.id));
    setTasks((prev) => prev.filter((t) => t.id !== selectedTask.id));
    setSelectedTaskId(null);
    setShowEditPanel(false);
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
              <button
                type="button"
                onClick={() => setShowBitacora((s) => !s)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  showBitacora
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/5"
                }`}
              >
                📓 Bitácora
              </button>
              {selectedTask && (
                <button
                  type="button"
                  onClick={() => setShowEditPanel((s) => !s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    showEditPanel
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/5"
                  }`}
                >
                  ✏️ {selectedTask.type === "milestone" ? "Hito" : "Tarea"}
                </button>
              )}
              <span className="hidden text-xs text-slate-600 sm:inline">
                {totalTasks} tareas · Guardado automático
              </span>
            </div>
          </div>

          {/* Main layout: tree panel + chart */}
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Side panel: Task tree — drawer overlay on mobile, sidebar on desktop */}
            {showTreePanel && (
              <>
                {/* Mobile backdrop */}
                {isMobile && (
                  <div
                    className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                    onClick={() => setShowTreePanel(false)}
                  />
                )}
                <div
                  className={`shrink-0 rounded-2xl border border-white/[0.08] bg-[#0a1120] ${
                    isMobile
                      ? "fixed inset-x-0 bottom-0 top-16 z-50 w-full rounded-b-none"
                      : "lg:sticky lg:top-4 lg:h-[calc(100vh-120px)] lg:w-72"
                  }`}
                >
                {/* Search */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] p-2.5">
                  <input
                    type="text"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="🔍 Buscar tarea…"
                    className="flex-1 rounded-lg border border-white/[0.06] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none"
                  />
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => setShowTreePanel(false)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Tree content — scrollable */}
                <div className={`overflow-y-auto p-1.5 ${isMobile ? "h-full" : "max-h-[400px] lg:max-h-[calc(100vh-180px)]"}`}>
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
                </>
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

          {/* ===== Task Edit Panel ===== */}
          {showEditPanel && selectedTask && (
            <div className="rounded-2xl border border-amber-500/20 bg-[#0a1120] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-amber-300">
                  ✏️ {selectedTask.type === "milestone" ? "Editar Hito" : selectedTask.type === "summary" ? "Editar Capítulo" : "Editar Tarea"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowEditPanel(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={selectedTask.text}
                    onChange={(e) => {
                      const newText = e.target.value;
                      setGanttTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, text: newText } : t)));
                      void handleUpdateSelectedTask({ text: newText });
                    }}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 focus:border-amber-500/40 focus:outline-none"
                  />
                </div>
                {selectedTask.type !== "milestone" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Fecha Inicio
                    </label>
                    <input
                      type="date"
                      value={selectedTask.start.toISOString().split("T")[0]}
                      onChange={(e) => {
                        const newStart = new Date(e.target.value);
                        void handleUpdateSelectedTask({ start: newStart });
                      }}
                      className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 focus:border-amber-500/40 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {selectedTask.type === "milestone" ? "Fecha" : "Fecha Fin"}
                  </label>
                  <input
                    type="date"
                    value={selectedTask.end.toISOString().split("T")[0]}
                    onChange={(e) => {
                      const newEnd = new Date(e.target.value);
                      void handleUpdateSelectedTask({ end: newEnd });
                    }}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 focus:border-amber-500/40 focus:outline-none"
                  />
                </div>
                {selectedTask.type !== "summary" && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Progreso: {Math.round(selectedTask.progress * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(selectedTask.progress * 100)}
                      onChange={(e) => {
                        const newProgress = parseInt(e.target.value, 10) / 100;
                        void handleUpdateSelectedTask({ progress: newProgress });
                      }}
                      className="w-full accent-amber-500"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Descripción / Notas
                  </label>
                  <textarea
                    rows={2}
                    value={selectedTask.details ?? ""}
                    onChange={(e) => {
                      const newDetails = e.target.value;
                      setGanttTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, details: newDetails } : t)));
                      void handleUpdateSelectedTask({ details: newDetails });
                    }}
                    placeholder="Añade notas o detalles de esta tarea…"
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none"
                  />
                </div>
              </div>
              {selectedTask.type !== "summary" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleUpdateSelectedTask({ progress: 1 });
                  }}
                  className="mt-3 w-full rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-600/30"
                >
                  ✓ Marcar como completada (100%)
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDeleteTask()}
                className="mt-2 w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
              >
                🗑 Eliminar {selectedTask.type === "milestone" ? "hito" : "tarea"}
              </button>
            </div>
          )}

          {/* ===== Bitácora de Obra Panel ===== */}
          {showBitacora && (
            <div className="rounded-2xl border border-emerald-500/20 bg-[#0a1120] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-300">
                  📓 Bitácora de Obra — {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <button
                  type="button"
                  onClick={() => setShowBitacora(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Clima
                  </label>
                  <select
                    value={todayReport.weather ?? ""}
                    onChange={(e) => updateReportField("weather", e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/40 focus:outline-none"
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="Soleado">☀️ Soleado</option>
                    <option value="Nublado">☁️ Nublado</option>
                    <option value="Lluvioso">🌧 Lluvioso</option>
                    <option value="Parcialmente nublado">⛅ Parcialmente nublado</option>
                    <option value="Tormenta">⛈ Tormenta</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    N° Obreros
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={todayReport.workersCount ?? ""}
                    onChange={(e) => updateReportField("workersCount", e.target.value ? parseInt(e.target.value, 10) : null)}
                    placeholder="0"
                    className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Equipo / Maquinaria
                  </label>
                  <input
                    type="text"
                    value={todayReport.equipment ?? ""}
                    onChange={(e) => updateReportField("equipment", e.target.value)}
                    placeholder="Ej: Mezcladora, andamio"
                    className="w-full rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>
              </div>

              {/* Activities checklist */}
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Actividades de hoy (marca las completadas)
                </p>
                <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#050b14] p-2">
                  {ganttTasks
                    .filter((t) => t.type === "task")
                    .map((task) => {
                      const isDone = (todayReport.activitiesCompleted ?? []).includes(task.id);
                      return (
                        <label
                          key={task.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.04]"
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => void toggleActivityCompleted(task.id)}
                            className="h-3.5 w-3.5 accent-emerald-500"
                          />
                          <span className={isDone ? "text-emerald-400 line-through" : ""}>
                            {task.text}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Notes / Novedades */}
              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Novedades / Observaciones
                </label>
                <textarea
                  rows={3}
                  value={todayReport.notes ?? ""}
                  onChange={(e) => updateReportField("notes", e.target.value)}
                  placeholder="Reporta retrasos, imprevistos, visitas de interventoría, entregas de material…"
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>

              <p className="mt-2 text-right text-[10px] text-slate-600">
                💾 Guardado automático
              </p>

              {/* Previous days */}
              {dailyReports.length > 0 && (
                <div className="mt-4 border-t border-white/[0.06] pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Días anteriores ({dailyReports.length})
                  </p>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {dailyReports.map((report) => (
                      <BitacoraDay key={report.id} report={report} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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

/** Collapsible summary of a previous day's report. */
function BitacoraDay({ report }: { report: DailyReport }) {
  const [open, setOpen] = useState(false);
  const date = new Date(report.reportDate + "T12:00:00");
  const label = date.toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.01]">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-slate-400 hover:text-slate-200"
      >
        <span className="text-[9px]">{open ? "▾" : "▸"}</span>
        <span className="font-medium capitalize">{label}</span>
        {report.weather && (
          <span className="ml-auto text-[10px] text-slate-500">{report.weather}</span>
        )}
        {report.workersCount != null && report.workersCount > 0 && (
          <span className="text-[10px] text-slate-600">{report.workersCount} obreros</span>
        )}
      </button>
      {open && (
        <div className="space-y-1.5 px-2.5 pb-2.5 pt-0.5 text-xs text-slate-400">
          {report.equipment && (
            <p><span className="text-slate-500">Equipo:</span> {report.equipment}</p>
          )}
          {report.activitiesCompleted.length > 0 && (
            <p>
              <span className="text-slate-500">Completadas:</span>{" "}
              <span className="text-emerald-400">{report.activitiesCompleted.length} actividades</span>
            </p>
          )}
          {report.notes && (
            <p className="whitespace-pre-wrap rounded-md bg-white/[0.02] p-2">{report.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
