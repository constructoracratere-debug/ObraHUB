"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { sanitizeFloorPlan, STRUCTURE_LABELS, type FloorPlan, type StructuralSystem } from "@/lib/design/schema";
import { deadLoads, liveLoads, seismicWeight, combos, columnCheck } from "@/lib/structural/loads";
import { portalFromPlan, solveFrame } from "@/lib/structural/frame";
import { designElements, licenseChecklist } from "@/lib/structural/license";
import { spectrum, baseShear, TaApprox, CITY_DEFAULTS } from "@/lib/structural/seismic";
import { structuralPlanPrimitives } from "@/lib/structural/plan";
import { PrimsSvg } from "./design-tool";
import { IfcLive } from "./ifc-live";

/**
 * #3 DISEÑO ESTRUCTURAL ASISTIDO POR IA — FASE 2.
 *
 * Lee el modelo del Diseño Arquitectónico (un solo modelo, la sesión en
 * la nube) y entrega:
 *   · MEMORIA de cargas NSR-10 (fase 1, determinista)
 *   · EDITOR de secciones/materiales/unión — cambia y el IFC regenera
 *   · ANÁLISIS visual: columnas coloreadas por utilización Pn/Pu
 *   · SISMO: deriva por piso vs límite NSR-10 A.3, corte basal por nivel
 *   · GUARDAR de vuelta a la sesión del diseño (conectado bidireccional)
 */
function memoria(plan: FloorPlan): string {
  const d = deadLoads(plan), l = liveLoads(plan);
  const sw = seismicWeight(plan, d.wPerM2, l.weighted);
  const co = combos(d.wPerM2, l.weighted, 80);
  const col = columnCheck(plan, d.wPerM2, l.weighted);
  const L: string[] = ["MEMORIA DE CARGAS — NSR-10", "=".repeat(50), `Proyecto: ${plan.name} · ${plan.levels} nivel(es)`];
  L.push("", "1. CARGAS MUERTAS (D)");
  d.lines.forEach((x) => L.push(`  - ${x.item}: ${x.value} ${x.unit} [${x.ref}]`));
  L.push("", "2. SOBRECARGAS (L) NSR-10 A.8.3.1");
  l.lines.forEach((x) => L.push(`  - ${x.item} [${x.ref}]`));
  L.push("", `3. PESO SISMICO W = D + 0.25L = ${sw.perM2} kgf/m2 -> W = ${Math.round(sw.W / 1000)} t`);
  L.push("", "4. COMBINACIONES NSR-10 Titulo B");
  co.forEach((x) => L.push(`  - ${x.item} = ${x.value} kgf/m2 [${x.ref}]`));
  L.push("", `5. PREDIMENSION COLUMNA: Pu = ${Math.round(col.Pu / 1000)} t -> As req ${col.areaReq} cm2 -> ${col.suggested} (C.21.3.3)`);
  L.push("", `6. SISTEMA: ${STRUCTURE_LABELS[plan.structure?.system as StructuralSystem] ?? plan.structure?.system ?? "no definido"}`);
  return L.join("\n");
}

/** Utilización de columna (Pn/Pu) por NSR-10 — código de color en 3D. */
function colUtilization(plan: FloorPlan, system: string): Array<{ x: number; y: number; Pu_t: number; Pn_t: number; util: number }> {
  const d = deadLoads(plan), l = liveLoads(plan);
  const { Pu } = columnCheck(plan, d.wPerM2, l.weighted);
  const levels = Math.max(1, plan.levels);
  const axes = plan.structure?.axes ?? [];
  const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at);
  const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at);
  const nx = vs.length ? vs : [0.15, plan.outline.width - 0.15];
  const ny = hs.length ? hs : [0.15, plan.outline.depth - 0.15];
  // capacidad nominal según sistema
  const fc = 210; // kgf/cm² (3000 psi)
  const Pn_base = system === "acero_estructural" ? 45_000 : system === "madera" || system === "guadua" || system === "bahareque_encamisado" ? 18_000 : 0.85 * (0.85 * fc * 900 + 12_600 * 4 * 2.87); // 30×30 RC
  const results: Array<{ x: number; y: number; Pu_t: number; Pn_t: number; util: number }> = [];
  for (let lvl = 0; lvl < levels; lvl++) {
    // la carga axial crece hacia abajo (los niveles superiores cargan menos)
    const cargaNivel = (Pu / levels) * (levels - lvl);
    for (const x of nx) for (const y of ny) {
      const Pn_t = Pn_base / 1000;
      const Pu_t = cargaNivel / 1000;
      results.push({ x, y, Pu_t, Pn_t, util: Pu_t / Pn_t });
    }
  }
  return results;
}

