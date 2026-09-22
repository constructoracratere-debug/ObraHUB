"use client";

import { useEffect, useState } from "react";
import { sanitizeFloorPlan, type FloorPlan } from "@/lib/design/schema";
import { takeoff } from "@/lib/passport/takeoff";
import { valueTakeoff, recommendations } from "@/lib/passport/value";
import { buildEnvironmentalReport } from "@/lib/passport/report";

/**
 * PASAPORTE DE MATERIALES — herramienta propia de pantalla completa (como
 * Gantt/Costos). Lee el ultimo plano generado en Diseno IA y entrega el
 * modulo ambiental: KPIs, takeoff, CO2e, banco de materiales, circularidad
 * y reporte descargable.
 */
export function PassportTool({ onOpenDesign }: { onOpenDesign: () => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("obrahub-last-plan");
      if (raw) setPlan(sanitizeFloorPlan(JSON.parse(raw)));
    } catch { /* sin plano */ }
    setReady(true);
  }, []);

  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando pasaporte…</div>;

  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl ring-1 ring-emerald-500/20">🌱</div>
        <div>
          <h3 className="text-lg font-semibold text-white">Aún no hay plano para analizar</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">El pasaporte se construye desde el último plano generado en ✏️ Diseño IA: takeoff ladrillo a ladrillo, CO₂e, banco de materiales y manual de desmonte.</p>
        </div>
        <button type="button" onClick={onOpenDesign} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">Ir a Diseño IA →</button>
      </div>
    );
  }

  const v = valueTakeoff(takeoff(plan));
  const recs = recommendations(v);
  const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
  const kpis = [
    ["💰 Valor de obra", cop(v.totalCOP), "precios scraped · KB versionada"],
    ["⚱ Huella embebida", (v.co2eTotal / 1000).toFixed(1) + " t CO₂e", "factores EPD LATAM"],
    ["🏦 Banco de materiales", cop(v.reuseCOP), "valor recuperable a fin de vida"],
    ["♻️ Ratio circular", ((v.reuseCOP / Math.max(v.totalCOP, 1)) * 100).toFixed(0) + "%", "del valor retornado como material"],
  ] as const;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Material Passport · BAMB · NSR-10 E.3</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Pasaporte de materiales — {plan.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{plan.levels} nivel(es) · {plan.rooms.length} espacios · sistema {plan.structure?.system ?? "mampostería"}</p>
          </div>
          <button type="button"
            onClick={() => {
              const blob = new Blob([buildEnvironmentalReport(plan)], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `reporte-ambiental-${plan.name.replace(/\s+/g, "-").toLowerCase()}.txt`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
            ⬇️ Reporte ambiental total
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

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07]">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Material</th><th className="px-2 py-2.5">Cantidad</th><th className="px-2 py-2.5">Valor</th><th className="px-2 py-2.5">CO₂e</th><th className="px-4 py-2.5">Recuperable</th></tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i} className="border-t border-white/[0.05] text-slate-300 transition hover:bg-white/[0.02]" title={l.detail}>
                  <td className="px-4 py-2">{l.material}<span className="ml-2 text-[9px] uppercase text-slate-600">{l.category}</span></td>
                  <td className="px-2 py-2 font-mono text-slate-400">{l.qty} {l.unit}</td>
                  <td className="px-2 py-2 font-mono">{l.totalCOP ? cop(l.totalCOP) : "—"}</td>
                  <td className="px-2 py-2 font-mono text-slate-400">{l.co2eKg ? l.co2eKg.toLocaleString("es-CO") + " kg" : "—"}</td>
                  <td className="px-4 py-2 font-mono text-emerald-300/80">{l.reuseValueCOP + l.recycleValueCOP ? cop(l.reuseValueCOP + l.recycleValueCOP) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">🧰 Recomendaciones de circularidad (por valor recuperable)</p>
          <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-slate-300">{recs.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <p className="mt-4 text-[10px] text-slate-600">Takeoff determinístico · precios KB versionada (scraper Homecenter/SIC con guard anti-outlier) · factores EPD genéricos LATAM — para licencia, EPD específicos del fabricante.</p>
      </div>
    </div>
  );
}
