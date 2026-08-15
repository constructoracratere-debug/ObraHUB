"use client";

import { useState, useEffect } from "react";
import type { APUBudget, APUItem } from "@/lib/budget";
import { formatCOP } from "@/lib/prices";

export function CostosTool({
  initialPrompt,
  projectSlug,
  onGenerateSchedule,
}: {
  initialPrompt?: string;
  /** Project slug — when set, budgets can be saved to (and listed from) it. */
  projectSlug?: string;
  /** Jump to Seguimiento with this context pre-filled (Gantt generation). */
  onGenerateSchedule?: (contextPrompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState<APUBudget | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedBudgets, setSavedBudgets] = useState<Array<{
    id: string;
    title: string;
    total: number;
    itemCount: number;
    createdAt: string;
  }>>([]);

  // Saved budgets of the project (for the 5D↔4D link and future reports).
  useEffect(() => {
    if (!projectSlug) return;
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budgets`)
      .then((r) => (r.ok ? r.json() : { budgets: [] }))
      .then((data) => {
        if (!cancelled) setSavedBudgets(data.budgets ?? []);
      })
      .catch(() => { /* optional */ });
    return () => { cancelled = true; };
  }, [projectSlug, savedId]);

  async function handleDeleteSaved(id: string, title: string) {
    if (!projectSlug) return;
    if (!window.confirm(`¿Eliminar el presupuesto "${title}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budgets?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      setSavedBudgets((arr) => arr.filter((b) => b.id !== id));
      if (savedId === id) setSavedId(null);
    } catch {
      setError("No se pudo eliminar el presupuesto");
    }
  }

  function countItems(b: APUBudget | null): number {
    return (b?.capitulos ?? []).reduce((n, c) => n + (c.items?.length ?? 0), 0);
  }

  /** Gantt bridge: comprehensive budgets go straight to the schedule;
   *  thin ones (few items) get a heads-up first — they may be a partial
   *  scope rather than a whole project. */
  function handleGenerateGantt() {
    if (!budget || !onGenerateSchedule) return;
    const items = countItems(budget);
    const chapters = budget.capitulos.length;
    const isGlobal = items >= 8 && chapters >= 3;
    if (!isGlobal) {
      const ok = window.confirm(
        `Este presupuesto tiene ${items} ítem(s) en ${chapters} capítulo(s) — parece un alcance parcial, no un proyecto completo.\n\n¿Deseas generar el cronograma de todas formas?`,
      );
      if (!ok) return;
    }
    const lines: string[] = [`Presupuesto: ${budget.titulo}`, `Total: ${budget.resumen.total.toLocaleString("es-CO")} COP`, "Capítulos e ítems:"];
    for (const c of budget.capitulos) {
      lines.push(`- ${c.nombre}:`);
      for (const it of c.items) lines.push(`  · ${it.descripcion} — ${it.cantidad} ${it.unidad}`);
    }
    lines.push("", "Genera el cronograma de obra (Gantt) con tareas, dependencias e hitos a partir de estos capítulos e ítems, con secuencia constructiva colombiana y duraciones realistas.");
    onGenerateSchedule(lines.join("\n"));
  }

  async function handleOpenSaved(id: string) {
    if (!projectSlug) return;
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budgets?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al abrir");
      setBudget(data.budget as APUBudget);
      setSavedId(id);
      setExpandedItems(new Set());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir el presupuesto");
    }
  }

  async function handleSaveBudget() {
    if (!projectSlug || !budget || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget, prompt, source: "ai" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      setSavedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el presupuesto");
    } finally {
      setIsSaving(false);
    }
  }

  // When navigated here from the IFC viewer with a pre-filled prompt,
  // load it into the textarea and kick off generation immediately.
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  async function handleGenerate() {
    const value = prompt.trim();
    if (!value || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/budgets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al generar");
      }
      setBudget(data.budget);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el presupuesto");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleExportExcel() {
    if (!budget || isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch("/api/budgets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget }),
      });
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `Presupuesto_ObraHub_${Date.now()}.xlsx`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Error al exportar a Excel");
    } finally {
      setIsExporting(false);
    }
  }

  function toggleItem(key: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="w-full py-2 sm:py-4">
      {/* Prompt input */}
      <div className="mb-6">
        <label htmlFor="budget-prompt" className="mb-1.5 block text-sm font-medium text-slate-300">
          Describe el trabajo a presupuestar
        </label>
        <textarea
          id="budget-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder="Ej. Pintar 200m² de muro exterior con pintura vinílica blanca, incluyendo masilla y dos manos de pintura"
          disabled={isGenerating}
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? "Generando APU…" : "Generar presupuesto"}
          </button>
          {budget && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {isExporting ? "Exportando…" : "Exportar Excel"}
            </button>
          )}
          {budget && projectSlug && (
            <button
              type="button"
              onClick={handleSaveBudget}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
            >
              💾 {isSaving ? "Guardando…" : "Guardar en el proyecto"}
            </button>
          )}
          {budget && onGenerateSchedule && (
            <button
              type="button"
              onClick={handleGenerateGantt}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-300 transition hover:bg-purple-500/20"
            >
              📅 Generar cronograma (Gantt)
            </button>
          )}
          {budget && savedId && (
            <span className="text-xs text-emerald-400">✓ Presupuesto guardado</span>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* Budget result */}
      {isGenerating && !budget && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-4 flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
            </div>
            <p className="text-sm text-slate-500">Generando análisis de precios unitarios…</p>
          </div>
        </div>
      )}

      {budget && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-5 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Costos Directos</p>
              <p className="mt-1 text-sm font-bold text-slate-200">{formatCOP(budget.resumen.costosDirectos)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AIU ({budget.resumen.aiuTotal}%)</p>
              <p className="mt-1 text-sm font-bold text-amber-400">{formatCOP(budget.resumen.valorAIU)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">IVA ({budget.resumen.iva}%)</p>
              <p className="mt-1 text-sm font-bold text-orange-400">{formatCOP(budget.resumen.valorIVA)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total</p>
              <p className="mt-1 text-base font-bold text-emerald-400">{formatCOP(budget.resumen.total)}</p>
            </div>
          </div>

          {/* Chapters and items */}
          {budget.capitulos.map((cap, ci) => (
            <div key={ci} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              {/* Chapter header */}
              <div className="border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                  {cap.nombre}
                </h3>
              </div>
              {/* Items */}
              <div className="divide-y divide-white/[0.04]">
                {cap.items.map((item, ii) => {
                  const key = `${ci}-${ii}`;
                  const expanded = expandedItems.has(key);
                  return (
                    <APUItemRow
                      key={key}
                      item={item}
                      expanded={expanded}
                      onToggle={() => toggleItem(key)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!budget && !isGenerating && !error && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-2xl ring-1 ring-amber-500/20">
            💰
          </div>
          <p className="text-sm font-medium text-white">Generador de Presupuestos APU</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Describe un trabajo de construcción y la IA generará un análisis de precios
            unitarios completo con materiales, mano de obra, equipos, AIU e IVA — listo
            para exportar a Excel y presentar a clientes o entidades gubernamentales.
          </p>
        </div>
      )}

      {/* Saved budgets of the project — the 5D side of the controls spine */}
      {projectSlug && savedBudgets.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            🗂️ Presupuestos del proyecto ({savedBudgets.length})
          </h3>
          <div className="space-y-2">
            {savedBudgets.map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() => void handleOpenSaved(b.id)}
                title="Abrir presupuesto guardado"
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-blue-500/30 hover:bg-blue-500/[0.06] ${
                  b.id === savedId
                    ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                    : "border-white/[0.05] bg-white/[0.02]"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">{b.title}</p>
                  <p className="text-[10px] text-slate-500">
                    {b.itemCount} ítems · {new Date(b.createdAt).toLocaleDateString("es-CO")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-amber-300">{formatCOP(b.total)}</span>
                <span className="shrink-0 text-[10px] text-slate-500">abrir ↗</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteSaved(b.id, b.title); }}
                  className="shrink-0 rounded p-1 text-slate-600 transition hover:text-red-400"
                  title="Eliminar presupuesto"
                >
                  🗑
                </button>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function APUItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: APUItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const aiuPct = item.aiu.administracion + item.aiu.imprevistos + item.aiu.utilidad;
  return (
    <div>
      {/* Item header (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="shrink-0 rounded-md bg-white/[0.04] px-2 py-0.5 text-xs font-mono text-slate-400">
          {item.codigo}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-200">{item.descripcion}</p>
          <p className="text-xs text-slate-600">
            {item.cantidad} {item.unidad} · {formatCOP(item.precioUnitarioTotal)}/{item.unidad}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold text-slate-200">{formatCOP(item.subtotal)}</p>
      </button>

      {/* APU breakdown */}
      {expanded && (
        <div className="border-t border-white/[0.04] bg-[#050b14]/40 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <APUCategory label="Materiales" lines={item.materiales} color="blue" />
            <APUCategory label="Mano de Obra" lines={item.manoObra} color="emerald" />
            <APUCategory label="Equipos" lines={item.equipos} color="amber" />
          </div>

          {/* AIU breakdown */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.04] pt-3 text-xs text-slate-500">
            <span>Costo Directo: <strong className="text-slate-300">{formatCOP(item.costoDirecto)}</strong></span>
            <span>Adm. ({item.aiu.administracion}%): <strong className="text-slate-300">{formatCOP(item.costoDirecto * item.aiu.administracion / 100)}</strong></span>
            <span>Impr. ({item.aiu.imprevistos}%): <strong className="text-slate-300">{formatCOP(item.costoDirecto * item.aiu.imprevistos / 100)}</strong></span>
            <span>Util. ({item.aiu.utilidad}%): <strong className="text-slate-300">{formatCOP(item.costoDirecto * item.aiu.utilidad / 100)}</strong></span>
          </div>

          {/* Scenarios comparison */}
          {item.escenarios && item.escenarios.length > 1 && (
            <div className="mt-4 border-t border-white/[0.04] pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Escenarios de precio
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {item.escenarios.map((esc, ei) => {
                  const isActive = ei === 0; // First scenario = "Estándar" = active
                  const savings = item.subtotal - esc.subtotal;
                  return (
                    <div
                      key={ei}
                      className={`rounded-lg border p-3 ${
                        isActive
                          ? "border-blue-500/30 bg-blue-500/5"
                          : "border-white/[0.06] bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-200">{esc.nombre}</p>
                        {isActive && (
                          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">
                            Activo
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-600">{esc.descripcion}</p>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-sm font-bold text-slate-200">
                          {formatCOP(esc.subtotal)}
                        </span>
                        {!isActive && savings !== 0 && (
                          <span className={`text-[10px] font-medium ${savings > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {savings > 0 ? "−" : "+"}{formatCOP(Math.abs(savings))}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-600">
                        {formatCOP(esc.precioUnitarioTotal)}/{item.unidad}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function APUCategory({
  label,
  lines,
  color,
}: {
  label: string;
  lines: Array<{ name: string; unit: string; qty: number; unitPrice: number; subtotal: number; source?: string }>;
  color: "blue" | "emerald" | "amber";
}) {
  const colorMap = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };
  if (lines.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${colorMap[color]}`}>
        {label}
      </p>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-400">{line.name}</span>
              <span className="shrink-0 text-slate-300">{formatCOP(line.subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-slate-600">
                {line.qty} {line.unit} × {formatCOP(line.unitPrice)}
              </p>
            </div>
            {line.source && (
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-blue-500/70">
                <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="truncate">{line.source}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
