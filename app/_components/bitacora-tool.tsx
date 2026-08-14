"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Bitácora Diaria — the site reality capture point.
 *
 * One screen a residente fills every day: weather (rain hours justify
 * deadline claims), crew, equipment, per-task cumulative progress and the
 * day's narrative. Everything persists per project+date and later feeds the
 * S-curve, alerts and the weekly assembly report.
 */

type TaskLite = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
};

type Weather = "soleado" | "nublado" | "lluvia" | "lluvia_fuerte" | "otro";

const WEATHER_OPTIONS: Array<{ id: Weather; label: string; icon: string }> = [
  { id: "soleado", label: "Soleado", icon: "☀️" },
  { id: "nublado", label: "Nublado", icon: "⛅" },
  { id: "lluvia", label: "Lluvia", icon: "🌧️" },
  { id: "lluvia_fuerte", label: "Lluvia fuerte", icon: "⛈️" },
  { id: "otro", label: "Otro", icon: "🔧" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekOf(iso: string): string[] {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const monday = addDays(iso, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function BitacoraTool({ projectSlug }: { projectSlug: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [savedDays, setSavedDays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Day fields
  const [weather, setWeather] = useState<Weather>("soleado");
  const [rainHours, setRainHours] = useState<string>("0");
  const [workersTotal, setWorkersTotal] = useState<string>("0");
  const [workersDetail, setWorkersDetail] = useState<Array<{ trade: string; count: string }>>([]);
  const [equipment, setEquipment] = useState<Array<{ name: string; count: string }>>([]);
  const [observations, setObservations] = useState("");
  const [incidents, setIncidents] = useState("");
  const [delays, setDelays] = useState("");
  const [progressByTask, setProgressByTask] = useState<Record<string, string>>({});

  const weekDays = useMemo(() => weekOf(selectedDate), [selectedDate]);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`);
      const data = await res.json();
      setTasks(res.ok ? (data.tasks ?? []) : []);
    } catch {
      setTasks([]);
    }
  }, [projectSlug]);

  const loadDay = useCallback(async (date: string) => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/bitacora?date=${date}`,
      );
      const data = await res.json();
      const entry = res.ok ? data.entry : null;
      if (entry) {
        setWeather(entry.weather ?? "soleado");
        setRainHours(String(entry.rainHours ?? 0));
        setWorkersTotal(String(entry.workersTotal ?? 0));
        setWorkersDetail(
          Object.entries(entry.workersDetail ?? {}).map(([trade, count]) => ({
            trade,
            count: String(count),
          })),
        );
        setEquipment(
          Object.entries(entry.equipment ?? {}).map(([name, count]) => ({
            name,
            count: String(count),
          })),
        );
        setObservations(entry.observations ?? "");
        setIncidents(entry.incidents ?? "");
        setDelays(entry.delays ?? "");
        const pp: Record<string, string> = {};
        for (const p of entry.taskProgress ?? []) pp[p.taskId] = String(p.progress);
        setProgressByTask(pp);
        setSavedAt(entry.updatedAt ?? null);
      } else {
        // Fresh day — prefill progress from the Gantt's current values.
        setWeather("soleado");
        setRainHours("0");
        setWorkersTotal("0");
        setWorkersDetail([]);
        setEquipment([]);
        setObservations("");
        setIncidents("");
        setDelays("");
        setProgressByTask({});
        setSavedAt(null);
      }
    } catch {
      setError("No se pudo cargar el día");
    }
  }, [projectSlug]);

  const loadWeekStrip = useCallback(async () => {
    try {
      const from = weekOf(selectedDate)[0];
      const to = weekOf(selectedDate)[6];
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/bitacora?from=${from}&to=${to}`,
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.entries)) {
        setSavedDays(new Set(data.entries.map((e: { entryDate: string }) => e.entryDate)));
      }
    } catch {
      /* strip is decorative */
    }
  }, [projectSlug, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([loadTasks(), loadDay(selectedDate), loadWeekStrip()]).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadTasks, loadDay, loadWeekStrip, selectedDate]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        entryDate: selectedDate,
        weather,
        rainHours: Number(rainHours) || 0,
        workersTotal: Number(workersTotal) || 0,
        workersDetail: Object.fromEntries(
          workersDetail
            .filter((w) => w.trade.trim() && Number(w.count) > 0)
            .map((w) => [w.trade.trim(), Number(w.count)]),
        ),
        equipment: Object.fromEntries(
          equipment
            .filter((e) => e.name.trim() && Number(e.count) > 0)
            .map((e) => [e.name.trim(), Number(e.count)]),
        ),
        observations,
        incidents,
        delays,
        taskProgress: Object.entries(progressByTask)
          .filter(([, v]) => v !== "" && v != null)
          .map(([taskId, v]) => ({ taskId, progress: Number(v) })),
      };
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/bitacora`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      setSavedAt(new Date().toISOString());
      await loadWeekStrip();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  }

  const tasksForDay = tasks; // all tasks — progress is cumulative per task

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-8">
      {/* Header: date + week strip */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">📔 Bitácora Diaria</h2>
            <p className="text-xs text-slate-500">
              Registro legal de obra — clima, personal, equipo y avance físico del día.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayISO())}
              className="rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
              title="Día anterior"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
              title="Día siguiente"
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {weekDays.map((d) => {
            const isSel = d === selectedDate;
            const has = savedDays.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`rounded-lg border px-1 py-1.5 text-center text-[10px] transition ${
                  isSel
                    ? "border-rose-500/50 bg-rose-500/20 text-rose-100"
                    : has
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                      : "border-white/[0.06] bg-white/[0.02] text-slate-500 hover:bg-white/[0.05]"
                }`}
              >
                <span className="block font-medium">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][weekDays.indexOf(d) % 7]}
                </span>
                <span className="block">{d.slice(8)}</span>
                {has && <span className="block">✓</span>}
              </button>
            );
          })}
        </div>
        {savedAt && (
          <p className="mt-2 text-[10px] text-emerald-400">
            ✓ Día guardado ({new Date(savedAt).toLocaleString("es-CO")})
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">Cargando bitácora…</p>
      ) : (
        <>
          {/* Weather */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              🌤️ Clima del día
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWeather(w.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    weather === w.id
                      ? "border-rose-500/50 bg-rose-500/20 text-rose-100"
                      : "border-white/[0.08] bg-[#050b14] text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  {w.icon} {w.label}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                Horas de lluvia
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={rainHours}
                  onChange={(e) => setRainHours(e.target.value)}
                  className="w-20 rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                />
              </label>
            </div>
          </section>

          {/* Crew + equipment */}
          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  👷 Personal
                </h3>
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  Total
                  <input
                    type="number"
                    min={0}
                    value={workersTotal}
                    onChange={(e) => setWorkersTotal(e.target.value)}
                    className="w-20 rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                  />
                </label>
              </div>
              <div className="space-y-2">
                {workersDetail.map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={w.trade}
                      placeholder="Oficio (ej. oficial, ayudante…)"
                      onChange={(e) =>
                        setWorkersDetail((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, trade: e.target.value } : x)),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={w.count}
                      onChange={(e) =>
                        setWorkersDetail((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)),
                        )
                      }
                      className="w-16 rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setWorkersDetail((arr) => arr.filter((_, j) => j !== i))}
                      className="px-1 text-slate-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setWorkersDetail((arr) => [...arr, { trade: "", count: "1" }])}
                  className="rounded-lg border border-dashed border-white/[0.12] px-3 py-1.5 text-[11px] text-slate-400 hover:bg-white/[0.04]"
                >
                  + Añadir oficio
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                🚜 Equipo y maquinaria
              </h3>
              <div className="space-y-2">
                {equipment.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={e.name}
                      placeholder="Equipo (ej. mezcladora, grúa…)"
                      onChange={(ev) =>
                        setEquipment((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={e.count}
                      onChange={(ev) =>
                        setEquipment((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, count: ev.target.value } : x)),
                        )
                      }
                      className="w-16 rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:border-rose-500/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEquipment((arr) => arr.filter((_, j) => j !== i))}
                      className="px-1 text-slate-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEquipment((arr) => [...arr, { name: "", count: "1" }])}
                  className="rounded-lg border border-dashed border-white/[0.12] px-3 py-1.5 text-[11px] text-slate-400 hover:bg-white/[0.04]"
                >
                  + Añadir equipo
                </button>
              </div>
            </section>
          </div>

          {/* Task progress */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              📊 Avance físico por tarea (acumulado)
            </h3>
            <p className="mb-3 text-[11px] text-slate-500">
              Registra el % acumulado a la fecha — alimenta la Curva S y las alertas de atraso.
            </p>
            {tasksForDay.length === 0 ? (
              <p className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-500">
                Este proyecto no tiene tareas todavía — crea el cronograma en 📊 Seguimiento de Obra.
              </p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {tasksForDay.map((t) => {
                  const val = progressByTask[t.id] ?? "";
                  const isTodayActive =
                    selectedDate >= t.startDate.slice(0, 10) && selectedDate <= t.endDate.slice(0, 10);
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        isTodayActive
                          ? "border-rose-500/20 bg-rose-500/[0.06]"
                          : "border-white/[0.05] bg-white/[0.02]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-200">{t.name}</p>
                        <p className="text-[10px] text-slate-600">
                          {t.startDate.slice(0, 10)} → {t.endDate.slice(0, 10)} · Gantt: {t.progress}%
                          {isTodayActive && " · activa hoy"}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={val}
                        placeholder="—"
                        onChange={(e) =>
                          setProgressByTask((p) => ({ ...p, [t.id]: e.target.value }))
                        }
                        className={`w-20 rounded-lg border bg-[#050b14] px-2 py-1.5 text-right text-xs focus:outline-none ${
                          val !== ""
                            ? "border-rose-500/40 text-rose-100"
                            : "border-white/[0.1] text-slate-300"
                        } focus:border-rose-500/60`}
                      />
                      <span className="text-[10px] text-slate-500">%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Narrative */}
          <section className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              📝 Novedades del día
            </h3>
            {(
              [
                ["Observaciones", observations, setObservations, "Actividades ejecutadas, visitas, entregas…"],
                ["Incidentes / novedades", incidents, setIncidents, "Accidentes, daños, interferencias, no conformidades…"],
                ["Atrasos y causas", delays, setDelays, "Causas de atraso (clima, suministros, personal…)"],
              ] as const
            ).map(([label, value, setter, ph]) => (
              <label key={label} className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">{label}</span>
                <textarea
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={ph}
                  rows={2}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-rose-500/40 focus:outline-none"
                />
              </label>
            ))}
          </section>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            {savedAt && <span className="text-[11px] text-emerald-400">✓ Sincronizado</span>}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Guardando…" : "💾 Guardar día"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
