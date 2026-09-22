/** PASAPORTE 8: REPORTE AMBIENTAL TOTAL (texto plano para descargar/imprimir). */
import type { FloorPlan } from "../design/schema";
import { takeoff } from "./takeoff";
import { valueTakeoff, recommendations } from "./value";
import { wasteLines } from "./waste";
import { deconstructionPlan, healthNotes } from "./deconstruction";
export function buildEnvironmentalReport(plan: FloorPlan): string {
  const v = valueTakeoff(takeoff(plan));
  const w = wasteLines(takeoff(plan));
  const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
  const L: string[] = [];
  L.push("REPORTE AMBIENTAL TOTAL - PASAPORTE DE MATERIALES");
  L.push("=".repeat(64));
  L.push(`Proyecto: ${plan.name} | Niveles: ${plan.levels} | ${new Date().toISOString().slice(0, 10)}`);
  L.push("");
  L.push("1. TAKEOFF DETERMINISTICO");
  v.lines.forEach((l) => L.push(`  - ${l.material}: ${l.qty} ${l.unit} ${l.totalCOP ? "| " + cop(l.totalCOP) + " | " + l.co2eKg + " kg CO2e" : ""}`));
  L.push("");
  L.push("2. TOTALES");
  L.push(`  Valor de obra: ${cop(v.totalCOP)}`);
  L.push(`  Huella embebida: ${(v.co2eTotal / 1000).toFixed(2)} t CO2e`);
  L.push(`  Banco de materiales (fin de vida): ${cop(v.reuseCOP)}`);
  L.push("");
  L.push("3. DESPERDICIO TEORICO POR OFICIO");
  w.forEach((l) => L.push(`  - ${l.material}: ${l.qty} ${l.unit} (${(l.wastePct * 100).toFixed(0)}%)`));
  L.push("");
  L.push("4. RECOMENDACIONES DE CIRCULARIDAD");
  recommendations(v).forEach((r) => L.push("  " + r));
  L.push("");
  L.push("5. MANUAL DE DESMONTE (secuencia inversa)");
  deconstructionPlan(plan).forEach((s) => L.push(`  ${s.order}. [${s.phase}] ${s.action} -- ${s.caution}`));
  L.push("");
  L.push("6. SALUD AMBIENTAL");
  healthNotes().forEach((h) => L.push("  * " + h));
  L.push("");
  L.push("Generado por ObraHub - takeoff deterministico, precios KB versionada, factores EPD genericos LATAM.");
  return L.join("\n");
}