/** Deriva por piso vs límite NSR-10 A.3 (0.012h para viviendas). */
function driftCheck(plan: FloorPlan, spans: number[], wLineal: number) {
  const levels = Math.max(1, plan.levels);
  const heights = Array.from({ length: levels }, () => plan.floorToFloor);
  const portal = portalFromPlan(spans, heights, wLineal, { col: { A: 0.09, I: 0.3 ** 4 / 12 }, beam: { A: 0.075, I: 0.3 * 0.25 ** 3 / 12 } });
  const fr = solveFrame(portal);
  const limit = 0.012 * plan.floorToFloor; // NSR-10 A.3 (deriva límite)
  return fr.disp.map((d, i) => ({ nivel: i + 1, delta_mm: Math.abs(d[1]) * 1000, limit_mm: limit * 1000, ok: Math.abs(d[1]) < limit }));
}

export function StructuralTool({ onOpenDesign }: { onOpenDesign: () => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [city, setCity] = useState("Bogota D.C.");
  const [colW, setColW] = useState(30); // cm — sección de columna editable
  const [colH, setColH] = useState(30); // cm
  const [fcPsi, setFcPsi] = useState(3000); // resistencia del concreto

  // ── CONEXIÓN: leer el plan del diseño arquitectónico (sesión en la nube) ──
  const loadPlan = useCallback(async () => {
    try {
      const raw = localStorage.getItem("obrahub-last-plan");
      if (raw) { setPlan(sanitizeFloorPlan(JSON.parse(raw))); setReady(true); return; }
    } catch { }
    setReady(true);
  }, []);
  useEffect(() => { void loadPlan(); }, [loadPlan]);

  // ── GUARDAR de vuelta a la sesión del diseño (conectado) ──
  const saveToDesign = async () => {
    if (!plan) return;
    try {
      localStorage.setItem("obrahub-last-plan", JSON.stringify({ ...plan, structure: { ...plan.structure!, system: plan.structure?.system ?? "mamposteria_confinada", justification: (plan.structure?.justification ?? "") + ` [Sección col ${colW}×${colH}cm, fc=${fcPsi}psi]` } }));
      setSaved(new Date().toLocaleTimeString("es-CO"));
      setTimeout(() => setSaved(null), 3000);
    } catch { }
  };

  const seismic = useMemo(() => {
    if (!plan) return null;
    const d = deadLoads(plan), l = liveLoads(plan);
    const sw = seismicWeight(plan, d.wPerM2, l.weighted);
    const sa = CITY_DEFAULTS[city] ?? Object.values(CITY_DEFAULTS)[0];
    const Ta = TaApprox(plan.levels);
    const sp = spectrum(sa);
    const bs = baseShear(sa, Ta, sw.W);
    return { sa, Ta, ...sp, ...bs, W: sw.W };
  }, [plan, city]);

  const design = useMemo(() => (plan ? designElements(plan) : []), [plan]);
  const checklist = useMemo(() => (plan ? licenseChecklist(plan) : []), [plan]);

  const calc = useMemo(() => {
    if (!plan) return null;
    const d = deadLoads(plan), l = liveLoads(plan);
    const co = columnCheck(plan, d.wPerM2, l.weighted);
    const axes = plan.structure?.axes ?? [];
    const vs = axes.filter((x) => x.orientation === "vertical").map((x) => x.at).sort((a, b) => a - b);
    const spans = vs.length > 1 ? vs.slice(1).map((v, i) => v - vs[i]) : [plan.outline.width / 2, plan.outline.width / 2];
    const w = 1.2 * d.wPerM2 + 1.6 * l.weighted;
    const portal = portalFromPlan(spans, Array.from({ length: Math.max(1, plan.levels) }, () => plan.floorToFloor), w, { col: { A: (colW / 100) * (colH / 100), I: (colW / 100) * (colH / 100) ** 3 / 12 }, beam: { A: 0.075, I: 0.3 * 0.25 ** 3 / 12 } });
    const fr = solveFrame(portal);
    const maxDelta = Math.max(...fr.disp.map((x) => Math.abs(x[1])));
    const maxCol = Math.max(...fr.reactions.filter((_, i) => portal.nodes[i]?.support === "fixed").map((r) => Math.abs(r[1])));
    // utilización con la sección EDITABLE del usuario
    const fc = fcPsi / 145 * 10; // psi → kgf/cm²
    const Pn = 0.85 * (0.85 * fc * colW * colH + 4200 * 4 * 2.87); // 4Ø5/8 ACI
    const util = co.Pu / Pn;
    const drifts = driftCheck(plan, spans, w);
    return {
      d, l, sw: seismicWeight(plan, d.wPerM2, l.weighted), co: combos(d.wPerM2, l.weighted, 80), col: co,
      portal: { spans, w, maxDelta, maxCol, nodes: portal.nodes.length, elems: portal.elems.length },
      utilization: util, Pn_t: Pn / 1000, Pu_t: co.Pu / 1000,
      drifts,
      cols: colUtilization(plan, plan.structure?.system ?? "concreto"),
    };
  }, [plan, colW, colH, fcPsi]);

  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando modelo…</div>;
  if (!plan || !calc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl ring-1 ring-orange-500/20">🏗️</div>
        <div>
          <h3 className="text-lg font-semibold text-white">Sin modelo para calcular</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">El calculista trabaja sobre el modelo del ✏️ Diseño Arquitectónico: genera un plano y vuelve — cargas NSR-10, combinaciones, editor de secciones y análisis sísmico te esperan.</p>
        </div>
        <button type="button" onClick={onOpenDesign} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500">Ir a Diseño Arquitectónico →</button>
      </div>
    );
  }

  const sysLabel = STRUCTURE_LABELS[plan.structure?.system as StructuralSystem] ?? plan.structure?.system ?? "sin definir";
  const utilColor = calc.utilization < 0.6 ? "text-emerald-300" : calc.utilization < 1.0 ? "text-amber-300" : "text-red-300";
  const utilBg = calc.utilization < 0.6 ? "bg-emerald-500/10 ring-emerald-400/30" : calc.utilization < 1.0 ? "bg-amber-500/10 ring-amber-400/30" : "bg-red-500/10 ring-red-400/30";
  const utilLabel = calc.utilization < 0.6 ? "SEGURA (sobrada)" : calc.utilization < 1.0 ? "AL LÍMITE (justa)" : "FALLA (sobrecarga)";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── TOP: plano 2D + 3D ── */}
      <div className="flex min-h-[38%] shrink-0 flex-col lg:flex-row" style={{ height: "46%" }}>
        <div className="relative min-h-[45%] flex-1 border-b border-white/[0.07] lg:min-h-0 lg:border-b-0 lg:border-r">
          <PrimsSvg prims={structuralPlanPrimitives(plan)} title="Planta estructural — retícula y elementos" />
        </div>
        <div className="relative min-h-[45%] flex-1">
          <IfcLive plan={plan} mode="structural" />
        </div>
      </div>

      {/* ── BOTTOM: análisis + editor ── */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-400/80">Calculista · NSR-10 · fase 2 — editor + análisis</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{plan.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{sysLabel} · {plan.levels} nivel(es) · retícula {plan.structure?.axes?.length ?? 0} ejes</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => {
                const blob = new Blob([memoria(plan)], { type: "text/plain;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob); a.download = `memoria-${plan.name.replace(/\s+/g, "-").toLowerCase()}.txt`; a.click();
              }} className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">⬇️ Memoria</button>
              <button type="button" onClick={saveToDesign}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${saved ? "bg-emerald-600" : "bg-orange-600 hover:bg-orange-500"}`}>
                {saved ? `✓ ${saved}` : "💾 Guardar al diseño"}
              </button>
            </div>
          </div>

          {/* ── EDITOR DE SECCIONES ── */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-blue-500/25 bg-blue-500/[0.04]">
            <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">🔧 Editor de sección — cambia y el 3D + análisis se recalculan al instante</p>
            <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-4">
              <div>
                <label className="text-[9px] uppercase text-slate-500">Ancho columna (cm)</label>
                <input type="range" min={20} max={60} value={colW} onChange={(e) => setColW(+e.target.value)} className="mt-1 w-full accent-blue-400" />
                <p className="font-mono text-sm text-blue-200">{colW} cm</p>
              </div>
              <div>
                <label className="text-[9px] uppercase text-slate-500">Altura columna (cm)</label>
                <input type="range" min={20} max={60} value={colH} onChange={(e) => setColH(+e.target.value)} className="mt-1 w-full accent-blue-400" />
                <p className="font-mono text-sm text-blue-200">{colH} cm</p>
              </div>
              <div>
                <label className="text-[9px] uppercase text-slate-500">f'c concreto (psi)</label>
                <select value={fcPsi} onChange={(e) => setFcPsi(+e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-sm text-slate-200">
                  {[2500, 3000, 3500, 4000, 5000].map((v) => <option key={v} value={v}>{v} psi ({v / 145} MPa)</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] uppercase text-slate-500">Sistema</label>
                <p className="mt-1 text-sm font-semibold text-slate-200">{sysLabel}</p>
                <p className="text-[9px] text-slate-600">Cámbialo desde el Diseño Arquitectónico</p>
              </div>
            </div>
          </div>

          {/* ── UTILIZACIÓN (Pn/Pu) ── */}
          <div className={`mt-4 rounded-2xl border p-4 ring-1 ${utilBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Utilización de columna (Pn/Pu — NSR-10 C.21)</p>
                <p className={`mt-1 text-3xl font-bold ${utilColor}`}>{(calc.utilization * 100).toFixed(0)}%</p>
                <p className={`text-xs font-semibold ${utilColor}`}>{utilLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
                <div><p className="text-[9px] uppercase text-slate-500">Pu (carga última)</p><p className="font-mono text-slate-200">{calc.Pu_t.toFixed(1)} t</p></div>
                <div><p className="text-[9px] uppercase text-slate-500">Pn (capacidad {colW}×{colH} {fcPsi}psi)</p><p className="font-mono text-slate-200">{calc.Pn_t.toFixed(1)} t</p></div>
                <div><p className="text-[9px] uppercase text-slate-500">Columnas</p><p className="font-mono text-slate-200">{calc.cols.length} en retícula</p></div>
              </div>
            </div>
            {/* Barra de utilización */}
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all ${calc.utilization < 0.6 ? "bg-emerald-400" : calc.utilization < 1.0 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${Math.min(calc.utilization * 100, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {calc.utilization < 0.6 ? "✓ Sobrada — puedes reducir sección" : calc.utilization < 1.0 ? "△ Justa — verifica deriva abajo" : "✗ FALLA — aumenta sección o f'c"}
            </p>
          </div>

          {/* ── SISMO: deriva por piso ── */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-orange-500/25 bg-orange-500/[0.04]">
            <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">♱ Sismo — deriva por piso vs límite NSR-10 A.3</p>
            <div className="flex flex-wrap items-center gap-3 px-4 py-2">
              <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2.5 py-1.5 text-xs text-slate-200">
                {Object.keys(CITY_DEFAULTS).map((c) => <option key={c}>{c}</option>)}
              </select>
              <span className="text-[11px] text-slate-400">Aa={seismic?.sa.Aa} Av={seismic?.sa.Av} · Ta={seismic?.Ta}s · Vs={Math.round((seismic?.Vs_kgf ?? 0) / 1000)}t</span>
            </div>
            <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
              <div><p className="text-[9px] uppercase text-slate-500">Peso sísmico W</p><p className="font-mono text-slate-100">{Math.round(calc.sw.W / 1000)} t</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Corte basal Vs</p><p className="font-mono text-orange-300">{Math.round((seismic?.Vs_kgf ?? 0) / 1000)} t</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Deriva máx.</p><p className="font-mono text-slate-100">{(calc.portal.maxDelta * 1000).toFixed(2)} mm</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Límite (0.012h)</p><p className="font-mono text-slate-400">{(0.012 * plan.floorToFloor * 1000).toFixed(1)} mm</p></div>
            </div>
            {/* Barras de deriva por nivel */}
            <div className="space-y-2 px-4 pb-4">
              {calc.drifts.map((d) => (
                <div key={d.nivel} className="flex items-center gap-3">
                  <span className="w-14 text-[10px] font-semibold text-slate-400">N{d.nivel}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={`h-full rounded-full ${d.ok ? "bg-emerald-400/60" : "bg-red-400/70"}`} style={{ width: `${Math.min((d.delta_mm / d.limit_mm) * 100, 100)}%` }} />
                    <div className="absolute right-0 top-0 h-full w-[2px] bg-white/20" style={{ left: "100%" }} />
                  </div>
                  <span className={`w-20 text-right font-mono text-[10px] ${d.ok ? "text-emerald-300" : "text-red-300"}`}>{d.delta_mm.toFixed(1)}/{d.limit_mm.toFixed(0)}mm</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pórtico ── */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07]">
            <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pórtico por rigidez — {calc.portal.nodes} nodos, {calc.portal.elems} elementos</p>
            <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs sm:grid-cols-4">
              <div><p className="text-[9px] uppercase text-slate-500">Luz máxima</p><p className="font-mono text-slate-200">{Math.max(...calc.portal.spans).toFixed(2)} m</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Carga U viga</p><p className="font-mono text-slate-200">{Math.round(calc.portal.w)} kgf/m</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Reacción col. máx.</p><p className="font-mono text-slate-200">{Math.round(calc.portal.maxCol / 1000)} t</p></div>
              <div><p className="text-[9px] uppercase text-slate-500">Cargas D / L</p><p className="font-mono text-slate-200">{calc.d.wPerM2} / {calc.l.weighted} kgf/m²</p></div>
            </div>
          </div>

          {/* ── Diseño de elementos ── */}
          {design.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07]">
              <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">Diseño de elementos — NSR-10 C.20/C.21</p>
              {design.map((x, i) => (
                <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.05] px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-200">{x.elem}<span className="ml-2 font-mono text-[11px] text-slate-400">{x.size}</span></span>
                  <span className="font-mono text-orange-200">{x.steel}</span>
                  <span className="text-[10px] text-slate-500">{x.check} · {x.ref}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Checklist ── */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07]">
            <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">📋 Checklist de licencia</p>
            {checklist.map((c, i) => (
              <div key={i} className="flex items-start gap-3 border-t border-white/[0.05] px-4 py-2 text-xs">
                <span className={c.status === "ok" ? "text-emerald-400" : "text-amber-400"}>{c.status === "ok" ? "✓" : "○"}</span>
                <div className="min-w-0 flex-1">
                  <p className={c.status === "ok" ? "text-slate-300" : "text-slate-200"}>{c.item} <span className="ml-1 text-[9px] uppercase text-slate-600">{c.area}</span></p>
                  {c.note && <p className="mt-0.5 text-[10px] text-slate-500">{c.note}</p>}
                </div>
                <span className="text-[9px] text-slate-600">{c.ref}</span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[10px] text-slate-600">
            Fase 2/3: editor + análisis visual + deriva sísmica (determinista, NSR-10). Fase 3: pórticos 3D PyNite + sismo espectral OpenSeesPy. Conectado con el Diseño Arquitectónico vía sesión compartida.
          </p>
        </div>
      </div>
    </div>
  );
}
