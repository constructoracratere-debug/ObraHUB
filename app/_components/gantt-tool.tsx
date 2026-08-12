"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GanttChart } from "@/app/_components/gantt-chart";
import type { GanttTask } from "@/app/_components/gantt-chart";
import type { ProjectTask } from "@/lib/gantt-tasks";

/**
 * Seguimiento de Obra — Interactive Gantt chart.
 * AI generates a Colombian-standard construction schedule;
 * users drag/resize tasks; changes auto-save to Supabase.
 */

type LocalGanttTask = GanttTask;

export function GanttTool({ projectSlug }: { projectSlug: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [ganttTasks, setGanttTasks] = useState<LocalGanttTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSchedule, setHasSchedule] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadTasks();
  }, [projectSlug]);

  async function loadTasks() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`);
      const data = await res.json();
      if (res.ok) {
        const loaded = data.tasks ?? [];
        setTasks(loaded);
        setHasSchedule(loaded.length > 0);
        setGanttTasks(convertToGantt(loaded));
      }
    } catch {
      // empty state
    } finally {
      setIsLoading(false);
    }
  }

  // Convert DB tasks → Gantt format with parent-child hierarchy
  function convertToGantt(dbTasks: ProjectTask[]): LocalGanttTask[] {
    const ganttMap = new Map<string, LocalGanttTask>();
    const summaryByOrder: string[] = [];
    let lastSummaryId: string | null = null;

    // First pass: create all tasks, track last summary as implicit parent
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
        summaryByOrder.push(t.id);
        lastSummaryId = t.id;
        ganttTask.parent = undefined;
      } else {
        // Non-summary tasks belong to the most recent summary (if any)
        ganttTask.parent = lastSummaryId ?? undefined;
      }

      ganttMap.set(t.id, ganttTask);
    });

    return Array.from(ganttMap.values());
  }

  async function handleGenerate() {
    const value = prompt.trim();
    if (!value || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al generar");
      }

      const schedule = data.schedule;
      const tasksToSave = schedule.tasks.map(
        (t: Record<string, unknown>, i: number) => ({
          name: t.name as string,
          description: (t.description as string) ?? "",
          startDate: t.startDate as string,
          endDate: t.endDate as string,
          progress: (t.progress as number) ?? 0,
          dependencies: (t.dependencies as string[]) ?? [],
          taskType: (t.type as string) ?? "task",
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

  // Debounced auto-save when a task is dragged/resized
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

  // Handle drag/resize from the Gantt chart
  function handleTaskChange(updated: LocalGanttTask) {
    setGanttTasks((prev) => {
      const next = prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      void debouncedSave(updated);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-slate-500">Cargando cronograma…</p>
      </div>
    );
  }

  const totalTasks = ganttTasks.length;
  const milestones = ganttTasks.filter((t) => t.type === "milestone").length;
  const chapters = ganttTasks.filter((t) => t.type === "summary").length;
  const avgProgress =
    totalTasks > 0
      ? Math.round(
          (ganttTasks.reduce((s, t) => s + t.progress, 0) / totalTasks) * 100,
        )
      : 0;

  return (
    <div className="w-full py-2">
      {/* Generate schedule bar */}
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
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!prompt.trim() || isGenerating}
            className="mt-3 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? "Generando cronograma…" : "Generar cronograma"}
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
              Genera un cronograma de obra detallado con secuencia constructiva
              colombiana, hitos (acta de inicio, recepciones), dependencias y
              duraciones realistas. Arrastra las tareas para ajustar fechas — todo
              se guarda automáticamente.
            </p>
          </div>
        </div>
      )}

      {/* Gantt chart */}
      {hasSchedule && ganttTasks.length > 0 && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasSchedule(false);
                  setPrompt("");
                }}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                ← Regenerar
              </button>
              <span className="text-xs text-slate-600">
                {totalTasks} tareas · Guardado automático activo
              </span>
            </div>
          </div>

          {/* The Gantt chart */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
            <GanttChart tasks={ganttTasks} onTaskChange={handleTaskChange} />
          </div>

          {/* Task summary */}
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
              <p className="mt-1 text-sm font-bold text-purple-400">{milestones}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Capítulos
              </p>
              <p className="mt-1 text-sm font-bold text-blue-400">{chapters}</p>
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
