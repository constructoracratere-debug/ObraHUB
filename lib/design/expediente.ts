/**
 * ✏️ Diseño IA — Expediente para LICENCIA DE CONSTRUCCIÓN.
 *
 * Ensambla el paquete técnico que exige una curaduría urbana (Colombia,
 * Ley 388/1997 · Decreto 1077/2015) a partir del estudio multi-agente:
 * memoria de diseño, cuadro de áreas, memorias técnicas, registro de
 * revisiones y checklist de documentos que aporta el solicitante.
 *
 * Determinista: mismo estado del estudio → mismo documento.
 */

import {
  type FloorPlan,
  type RevisionLog,
  roomArea,
  totalArea,
  STRUCTURE_LABELS,
} from "./schema";
import type { Gate } from "./validate";

type ConstructorMemo = {
  materials?: Array<{ element: string; suggestion: string; reason: string }>;
  methods?: Array<{ stage: string; suggestion: string; reason: string }>;
  logisticsNotes?: string;
};

type CivilMemo = {
  system?: string;
  justification?: string;
  axes?: Array<{ id: string; orientation: string; at: number }>;
  spanWarnings?: string[];
  foundation?: string;
  notesForArchitect?: string[];
};

const LINE = "═".repeat(72);
const THIN = "─".repeat(72);

