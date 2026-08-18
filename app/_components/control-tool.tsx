"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCOP } from "@/lib/prices";

/**
 * Control de Obra — the assembly-language dashboard.
 *
 * Joins presupuesto (5D) + cronograma (4D) + bitácora (reality) into:
 *   • Earned value KPIs: SPI/CPI, avance plan vs real, projected end
 *   • S-curve (SVG, dependency-free)
 *   • Per-task semaphore (atrasada / en punto / adelantada)
 *   • The budget↔task link editor (each APU item → a Gantt task)
 */

type ProjectAlert = {
  id: string;
  level: "critica" | "advertencia";
  icon: string;
  title: string;
  evidence: string;
  recommendation: string;
};

type Dashboard = {
  window: { start: string; end: string };
  bac: number;
  linkedItems: number;
  totalItems: number;
  kpis: {
    pv: number;
    ev: number;
    ac: number;
    spi: number | null;
    cpi: number | null;
    progressPlanned: number;
    progressEarned: number;
    projectedEnd: string | null;
  };
  series: Array<{ date: string; planned: number; earned: number | null }>;
  tasks: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    progress: number;
    planned: number;
    delta: number;
    status: "atrasada" | "en_punto" | "adelantada" | "no_iniciada";
    budget: number;
  }>;
  rainHoursTotal: number;
  rainDays: number;
  daysWithEntries: number;
};

type ItemRow = {
  id: string;
  chapter: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  subtotal: number;
  taskId: string | null;
};

type TaskOption = { id: string; name: string };

