/**
 * PASAPORTE — Modulo 3: VALOR + IMPACTO. Takeoff x KB = banco de materiales
 * (valor comercial de reutilizacion), huella CO2e y recomendaciones de
 * circularidad rankeadas por ROI. Deterministico.
 */
import type { TakeoffLine } from "./takeoff";
import { PRICES, CO2E, CIRCULARITY } from "./prices";

export type ValueLine = TakeoffLine & {
  match: string;
  unitCostCOP: number;
  totalCOP: number;
  co2eKg: number;
  reuseValueCOP: number;
  recycleValueCOP: number;
};

export function matchKey(material: string): string {
  for (const k of Object.keys(PRICES)) if (material.includes(k)) return k;
  if (/mamposter|muro/i.test(material)) return "Mortero";
  return "";
}

export function valueTakeoff(lines: TakeoffLine[]): { lines: ValueLine[]; totalCOP: number; co2eTotal: number; reuseCOP: number } {
  const out: ValueLine[] = [];
  let totalCOP = 0, co2eTotal = 0, reuseCOP = 0;
  for (const l of lines) {
    const k = matchKey(l.material);
    const p = k ? PRICES[k] : undefined;
    if (!p || p.unit !== l.unit) { out.push({ ...l, match: k || "-", unitCostCOP: 0, totalCOP: 0, co2eKg: 0, reuseValueCOP: 0, recycleValueCOP: 0 }); continue; }
    const total = Math.round(l.qty * p.cop);
    const co2 = l.qty * (CO2E[k] ?? 0);
    const c = CIRCULARITY[k];
    const reuse = c ? Math.round(total * c.reuse * 0.5) : 0; // 50% precio de recuperado
    const recycle = c ? Math.round(total * c.recycle * 0.25) : 0; // 25% precio materia prima secundaria
    totalCOP += total; co2eTotal += co2; reuseCOP += reuse + recycle;
    out.push({ ...l, match: k, unitCostCOP: p.cop, totalCOP: total, co2eKg: Math.round(co2), reuseValueCOP: reuse, recycleValueCOP: recycle });
  }
  return { lines: out, totalCOP, co2eTotal: Math.round(co2eTotal), reuseCOP };
}

/** Recomendaciones rankeadas por valor recuperable (el broche sostenible). */
export function recommendations(v: { lines: ValueLine[]; reuseCOP: number }): string[] {
  const top = [...v.lines].filter((l) => l.reuseValueCOP + l.recycleValueCOP > 0).sort((a, b) => (b.reuseValueCOP + b.recycleValueCOP) - (a.reuseValueCOP + a.recycleValueCOP)).slice(0, 3);
  const recs = top.map((t, i) => {
    const c = CIRCULARITY[t.match];
    return `${i + 1}. ${t.material} (${t.qty} ${t.unit}): ${c.note}. Valor recuperable ~COP ${(t.reuseValueCOP + t.recycleValueCOP).toLocaleString("es-CO")} — diseñar juntas desmontables y separar en obra.`;
  });
  recs.push(`Banco de materiales total estimado: COP ${v.reuseCOP.toLocaleString("es-CO")} al final de la vida útil — registrar en escrituras como valor residual.`);
  return recs;
}