export function buildLicenseExpediente(input: {
  plan: FloorPlan;
  constructorMemo?: ConstructorMemo | null;
  civilMemo?: CivilMemo | null;
  gates?: Gate[] | null;
  revisions?: RevisionLog[];
}): string {
  const { plan, constructorMemo, civilMemo, gates, revisions = [] } = input;
  const out: string[] = [];

  const h = (t: string) => out.push("", LINE, t, LINE);
  const p = (t = "") => out.push(t);

  // ── Carátula ───────────────────────────────────────────────────────────────
  h(`EXPEDIENTE TÉCNICO — ${plan.name.toUpperCase()}`);
  p(`Generado por ObraHub · Diseño IA (${new Date().toISOString().slice(0, 10)})`);
  p(`Destino: trámite de LICENCIA DE CONSTRUCCIÓN (curaduría urbana)`);
  p(`Ubicación: ${plan.site ? `${plan.site.city}${plan.site.department ? ", " + plan.site.department : ""}` : "no indicada"}`);
  p(`Niveles: ${plan.levels} · Altura piso a piso: ${plan.floorToFloor.toFixed(2)} m · Área total interior: ${totalArea(plan).toFixed(2)} m²`);
  p("");
  p("⚠️ DOCUMENTO DE APOYO GENERADO CON IA: debe ser revisado, completado y");
  p("   FIRMADO por los profesionales responsables (arquitecto, ingeniero civil,");
  p("   especialistas) con matrícula vigente antes de radicar ante curaduría.");

  // ── 1. Memoria de diseño ──────────────────────────────────────────────────
  const r = plan.designReport;
  h("1. MEMORIA DE DISEÑO ARQUITECTÓNICO");
  if (r) {
    if (r.orientation) { p("ORIENTACIÓN Y ASOLEAMIENTO:"); p(`  ${r.orientation}`); p(""); }
    if (r.wind) { p("VENTILACIÓN (vientos del sitio):"); p(`  ${r.wind}`); p(""); }
    if (r.lighting) { p("ILUMINACIÓN NATURAL:"); p(`  ${r.lighting}`); p(""); }
    if (r.zoning) { p("ZONIFICACIÓN:"); p(`  ${r.zoning}`); p(""); }
    if (r.dimensioning) { p("CRITERIO DIMENSIONAL:"); p(`  ${r.dimensioning}`); p(""); }
    if (r.potCompliance) { p("ATENCIÓN DEL POT / FICHA DE SITIO:"); p(`  ${r.potCompliance}`); p(""); }
    if (r.decisions.length > 0) {
      p("DECISIONES DE DISEÑO:");
      for (const d of r.decisions) {
        p(`  • ${d.issue}`);
        p(`    → ${d.decision}`);
        p(`    Razón: ${d.reason}`);
      }
    }
  } else {
    p("  (El arquitecto no emitió memoria en esta versión — regenera el diseño.)");
  }

  // ── 2. Cuadro de áreas ────────────────────────────────────────────────────
  h("2. CUADRO DE ÁREAS (interiores netas)");
  const total = totalArea(plan);
  p(`${"ESPACIO".padEnd(28)}${"NIVEL".padEnd(7)}${"ÁREA m²".padStart(9)}${"%".padStart(7)}`);
  p(THIN);
  for (const room of plan.rooms) {
    const a = roomArea(room);
    p(`${room.name.slice(0, 27).padEnd(28)}${String(room.level + 1).padEnd(7)}${a.toFixed(2).padStart(9)}${((a / total) * 100).toFixed(1).padStart(6)}%`);
  }
  p(THIN);
  p(`${"TOTAL CONSTRUIDO (interior)".padEnd(28)}${"".padEnd(7)}${total.toFixed(2).padStart(9)}${"100.0%".padStart(7)}`);
  p(`Envolvente por nivel: ${plan.outline.width.toFixed(2)} × ${plan.outline.depth.toFixed(2)} m`);

  // ── 3. Memoria estructural ────────────────────────────────────────────────
  h("3. MEMORIA ESTRUCTURAL (NSR-10)");
  if (civilMemo || plan.structure) {
    const sys = plan.structure?.system;
    p(`SISTEMA: ${sys ? STRUCTURE_LABELS[sys] : civilMemo?.system ?? "por definir"}`);
    p(`CIMIENTOS (sugerencia): ${civilMemo?.foundation ?? "por definir según estudio de suelos"}`);
    p(`JUSTIFICACIÓN: ${plan.structure?.justification ?? civilMemo?.justification ?? ""}`);
    if (civilMemo?.spanWarnings?.length) {
      p("ADVERTENCIAS DE LUZ:");
      for (const w of civilMemo.spanWarnings) p(`  ⚠ ${w}`);
    }
    if (plan.structure?.axes?.length) {
      p(`RETÍCULA (${plan.structure.axes.length} ejes): ` + plan.structure.axes.map((a) => `${a.id}@${a.at.toFixed(2)}m`).join(" · "));
    }
    p("");
    p("NOTA: la memoria de cálculo estructural definitiva debe ser elaborada y");
    p("firmada por ingeniero civil con revisión independiente cuando aplique.");
  } else {
    p("  (Falta la etapa de expertos — memos del ingeniero civil.)");
  }

  // ── 4. Instalaciones ──────────────────────────────────────────────────────
  h("4. INSTALACIONES ELÉCTRICAS E HIDROSANITARIAS");
  p(`ELÉCTRICO (${plan.electrical?.points.length ?? 0} puntos · RETIE/NTC 2050):`);
  p(`  ${plan.electrical?.notes ?? "ejecutar etapa de instalaciones"}`);
  p(`HIDROSANITARIO (${plan.hydro?.points.length ?? 0} puntos · RAS):`);
  p(`  ${plan.hydro?.notes ?? "ejecutar etapa de instalaciones"}`);

  // ── 5. Materiales y método ────────────────────────────────────────────────
  h("5. MATERIALES Y MÉTODO CONSTRUCTIVO");
  if (constructorMemo?.materials?.length) {
    p("MATERIALES:");
    for (const m of constructorMemo.materials.slice(0, 10)) {
      p(`  • ${m.element}: ${m.suggestion} — ${m.reason}`);
    }
  }
  if (constructorMemo?.methods?.length) {
    p("MÉTODO:");
    for (const m of constructorMemo.methods.slice(0, 6)) {
      p(`  • ${m.stage}: ${m.suggestion}`);
    }
  }
  if (plan.finishes?.length) {
    p("ACABADOS:");
    for (const f of plan.finishes) p(`  • ${f.room}: ${f.floor} · ${f.walls} · ${f.ceiling}`);
  }

  // ── 6. Verificaciones ─────────────────────────────────────────────────────
  h("6. PUERTAS DE VERIFICACIÓN INTERNA");
  if (gates?.length) {
    for (const g of gates) {
      const fails = g.checks.filter((c) => !c.pass);
      p(`${g.title}: ${fails.length === 0 ? "✅ TODO OK" : `⚠ ${fails.length} pendiente(s)`}`);
      for (const c of fails) p(`  ✗ ${c.label}: ${c.detail}${c.ref ? ` (${c.ref})` : ""}`);
    }
  } else {
    p("  (sin gates registradas)");
  }

  // ── 7. Revisiones del profesional ─────────────────────────────────────────
  h("7. REGISTRO DE REVISIONES DEL PROFESIONAL");
  if (revisions.length === 0) {
    p("  (sin revisiones solicitadas)");
  } else {
    revisions.forEach((rev, i) => {
      p(`R${i + 1} · ${rev.at.slice(0, 16).replace("T", " ")}`);
      p(`  Feedback: ${rev.feedback}`);
      for (const c of rev.changes) p(`  ✏️ ${c.change} — ${c.why}`);
      p("");
    });
  }

  // ── 8. Checklist curaduría ────────────────────────────────────────────────
  h("8. CHECKLIST DE RADICACIÓN ANTE CURADURÍA");
  p("GENERADO POR OBRAHUB (adjuntar):");
  p("  [x] Planos arquitectónicos (planta DXF por capas — cortes/fachadas en desarrollo)");
  p("  [x] Memoria de diseño arquitectónico (sección 1)");
  p("  [x] Cuadro de áreas (sección 2)");
  p("  [x] Memoria estructural preliminar NSR-10 (sección 3 — requiere firma y cálculo definitivo)");
  p("  [x] Memorias de instalaciones (sección 4 — requieren diseño definitivo firmado)");
  p("  [x] Especificación de materiales y acabados (sección 5)");
  p("");
  p("DEBE APORTAR EL SOLICITANTE:");
  p("  [ ] Formulario Único Nacional (F.U.N.) — ventanilla única");
  p("  [ ] Certificado de tradición y libertad (expedición ≤ 30 días)");
  p("  [ ] Documento de identidad del solicitante (+ poder si aplica)");
  p("  [ ] Estudio geotécnico de suelos (ing. geotecnista, firma y matrícula)");
  p("  [ ] Diseños definitivos FIRMADOS (estructural, eléctrico RETIE, hidrosanitario, gas)");
  p("  [ ] Aislamientos/retiros y normas urbanísticas del POT verificadas para el predio");
  p("  [ ] Certificado de ausencia de obligaciones (según curaduría)");
  p("  [ ] Pago de expensas y publicidad del proyecto");
  p("");
  p(THIN);
  p("Generado por ObraHub · Estudio de Diseño Multi-Agente — apoyo conceptual;");
  p("no sustituye el juicio ni la responsabilidad de los profesionales matriculados.");

  return out.join("\n");
}
