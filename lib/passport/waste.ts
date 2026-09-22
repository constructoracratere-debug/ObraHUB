/** PASAPORTE 6: DESPERDICIO teorico por oficio (Ching/Plazola %waste). */
import type { TakeoffLine } from "./takeoff";
const WASTE: Record<string, number> = { mamposteria: 0.05, estructura: 0.03, carpinteria: 0.08, acabados: 0.07, cubiertas: 0.06 };
export function wasteLines(lines: TakeoffLine[]): Array<TakeoffLine & { wastePct: number }> {
  return lines.map((l) => ({ ...l, wastePct: WASTE[l.category] ?? 0.05, qty: Math.round(l.qty * ((WASTE[l.category] ?? 0.05))) * 100 / 100, detail: `Desperdicio ${((WASTE[l.category] ?? 0.05) * 100).toFixed(0)}% de ${l.material}` }));
}
