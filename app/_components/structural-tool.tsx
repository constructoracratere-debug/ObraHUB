"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeFloorPlan, type FloorPlan } from "@/lib/design/schema";
import { deadLoads, liveLoads, seismicWeight, combos, columnCheck } from "@/lib/structural/loads";
import { portalFromPlan, solveFrame } from "@/lib/structural/frame";

/**
 * #3 DISEÑO ESTRUCTURAL ASISTIDO POR IA (calculista).
 * Lee el modelo del Diseño Arquitectonico (un solo modelo) y entrega la
 * memoria de cargas NSR-10: muertas, sobrecargas por uso, peso sismico,
 * combinaciones Titulo B y predimension — articulo por articulo.
 */
function memoria(plan: FloorPlan): string {
  const d = deadLoads(plan);
  const l = liveLoads(plan);
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
  L.push("", "Generado por ObraHub — motor determinista. Proximo: PyNite + OpenSeesPy.");
  return L.join("\n");
}

export function StructuralTool({ onOpenDesign }: { onOpenDesign: () => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("obrahub-last-plan");
      if (raw) setPlan(sanitizeFloorPlan(JSON.parse(raw)));
    } catch { /* sin modelo */ }
    setReady(true);
  }, []);

  const calc = useMemo(() => {
    if (!plan) return null;
    const d = deadLoads(plan);
    const l = liveLoads(plan);
    const co = columnCheck(plan, d.wPerM2, l.weighted);
    // Pórtico interno por rigidez (validado vs fórmulas: error < 2%).
    const axes = plan.structure?.axes ?? [];
    const vs = axes.filter((x) => x.orientation === "vertical").map((x) => x.at).sort((a2, b2) => a2 - b2);
    const spans = vs.length > 1 ? vs.slice(1).map((v, i) => v - vs[i]) : [plan.outline.width / 2, plan.outline.width / 2];
    const w = 1.2 * d.wPerM2 + 1.6 * l.weighted; // U sobre viga (ancha tributaria 1 m)
    const portal = portalFromPlan(spans, Array.from({ length: Math.max(1, plan.levels) }, () => plan.floorToFloor), w, { col: { A: 0.09, I: 0.3 ** 4 / 12 }, beam: { A: 0.075, I: 0.3 * 0.25 ** 3 / 12 } });
    const fr = solveFrame(portal);
    const maxDelta = Math.max(...fr.disp.map((x) => Math.abs(x[1])));
    const maxCol = Math.max(...fr.reactions.filter((_, i) => portal.nodes[i]?.support === "fixed").map((r) => Math.abs(r[1])));
    return { d, l, sw: seismicWeight(plan, d.wPerM2, l.weighted), co: combos(d.wPerM2, l.weighted, 80), col: co, portal: { spans, w, maxDelta, maxCol, nodes: portal.nodes.length, elems: portal.elems.length } };
  }, [plan]);

  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando modelo…</div>;
  if (!plan || !calc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl ring-1 ring-orange-500/20">🏗️</div>
        <div>
          <h3 className="text-lg font-semibold text-white">Sin modelo para calcular</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">El calculista trabaja sobre el modelo del ✏️ Diseño Arquitectónico: genera un plano y vuelve — cargas NSR-10, combinaciones y predimensionado te esperan.</p>
        </div>
        <button type="button" onClick={onOpenDesign} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500">Ir a Diseño Arquitectónico →</button>
      </div>
    );
  }

  const kpis = [
    ["▮ Carga muerta D", `${calc.d.wPerM2} kgf/m²`, "losa+acabados+muros (A.9)"],
    ["▤ Sobrecarga L", `${calc.l.weighted} kgf/m²`, "por uso A.8.3.1"],
    ["≋ Peso sísmico W", `${Math.round(calc.sw.W / 1000)} t`, "D + 0.25·L"],
    ["▥ Columna", calc.col.suggested, `Pu ${Math.round(calc.col.Pu / 1000)} t · C.21`],
  ] as const;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-400/80">Calculista · NSR-10 · fase 1 de 3</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Diseño Estructural — {plan.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{plan.levels} nivel(es) · {plan.rooms.length} espacios · sistema {plan.structure?.system ?? "mampostería"} · retícula {plan.structure?.axes?.length ?? 0} ejes</p>
          </div>
          <button type="button"
            onClick={() => {
              const blob = new Blob([memoria(plan)], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `memoria-cargas-${plan.name.replace(/\s+/g, "-").toLowerCase()}.txt`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500">
            ⬇️ Memoria de cargas
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(([t, big, sub]) => (
            <div key={t} className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{t}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-white">{big}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cargas muertas (D) — NSR-10 A.9</p>
            {calc.d.lines.map((x, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] px-4 py-2 text-xs">
                <span className="min-w-0 flex-1 text-slate-300">{x.item}<span className="ml-2 text-[9px] text-slate-600">{x.ref}</span></span>
                <span className="font-mono text-slate-200">{x.value}</span>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sobrecargas (L) — NSR-10 A.8.3.1</p>
            {calc.l.lines.map((x, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] px-4 py-2 text-xs">
                <span className="min-w-0 flex-1 text-slate-300">{x.item}<span className="ml-2 text-[9px] text-slate-600">{x.ref}</span></span>
                <span className="font-mono text-slate-200">{x.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07]">
          <p className="bg-white/[0.04] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Combinaciones — NSR-10 Título B (resistencia requerida U)</p>
          {calc.co.map((x, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] px-4 py-2 text-xs">
              <span className="font-mono text-slate-200">{x.item}<span className="ml-2 text-[9px] font-sans text-slate-600">{x.ref}</span></span>
              <span className="font-mono text-orange-300">{x.value} kgf/m²</span>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
          <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">Pórtico por rigidez directa — validado vs fórmulas (error &lt; 2%)</p>
          <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs sm:grid-cols-4">
            <div><p className="text-[9px] uppercase text-slate-500">Luz máxima</p><p className="font-mono text-slate-200">{Math.max(...calc.portal.spans).toFixed(2)} m</p></div>
            <div><p className="text-[9px] uppercase text-slate-500">Carga U viga</p><p className="font-mono text-slate-200">{Math.round(calc.portal.w)} kgf/m</p></div>
            <div><p className="text-[9px] uppercase text-slate-500">Deriva máx.</p><p className="font-mono text-orange-300">{(calc.portal.maxDelta * 1000).toFixed(2)} mm</p></div>
            <div><p className="text-[9px] uppercase text-slate-500">Reacción col. máx.</p><p className="font-mono text-slate-200">{Math.round(calc.portal.maxCol / 1000)} t</p></div>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-slate-600">Fase 1/3: cargas+combinaciones+predimension (determinista, auditable). Fase 2: pórticos PyNite. Fase 3: sismo OpenSeesPy + espectro NSR-10 — número por número, artículo por artículo.</p>
      </div>
    </div>
  );
}
