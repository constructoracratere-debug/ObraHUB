"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type GanttTaskType = "task" | "milestone" | "summary";

export interface GanttTask {
  id: string;
  text: string;
  start: Date;
  end: Date;
  progress: number; // 0..1
  type: GanttTaskType;
  details?: string;
  open?: boolean;
  parent?: string;
  dependencies?: string[];
  sortOrder?: number;
}

interface GanttChartProps {
  tasks: GanttTask[];
  onTaskChange?: (task: GanttTask) => void;
  selectedTaskId?: string | null;
  onTaskSelect?: (taskId: string) => void;
}

type ViewMode = "day" | "week" | "month";

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
function fmtDateFull(d: Date) {
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const TYPE_STYLES: Record<GanttTaskType, { bg: string; bar: string; label: string; icon: string }> = {
  summary: {
    bg: "bg-blue-500/5",
    bar: "bg-gradient-to-r from-blue-500 to-blue-400",
    label: "text-blue-300",
    icon: "▣",
  },
  task: {
    bg: "",
    bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    label: "text-slate-300",
    icon: "",
  },
  milestone: {
    bg: "bg-purple-500/5",
    bar: "bg-purple-500",
    label: "text-purple-300",
    icon: "◆",
  },
};

/**
 * Professional Gantt chart — pure React, no third-party deps.
 * - Hierarchical task tree with collapsible summary rows
 * - Horizontal timeline with day/week/month zoom
 * - Draggable task bars (move start date)
 * - Resizable right edge (change duration)
 * - Progress overlay
 * - Dependency arrows
 * - Colombian-standard layout
 */
export function GanttChart({ tasks, onTaskChange, selectedTaskId, onTaskSelect }: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Responsive task column width — narrower on phones, wider on tablets/desktops
  const [labelColWidth, setLabelColWidth] = useState(280);
  useEffect(() => {
    const update = () => setLabelColWidth(window.innerWidth < 640 ? 140 : window.innerWidth < 1024 ? 200 : 280);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const dragRef = useRef<{
    taskId: string;
    mode: "move" | "resize";
    startX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);

  // ---- Calculate timeline range ----
  const { timelineStart, totalDays } = useMemo(() => {
    if (tasks.length === 0) return { timelineStart: startOfDay(new Date()), totalDays: 30 };
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const t of tasks) {
      const s = t.start.getTime();
      const e = t.end.getTime();
      if (s < minTime) minTime = s;
      if (e > maxTime) maxTime = e;
    }
    const s = startOfDay(new Date(minTime));
    // Start 2 days before earliest, end 5 days after latest for padding
    const start = addDays(s, -2);
    const end = addDays(startOfDay(new Date(maxTime)), 5);
    return { timelineStart: start, totalDays: Math.max(diffDays(start, end) + 1, 14) };
  }, [tasks]);

  // ---- Column widths based on view mode + zoom ----
  const dayWidth = useMemo(() => {
    const base = viewMode === "day" ? 38 : viewMode === "week" ? 22 : 8;
    return Math.round(base * zoom);
  }, [viewMode, zoom]);

  const timelineWidth = totalDays * dayWidth;

  // ---- Build visible task list (respecting collapsed summaries) ----
  const visibleTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const sa = a.sortOrder ?? 0;
      const sb = b.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      return a.start.getTime() - b.start.getTime();
    });
    const result: GanttTask[] = [];
    const skipChildrenOf = new Set<string>();

    for (const t of sorted) {
      if (t.parent && skipChildrenOf.has(t.parent)) continue;
      result.push(t);
      if (t.type === "summary" && collapsed.has(t.id)) {
        // Mark children for skipping
        for (const child of sorted) {
          if (child.parent === t.id) {
            skipChildrenOf.add(t.id);
          }
        }
      }
    }
    return result;
  }, [tasks, collapsed]);

  // ---- Generate timeline markers ----
  const timelineMarkers = useMemo(() => {
    const markers: { index: number; label: string; sublabel?: string; isMonthBoundary: boolean; isWeekStart: boolean; isToday: boolean }[] = [];
    const today = startOfDay(new Date());
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(timelineStart, i);
      const isMonthBoundary = d.getDate() === 1 || i === 0;
      const isWeekStart = d.getDay() === 1; // Monday
      const isToday = d.getTime() === today.getTime();
      const label = String(d.getDate());
      const sublabel = isMonthBoundary ? MONTHS_SHORT_ES[d.getMonth()] : undefined;
      markers.push({ index: i, label, sublabel, isMonthBoundary, isWeekStart, isToday });
    }
    return markers;
  }, [timelineStart, totalDays]);

  // ---- Month headers for week/month view ----
  const monthHeaders = useMemo(() => {
    if (viewMode === "day") return [];
    const months: { label: string; startIndex: number; width: number }[] = [];
    let currentMonth = -1;
    let monthStart = 0;
    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(timelineStart, i);
      if (d.getMonth() !== currentMonth) {
        if (currentMonth !== -1) {
          months.push({
            label: `${MONTHS_SHORT_ES[currentMonth]} ${d.getFullYear()}`,
            startIndex: monthStart,
            width: i - monthStart,
          });
        }
        currentMonth = d.getMonth();
        monthStart = i;
      }
    }
    // Close last month
    if (currentMonth !== -1) {
      months.push({
        label: `${MONTHS_SHORT_ES[currentMonth]} ${addDays(timelineStart, totalDays - 1).getFullYear()}`,
        startIndex: monthStart,
        width: totalDays - monthStart,
      });
    }
    return months;
  }, [timelineStart, totalDays, viewMode]);

  // ---- Dependency lines ----
  const depLines = useMemo(() => {
    const lines: { from: GanttTask; to: GanttTask }[] = [];
    for (const t of visibleTasks) {
      if (t.dependencies) {
        for (const depId of t.dependencies) {
          const from = visibleTasks.find((x) => x.id === depId);
          if (from) lines.push({ from, to: t });
        }
      }
    }
    return lines;
  }, [visibleTasks]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- Drag handling ----
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, task: GanttTask, mode: "move" | "resize") => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        taskId: task.id,
        mode,
        startX: e.clientX,
        origStart: new Date(task.start),
        origEnd: new Date(task.end),
      };

      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const deltaPx = ev.clientX - drag.startX;
        const deltaDays = Math.round(deltaPx / dayWidth);
        if (drag.mode === "move") {
          const newStart = addDays(drag.origStart, deltaDays);
          const dur = diffDays(drag.origStart, drag.origEnd);
          const newEnd = addDays(newStart, dur);
          onTaskChange?.({ ...task, start: newStart, end: newEnd });
        } else {
          const newEnd = addDays(drag.origEnd, deltaDays);
          if (newEnd >= task.start) {
            onTaskChange?.({ ...task, end: newEnd });
          }
        }
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [dayWidth, onTaskChange],
  );

  // ---- Touch handling for mobile ----
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, task: GanttTask, mode: "move" | "resize") => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      dragRef.current = {
        taskId: task.id,
        mode,
        startX: touch.clientX,
        origStart: new Date(task.start),
        origEnd: new Date(task.end),
      };

      const onMove = (ev: TouchEvent) => {
        const drag = dragRef.current;
        if (!drag || ev.touches.length !== 1) return;
        const t = ev.touches[0];
        const deltaPx = t.clientX - drag.startX;
        const deltaDays = Math.round(deltaPx / dayWidth);
        if (drag.mode === "move") {
          const newStart = addDays(drag.origStart, deltaDays);
          const dur = diffDays(drag.origStart, drag.origEnd);
          const newEnd = addDays(newStart, dur);
          onTaskChange?.({ ...task, start: newStart, end: newEnd });
        } else {
          const newEnd = addDays(drag.origEnd, deltaDays);
          if (newEnd >= task.start) {
            onTaskChange?.({ ...task, end: newEnd });
          }
        }
      };

      const onEnd = () => {
        dragRef.current = null;
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
      };

      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
    },
    [dayWidth, onTaskChange],
  );

  // Auto-scroll to first task on mount
  useEffect(() => {
    if (scrollRef.current && tasks.length > 0) {
      const earliest = tasks.reduce((min, t) => (t.start < min ? t.start : min), tasks[0].start);
      const offset = diffDays(timelineStart, earliest) * dayWidth - 100;
      scrollRef.current.scrollLeft = Math.max(0, offset);
    }
  }, [tasks, timelineStart, dayWidth]);

  // Scroll to selected task when it changes
  useEffect(() => {
    if (!scrollRef.current || !selectedTaskId) return;
    const task = visibleTasks.find((t) => t.id === selectedTaskId);
    if (!task) return;
    const offset = diffDays(timelineStart, task.start) * dayWidth - 120;
    scrollRef.current.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
  }, [selectedTaskId, visibleTasks, timelineStart, dayWidth]);

  // Slightly smaller rows on mobile to show more tasks
  const rowHeight = labelColWidth < 200 ? 34 : 40;
  const headerHeight = viewMode === "day" ? 36 : 56;

  return (
    <div className="flex flex-col" style={{ minHeight: "50vh" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0a1120] px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-0.5">
          {(["day", "week", "month"] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === m
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {m === "day" ? "Día" : m === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.03] text-sm text-slate-400 hover:bg-white/[0.08] hover:text-white"
            title="Alejar"
          >
            −
          </button>
          <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.03] text-sm text-slate-400 hover:bg-white/[0.08] hover:text-white"
            title="Acercar"
          >
            +
          </button>
        </div>
      </div>

      {/* Chart container — fills available viewport height */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
        style={{ height: "calc(100vh - 220px)", minHeight: "300px" }}
      >
        <div style={{ width: `calc(${labelColWidth}px + ${timelineWidth}px)`, minWidth: "100%" }}>
          {/* Header row */}
          <div className="sticky top-0 z-30 flex" style={{ height: headerHeight }}>
            {/* Task columns header */}
            <div className="sticky left-0 z-40 flex shrink-0 border-b border-r border-white/[0.08] bg-[#0a1120]" style={{ width: `${labelColWidth}px` }}>
              <div className="flex w-full items-center px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Tarea
              </div>
            </div>
            {/* Timeline header */}
            <div className="relative border-b border-white/[0.08] bg-[#0a1120]" style={{ width: `${timelineWidth}px` }}>
              {/* Month row (week/month view) */}
              {viewMode !== "day" && (
                <div className="flex h-7 border-b border-white/[0.04]">
                  {monthHeaders.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center border-r border-white/[0.06] px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                      style={{ width: `${m.width * dayWidth}px`, minWidth: `${m.width * dayWidth}px` }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              )}
              {/* Day markers */}
              <div className="flex h-7" style={{ height: viewMode === "day" ? "36px" : "28px" }}>
                {timelineMarkers.map((m) => (
                  <div
                    key={m.index}
                    className={`flex shrink-0 flex-col items-center justify-center border-r ${
                      m.isToday
                        ? "border-orange-500/40 bg-orange-500/10"
                        : m.isMonthBoundary
                        ? "border-white/[0.12]"
                        : "border-white/[0.04]"
                    }`}
                    style={{ width: `${dayWidth}px` }}
                  >
                    {m.sublabel && viewMode !== "day" && (
                      <span className="text-[8px] font-bold uppercase text-blue-400">{m.sublabel}</span>
                    )}
                    <span
                      className={`text-[10px] ${
                        m.isToday ? "font-bold text-orange-400" : viewMode === "month" ? "text-slate-600" : "text-slate-500"
                      }`}
                    >
                      {viewMode === "month" && !m.isMonthBoundary && !m.isToday ? "" : m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task rows */}
          {visibleTasks.map((task) => {
            const style = TYPE_STYLES[task.type];
            const startOffset = diffDays(timelineStart, task.start);
            const duration = Math.max(1, diffDays(task.start, task.end));
            const leftPx = startOffset * dayWidth;
            const widthPx = Math.max(dayWidth * 0.8, duration * dayWidth);
            const hasChildren = tasks.some((t) => t.parent === task.id);
            const isCollapsed = collapsed.has(task.id);
            const indent = task.parent ? 1 : 0;

            return (
              <div
                key={task.id}
                className={`flex border-b border-white/[0.03] hover:bg-white/[0.015] ${style.bg} ${selectedTaskId === task.id ? "!bg-amber-500/[0.06]" : ""}`}
                style={{ height: `${rowHeight}px` }}
                onClick={() => onTaskSelect?.(task.id)}
              >
                {/* Task label */}
                <div className={`sticky left-0 z-20 flex shrink-0 items-center border-r bg-[#0a1120]/95 backdrop-blur ${selectedTaskId === task.id ? "border-amber-500/30" : "border-white/[0.06]"}`} style={{ width: `${labelColWidth}px` }}>
                  <div
                    className="flex w-full items-center gap-1.5 px-2"
                    style={{ paddingLeft: `${12 + indent * 20}px` }}
                  >
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(task.id)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-500 hover:text-white"
                      >
                        {isCollapsed ? "▸" : "▾"}
                      </button>
                    )}
                    {!hasChildren && task.parent && <span className="w-4 shrink-0" />}
                    {task.type === "milestone" && <span className="shrink-0 text-xs text-purple-400">◆</span>}
                    {task.type === "summary" && <span className="shrink-0 text-xs text-blue-400">▣</span>}
                    <span
                      className={`truncate text-xs ${task.type === "summary" ? "font-semibold text-white" : task.type === "milestone" ? "font-medium text-purple-300" : "text-slate-300"}`}
                      title={task.details || task.text}
                    >
                      {task.text}
                    </span>
                    <span className="ml-auto shrink-0 pl-1 text-[9px] text-slate-600">
                      {task.type === "milestone" ? fmtDate(task.start) : `${duration}d`}
                    </span>
                  </div>
                </div>

                {/* Timeline area */}
                <div className="relative" style={{ width: `${timelineWidth}px` }}>
                  {/* Grid lines */}
                  {timelineMarkers.map((m) => (
                    <div
                      key={m.index}
                      className={`absolute top-0 h-full border-r ${
                        m.isToday
                          ? "border-orange-500/20 bg-orange-500/[0.03]"
                          : m.isWeekStart && viewMode !== "month"
                          ? "border-white/[0.06]"
                          : m.isMonthBoundary
                          ? "border-white/[0.08]"
                          : "border-white/[0.02]"
                      }`}
                      style={{ left: `${m.index * dayWidth}px`, width: `${dayWidth}px` }}
                    />
                  ))}

                  {/* Task bar / milestone */}
                  {task.type === "milestone" ? (
                    <div
                      className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer ${selectedTaskId === task.id ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0a1120] rounded" : ""}`}
                      style={{ left: `${leftPx + dayWidth / 2}px` }}
                      onClick={() => onTaskSelect?.(task.id)}
                      title={`${task.text} — ${fmtDateFull(task.start)}`}
                    >
                      <div className={`h-4 w-4 rotate-45 rounded-sm border-2 ${selectedTaskId === task.id ? "border-amber-400" : "border-purple-400"} bg-purple-500 shadow-lg shadow-purple-500/30`} />
                    </div>
                  ) : (
                    <div
                      className={`absolute top-1/2 z-10 -translate-y-1/2 overflow-hidden rounded-md shadow-md ${style.bar} ${
                        task.type === "summary" ? "ring-1 ring-blue-300/30" : ""
                      } ${selectedTaskId === task.id ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-[#0a1120]" : ""}`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                        height: task.type === "summary" ? "22px" : "20px",
                        cursor: "grab",
                        opacity: selectedTaskId === task.id ? 1 : 0.92,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, task, "move")}
                      onTouchStart={(e) => handleTouchStart(e, task, "move")}
                      onClick={() => onTaskSelect?.(task.id)}
                      title={`${task.text}\n${fmtDateFull(task.start)} → ${fmtDateFull(task.end)}\nDuración: ${duration} días\nProgreso: ${Math.round(task.progress * 100)}%`}
                    >
                      {/* Progress fill */}
                      <div
                        className="absolute left-0 top-0 h-full bg-white/25"
                        style={{ width: `${Math.round(task.progress * 100)}%` }}
                      />
                      {/* Label inside bar */}
                      {widthPx > 60 && (
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 truncate text-[10px] font-medium text-white drop-shadow">
                          {Math.round(task.progress * 100)}%
                        </span>
                      )}
                      {/* Resize handle */}
                      {task.type !== "summary" && (
                        <div
                          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/30"
                          onMouseDown={(e) => handleMouseDown(e, task, "resize")}
                          onTouchStart={(e) => handleTouchStart(e, task, "resize")}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {visibleTasks.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-slate-500">No hay tareas para mostrar</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.06] bg-[#0a1120] px-3 py-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-gradient-to-r from-blue-500 to-blue-400 ring-1 ring-blue-300/30" />
          Capítulo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-gradient-to-r from-emerald-500 to-emerald-400" />
          Actividad
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rotate-45 rounded-sm border border-purple-400 bg-purple-500" />
          Hito
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm bg-white/25" />
          Progreso
        </span>
        <span className="ml-auto hidden text-slate-600 sm:inline">
          Arrastra las barras para mover · Arrastra el borde derecho para cambiar duración
        </span>
      </div>
    </div>
  );
}