const STATUS_META: Record<Dashboard["tasks"][number]["status"], { label: string; cls: string; dot: string }> = {
  atrasada: { label: "Atrasada", cls: "border-red-500/30 bg-red-500/10 text-red-300", dot: "bg-red-400" },
  en_punto: { label: "En punto", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400" },
  adelantada: { label: "Adelantada", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300", dot: "bg-sky-400" },
  no_iniciada: { label: "No iniciada", cls: "border-white/[0.08] bg-white/[0.03] text-slate-400", dot: "bg-slate-500" },
};

function pct(n: number | null, digits = 1): string {
  return n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`;
}

function idx(n: number | null, digits = 2): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
}

export function ControlTool({ projectSlug }: { projectSlug: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<ProjectAlert[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [budgets, setBudgets] = useState<Array<{ id: string; title: string; total: number }>>([]);
  const [budgetId, setBudgetId] = useState<string>("");
  const [reason, setReason] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [activity, setActivity] = useState<Array<{ id: string; kind: string; description: string; createdAt: string }>>([]);
  // RFIs / No conformidades
  const [rfis, setRfis] = useState<Array<{ id: string; code: string; title: string; reference: string; assignee: string; due_date: string | null; status: string; response: string }>>([]);
  const [rfiTitle, setRfiTitle] = useState("");
  const [rfiAssignee, setRfiAssignee] = useState("");
  const [rfiDue, setRfiDue] = useState("");
  const [rfiBusy, setRfiBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [rfiNotify, setRfiNotify] = useState(false);
  const [rfiNotifyEmail, setRfiNotifyEmail] = useState("");

  async function loadRfis(slug: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/rfis`);
      const data = await res.json();
      setRfis(res.ok ? (data.rfis ?? []) : []);
    } catch { setRfis([]); }
  }

  async function handleCreateRfi() {
    if (!projectSlug || !rfiTitle.trim() || rfiBusy) return;
    setRfiBusy(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/rfis`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: rfiTitle.trim(), assignee: rfiAssignee.trim(), dueDate: rfiDue || null, notify: rfiNotify, notifyEmail: rfiNotifyEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      if (data.notify === "failed") setError("RFI creado, pero el correo no pudo enviarse (Resend free-tier solo entrega al correo del dueño — verifica un dominio en resend.com/domains)");
      if (data.notify === "sent") setSavedMsg("📧 Notificación enviada al responsable");
      setRfiTitle(""); setRfiAssignee(""); setRfiDue("");
      await loadRfis(projectSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear RFI");
    } finally { setRfiBusy(false); }
  }

  // Línea base (baseline)
  const [baselines, setBaselines] = useState<Array<{ id: string; label: string; created_at: string }>>([]);
  const [baseSel, setBaseSel] = useState<string>("");
  const [baseSnap, setBaseSnap] = useState<Array<{ taskId: string; name: string; start: string; end: string }>>([]);
  const [baseLabel, setBaseLabel] = useState("");
  const [baseBusy, setBaseBusy] = useState(false);

  async function loadBaselines(slug: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/baselines`);
      const data = await res.json();
      if (res.ok) {
        setBaselines(data.baselines ?? []);
        if ((data.baselines ?? []).length > 0 && !baseSel) setBaseSel(data.baselines[0].id);
      } else setBaselines([]);
    } catch { setBaselines([]); }
  }

  async function loadBaseSnapshot(id: string) {
    if (!id) { setBaseSnap([]); return; }
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/baselines?id=${id}`);
      const data = await res.json();
      setBaseSnap(res.ok && data.baseline ? (data.baseline.snapshot ?? []) : []);
    } catch { setBaseSnap([]); }
  }

  async function handleFreezeBaseline() {
    if (baseBusy) return;
    setBaseBusy(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/baselines`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: baseLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setBaseLabel("");
      await loadBaselines(projectSlug);
      if (data.baseline?.id) { setBaseSel(data.baseline.id); await loadBaseSnapshot(data.baseline.id); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al congelar línea base");
    } finally { setBaseBusy(false); }
  }

  /** Variance (days) of current vs baseline end dates, matched by taskId. */
  function baseVariance(): Array<{ name: string; base: string; now: string; delta: number }> {
    const byId = new Map(baseSnap.map((b) => [b.taskId, b]));
    return dashboard?.tasks
      .map((t) => {
        const b = byId.get(t.id);
        if (!b) return null;
        const delta = Math.round((Date.parse(`${t.endDate}T00:00:00`) - Date.parse(`${b.end}T00:00:00`)) / 86400000);
        return { name: t.name, base: b.end, now: t.endDate, delta };
      })
      .filter((x): x is { name: string; base: string; now: string; delta: number } => x !== null)
      .sort((a, b) => b.delta - a.delta) ?? [];
  }

  async function handlePatchRfi(id: string, patch: { status?: string; response?: string }) {
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/rfis`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      await loadRfis(projectSlug);
    } catch { /* ignore */ }
  }
  const [isReport, setIsReport] = useState(false);

  function handleExportProject() {
    window.open(`/api/projects/${encodeURIComponent(projectSlug)}/export`, "_blank");
  }

  const load = useCallback(
    async (id?: string, opts?: { light?: boolean }) => {
      if (!opts?.light) setIsLoading(true);
      setError(null);
      try {
        const qs = id ? `?budgetId=${encodeURIComponent(id)}` : "";
        const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/control${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al cargar");
        setBudgets(data.budgets ?? []);
        setDashboard(data.dashboard ?? null);
        setAlerts(data.alerts ?? []);
        void loadRfis(projectSlug);
        void loadBaselines(projectSlug);
        fetch(`/api/projects/${encodeURIComponent(projectSlug)}/activity`)
          .then((r) => (r.ok ? r.json() : { activity: [] }))
          .then((d) => setActivity(d.activity ?? []))
          .catch(() => setActivity([]));
        setItems(data.items ?? []);
        setReason(data.dashboard ? null : (data.reason ?? null));
        if (data.tasksCount != null) {
          // Task names for the link editor come with the dashboard payload;
          // fetch them separately only if we have no dashboard yet.
          if (!data.dashboard) {
            const t = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`);
            const td = await t.json();
            setTasks((td.tasks ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
          }
        }
        if (data.budget) setBudgetId(data.budget.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        if (!opts?.light) setIsLoading(false);
      }
    },
    [projectSlug],
  );

  // When a dashboard loads, also pull task names for the link editor.
  useEffect(() => {
    if (!projectSlug) return;
    fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`)
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => setTasks((d.tasks ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))))
      .catch(() => setTasks([]));
  }, [projectSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLink(itemId: string, taskId: string) {
    setLinkingId(itemId);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budgets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, taskId: taskId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Error al vincular");
      }
      setItems((arr) => arr.map((i) => (i.id === itemId ? { ...i, taskId: taskId || null } : i)));
      // Refresh silencioso: recalcula KPIs/curva SIN congelar la vista.
      await load(budgetId || undefined, { light: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setLinkingId(null);
    }
  }

  const linkedCount = useMemo(() => items.filter((i) => i.taskId).length, [items]);

  useEffect(() => {
    if (baseSel) void loadBaseSnapshot(baseSel);
  }, [baseSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const variance = useMemo(() => (dashboard && baseSnap.length > 0 ? baseVariance() : []), [dashboard, baseSnap]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleWeeklyReport() {
    if (isReport) return;
    setIsReport(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/weekly-report`);
      if (!res.ok) throw new Error("Error al generar el informe");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Informe_Asamblea_${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el informe");
    } finally {
      setIsReport(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      {/* Header */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">📈 Control de Obra</h2>
            <p className="text-xs text-slate-500">
              Curva S, valor ganado (SPI/CPI) y vínculo presupuesto ↔ cronograma.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {budgets.length > 1 && (
              <select
                value={budgetId}
                onChange={(e) => {
                  setBudgetId(e.target.value);
                  void load(e.target.value);
                }}
                className="max-w-52 rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-2 text-xs text-slate-200 focus:border-teal-500/40 focus:outline-none"
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void load(budgetId || undefined)}
              className="rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
            >
              ↻ Actualizar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Calculando control de obra…</p>
      ) : reason === "no_budget" ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-2xl ring-1 ring-teal-500/20">
            📈
          </div>
          <p className="text-sm font-medium text-white">Aún no hay presupuesto guardado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Genera un presupuesto en 💰 <span className="text-slate-300">Costos y Presupuestos</span> y usa
            <span className="text-slate-300"> «Guardar en el proyecto»</span> — luego vuelve acá para ver la Curva S.
          </p>
        </div>
      ) : dashboard ? (
        <>
          {/* Alerts */}
          {alerts.length > 0 && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAlertsOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-200"
                >
                  <span className={`inline-block transition-transform ${alertsOpen ? "rotate-0" : "-rotate-90"}`}>▾</span>
                  🚨 Alertas para asamblea ({alerts.length})
                </button>
                <div className="flex gap-2 text-[10px]">
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300">
                    {alerts.filter((a) => a.level === "critica").length} críticas
                  </span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                    {alerts.filter((a) => a.level === "advertencia").length} advertencias
                  </span>
                </div>
              </div>
              {alertsOpen && (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-lg border px-3 py-2.5 ${
                      a.level === "critica"
                        ? "border-red-500/25 bg-red-500/[0.07]"
                        : "border-amber-500/25 bg-amber-500/[0.06]"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${a.level === "critica" ? "text-red-200" : "text-amber-200"}`}>
                      {a.icon} {a.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-300">{a.evidence}</p>
                    <p className="mt-1 text-[11px] italic text-slate-500">→ {a.recommendation}</p>
                  </div>
                ))}
              </div>
              )}
            </section>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Avance real" value={pct(dashboard.kpis.progressEarned)} tone="emerald" />
            <KpiCard label="Avance plan" value={pct(dashboard.kpis.progressPlanned)} tone="sky" />
            <KpiCard
              label="SPI (cronograma)"
              value={idx(dashboard.kpis.spi)}
              tone={dashboard.kpis.spi == null ? "slate" : dashboard.kpis.spi >= 1 ? "emerald" : dashboard.kpis.spi >= 0.9 ? "amber" : "red"}
              hint={dashboard.kpis.spi == null ? "sin plan" : dashboard.kpis.spi >= 1 ? "en hora" : "atrasado"}
            />
            <KpiCard
              label="CPI (costo)"
              value={idx(dashboard.kpis.cpi)}
              tone={dashboard.kpis.cpi == null ? "slate" : dashboard.kpis.cpi >= 1 ? "emerald" : dashboard.kpis.cpi >= 0.9 ? "amber" : "red"}
              hint={dashboard.kpis.cpi == null ? "sin costo real" : dashboard.kpis.cpi >= 1 ? "bajo presupuesto" : "sobrecosto"}
            />
            <KpiCard
              label="Fin proyectado"
              value={dashboard.kpis.projectedEnd ?? "—"}
              tone={
                dashboard.kpis.projectedEnd && dashboard.window.end && dashboard.kpis.projectedEnd > dashboard.window.end
                  ? "red"
                  : "emerald"
              }
              hint={`plan: ${dashboard.window.end}`}
            />
            <KpiCard label="Lluvia (bitácora)" value={`${dashboard.rainHoursTotal.toFixed(1)} h`} tone="sky" hint={`${dashboard.rainDays} días`} />
          </div>

          {/* S-curve */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                📉 Curva S — avance físico
              </h3>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-sky-400" /> Plan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-emerald-400" /> Real
                </span>
              </div>
            </div>
            <SCurve dashboard={dashboard} />
          </section>

          {/* Línea base del cronograma */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  📐 Línea base del cronograma
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Congela el cronograma contractual y compara contra los cambios reales.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {baselines.length > 0 && (
                  <select
                    value={baseSel}
                    onChange={(e) => setBaseSel(e.target.value)}
                    className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    {baselines.map((b) => (
                      <option key={b.id} value={b.id}>{b.label} · {new Date(b.created_at).toLocaleDateString("es-CO")}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text" value={baseLabel} onChange={(e) => setBaseLabel(e.target.value)}
                  placeholder="Etiqueta (ej. Contrato firmado)"
                  className="w-44 rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
                <button
                  type="button" onClick={() => void handleFreezeBaseline()} disabled={baseBusy}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
                >
                  {baseBusy ? "…" : "❄️ Congelar actual"}
                </button>
              </div>
            </div>
            {variance.length > 0 ? (
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {variance.slice(0, 12).map((v, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-1.5">
                    <span className="min-w-0 truncate text-xs text-slate-200">{v.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{v.base} → {v.now}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${v.delta > 0 ? "bg-red-500/15 text-red-300" : v.delta < 0 ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                      {v.delta > 0 ? `+${v.delta}d` : v.delta === 0 ? "en línea" : `${v.delta}d`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-600">
                {baselines.length === 0 ? "Sin línea base — congela el cronograma contractual para detectar desviaciones reales." : "Esta línea base no coincide con las tareas actuales."}
              </p>
            )}
          </section>

          {/* RFIs / No conformidades */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  📋 RFIs y No conformidades ({rfis.filter((r) => r.status !== "cerrada").length} abiertas)
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Preguntas de obra con responsable y vencimiento — incluidas en el informe de asamblea.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text" value={rfiTitle} onChange={(e) => setRfiTitle(e.target.value)}
                placeholder="Ej. Confirmar nivel de acabado fachada norte"
                className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-teal-500/40 focus:outline-none"
              />
              <input
                type="text" value={rfiAssignee} onChange={(e) => setRfiAssignee(e.target.value)}
                placeholder="Responsable"
                className="w-36 rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-teal-500/40 focus:outline-none"
              />
              <input
                type="date" value={rfiDue} onChange={(e) => setRfiDue(e.target.value)}
                className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-2 text-xs text-slate-300 focus:border-teal-500/40 focus:outline-none"
              />
              <button
                type="button" onClick={() => void handleCreateRfi()} disabled={rfiBusy || !rfiTitle.trim()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
              >
                {rfiBusy ? "…" : "+ RFI"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={rfiNotify} onChange={(e) => setRfiNotify(e.target.checked)} className="accent-teal-500" />
                📧 Notificar por correo
              </label>
              {rfiNotify && (
                <input
                  type="email" value={rfiNotifyEmail} onChange={(e) => setRfiNotifyEmail(e.target.value)}
                  placeholder="correo del responsable"
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              )}
              {savedMsg && <span className="text-emerald-400">{savedMsg}</span>}
            </div>
            {rfis.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {rfis.slice(0, 12).map((r) => {
                  const overdue = r.status === "abierta" && r.due_date && r.due_date < new Date().toISOString().slice(0, 10);
                  const st = r.status === "cerrada" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : r.status === "respondida" ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                    : overdue ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300";
                  return (
                    <div key={r.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-slate-200">
                            <span className="mr-2 font-mono text-[10px] text-slate-500">{r.code}</span>{r.title}
                          </p>
                          <p className="text-[10px] text-slate-600">
                            {r.assignee || "Sin responsable"}{r.due_date ? ` · vence ${r.due_date}` : ""}{r.response ? " · respondida" : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st}`}>
                          {overdue && r.status === "abierta" ? "VENCIDA" : r.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.status !== "respondida" && r.status !== "cerrada" && (
                          <button type="button" onClick={() => void handlePatchRfi(r.id, { status: "respondida", response: r.response || "Respuesta registrada en obra" })} className="rounded border border-sky-500/30 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/10">↩ Responder</button>
                        )}
                        {r.status !== "cerrada" && (
                          <button type="button" onClick={() => void handlePatchRfi(r.id, { status: "cerrada" })} className="rounded border border-emerald-500/30 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/10">✓ Cerrar</button>
                        )}
                        {r.status === "cerrada" && (
                          <button type="button" onClick={() => void handlePatchRfi(r.id, { status: "abierta" })} className="rounded border border-white/[0.1] px-2 py-1 text-[10px] text-slate-400 hover:bg-white/[0.05]">↺ Reabrir</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Budget ↔ task links */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  🔗 Vínculo presupuesto ↔ cronograma
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {linkedCount}/{items.length} ítems vinculados
                  {linkedCount === 0 && " — sin vínculos la Curva S usa pesos iguales por tarea"}
                  {dashboard.bac > 0 && ` · BAC: ${formatCOP(dashboard.bac)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLinks((s) => !s)}
                className="rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                {showLinks ? "Ocultar editor" : "✏️ Editar vínculos"}
              </button>
            </div>

            {showLinks && (
              <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{it.descripcion}</p>
                      <p className="text-[10px] text-slate-600">
                        {it.chapter || "Sin capítulo"} · {it.cantidad} {it.unidad} · {formatCOP(it.subtotal)}
                      </p>
                    </div>
                    <select
                      value={it.taskId ?? ""}
                      disabled={linkingId === it.id}
                      onChange={(e) => void handleLink(it.id, e.target.value)}
                      className={`w-52 rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${
                        it.taskId
                          ? "border-teal-500/40 bg-teal-500/10 text-teal-200"
                          : "border-white/[0.1] bg-[#050b14] text-slate-300"
                      }`}
                    >
                      <option value="">— sin tarea —</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-[11px] text-slate-500">Este presupuesto no tiene ítems.</p>
                )}
              </div>
            )}
          </section>

          {/* Task semaphore */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              🚦 Semáforo de tareas ({dashboard.tasks.length})
            </h3>
            <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {dashboard.tasks.map((t) => {
                const meta = STATUS_META[t.status];
                return (
                  <div key={t.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-200">{t.name}</p>
                        <p className="text-[10px] text-slate-600">
                          {t.startDate} → {t.endDate}
                          {t.budget > 0 && ` · ${formatCOP(t.budget)}`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-sky-400/40"
                          style={{ width: `${Math.min(100, Math.max(0, t.planned))}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                          style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-slate-500">
                        <span>plan {t.planned.toFixed(0)}%</span>
                        <span
                          className={
                            t.delta < -10 ? "text-red-400" : t.delta > 10 ? "text-sky-400" : "text-slate-500"
                          }
                        >
                          real {t.progress.toFixed(0)}% ({t.delta >= 0 ? "+" : ""}
                          {t.delta.toFixed(0)} pts)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dashboard.tasks.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  Sin tareas — crea el cronograma en 📊 Seguimiento de Obra.
                </p>
              )}
            </div>
          </section>

          {/* Actividad reciente */}
          {activity.length > 0 && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                🕘 Actividad reciente
              </h3>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {activity.slice(0, 20).map((a) => (
                  <div key={a.id} className="flex items-baseline justify-between gap-2 border-b border-white/[0.03] py-1 last:border-0">
                    <span className="min-w-0 truncate text-[11px] text-slate-300">
                      <span className="mr-1.5">{{ file: "📎", budget: "💰", task: "📊", bitacora: "📔", rfi: "📋", member: "👥", baseline: "📐", link: "🔗" }[a.kind] ?? "•"}</span>
                      {a.description}
                    </span>
                    <span className="shrink-0 text-[9px] text-slate-600">{new Date(a.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-center text-[10px] text-slate-600">
            Fuente: bitácora diaria ({dashboard.daysWithEntries} día(s) registrados) · presupuesto guardado ·
            cronograma · {dashboard.linkedItems}/{dashboard.totalItems} ítems vinculados
          </p>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">Sin datos de control todavía.</p>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "amber" | "red" | "slate";
  hint?: string;
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
    red: "text-red-300",
    slate: "text-slate-300",
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="truncate text-[9px] text-slate-600">{hint}</p>}
    </div>
  );
}

/** S-curve chart — dependency-free SVG (same philosophy as the Gantt DOM). */
function SCurve({ dashboard }: { dashboard: Dashboard }) {
  const W = 720;
  const H = 240;
  const PAD = { l: 34, r: 10, t: 10, b: 20 };

  const { dStart, dEnd, x, y } = useMemo(() => {
    const start = Date.parse(`${dashboard.window.start}T00:00:00`);
    const end = Date.parse(`${dashboard.window.end}T00:00:00`);
    const span = Math.max(1, end - start);
    const x = (date: string) =>
      PAD.l + ((Date.parse(`${date}T00:00:00`) - start) / span) * (W - PAD.l - PAD.r);
    const y = (pct: number) =>
      PAD.t + (1 - Math.min(100, Math.max(0, pct)) / 100) * (H - PAD.t - PAD.b);
    return { dStart: start, dEnd: end, x, y };
  }, [dashboard.window]);

  const todayX = useMemo(() => {
    const now = Date.now();
    return now >= dStart && now <= dEnd
      ? PAD.l + ((now - dStart) / Math.max(1, dEnd - dStart)) * (W - PAD.l - PAD.r)
      : null;
  }, [dStart, dEnd]);

  const plannedPath = dashboard.series
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.planned).toFixed(1)}`)
    .join(" ");
  const earnedPts = dashboard.series.filter((p) => p.earned != null);
  const earnedPath = earnedPts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.earned ?? 0).toFixed(1)}`)
    .join(" ");

  const areaPath =
    earnedPts.length > 1
      ? `${earnedPath} L${x(earnedPts[earnedPts.length - 1].date).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(
          earnedPts[0].date,
        ).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`
      : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Curva S de avance">
      {/* grid + y labels */}
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(p)}
            y2={y(p)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
          <text x={4} y={y(p) + 3} fill="rgba(148,163,184,0.7)" fontSize={9}>
            {p}%
          </text>
        </g>
      ))}
      {/* x labels: start / mid / end */}
      <text x={PAD.l} y={H - 6} fill="rgba(148,163,184,0.7)" fontSize={9}>
        {dashboard.window.start}
      </text>
      <text x={W / 2 - 24} y={H - 6} fill="rgba(148,163,184,0.7)" fontSize={9}>
        {new Date((dStart + dEnd) / 2).toISOString().slice(0, 10)}
      </text>
      <text x={W - PAD.r - 74} y={H - 6} fill="rgba(148,163,184,0.7)" fontSize={9}>
        {dashboard.window.end}
      </text>
      {/* today marker */}
      {todayX != null && (
        <g>
          <line
            x1={todayX}
            x2={todayX}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="rgba(244,114,182,0.6)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={todayX - 14} y={PAD.t + 8} fill="rgba(244,114,182,0.9)" fontSize={8}>
            hoy
          </text>
        </g>
      )}
      {/* earned area + lines */}
      {areaPath && <path d={areaPath} fill="rgba(52,211,153,0.12)" />}
      <path d={plannedPath} fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
      {earnedPath && <path d={earnedPath} fill="none" stroke="#34d399" strokeWidth={2.5} />}
      {/* end markers */}
      {earnedPts.length > 0 && (
        <circle
          cx={x(earnedPts[earnedPts.length - 1].date)}
          cy={y(earnedPts[earnedPts.length - 1].earned ?? 0)}
          r={3.5}
          fill="#34d399"
        />
      )}
    </svg>
  );
}
