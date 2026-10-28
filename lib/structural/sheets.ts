/**
 * PAQUETE ESTRUCTURAL (S-00…S-05) — lo que curaduría y revisión exigen a
 * unos planos estructurales, derivado 100% determinista de plan.structure
 * (retícula del ingeniero) + materiales/loads (NSR-10):
 *
 *   S-00 MEMORIA GRÁFICA — sistema, cargas D/L, combinaciones Título B,
 *        peso sísmico, materiales y criterios.
 *   S-01 CIMENTACIÓN — zapatas aisladas + vigas corrida + retícula.
 *   S-02 PLANTA ESTRUCTURAL por nivel — columnas, vigas y placa.
 *   S-03 CORTES DE ESTRUCTURA — corte completo por la escalera.
 *   S-04 DETALLES — columna, viga, unión viga-columna y zapata.
 *   S-05 DESPIECES — cuadros de vigas, columnas y zapatas.
 *
 * ESQUEMAS deterministas con secciones de materials.ts CONCRETE — la
 * numeración DEFINITIVA de refuerzo la diseña y firma el ingeniero
 * matriculado (aviso en cada lámina).
 */
import type { FloorPlan } from "../design/schema";
import type { Prim } from "../design/views";
import { deadLoads, liveLoads, seismicWeight, combos, columnCheck } from "./loads";
import { CONCRETE } from "../design/materials";
import { STRUCTURE_LABELS } from "../design/schema";

/** Ejes (vertical/horizontal) con fallback de retícula razonable. */
export function axesOf(plan: FloorPlan): { vX: number[]; hY: number[]; labelsX: string[]; labelsY: string[] } {
  const { width: W, depth: D } = plan.outline;
  const as = plan.structure?.axes ?? [];
  const vs = as.filter((a) => a.orientation === "vertical").map((a) => a.at).sort((a, b) => a - b);
  const hs = as.filter((a) => a.orientation === "horizontal").map((a) => a.at).sort((a, b) => a - b);
  const vX = vs.length ? vs : [W * 0.33, W * 0.66];
  const hY = hs.length ? hs : [D * 0.5];
  return {
    vX, hY,
    labelsX: vX.map((_, i) => String.fromCharCode(65 + i)),
    labelsY: hY.map((_, i) => String(i + 1)),
  };
}

/** Retícula dash-dot con burbujas (mismo lenguaje del calculista). */
function reticula(plan: FloorPlan, out: Prim[]): void {
  const { width: W, depth: D } = plan.outline;
  const { vX, hY, labelsX, labelsY } = axesOf(plan);
  const bubble = (x: number, y: number, id: string) => {
    out.push({ t: "C", l: "EJES", x, y, r: 0.3 });
    out.push({ t: "T", l: "EJES", x: x - 0.1, y: y + 0.1, h: 0.22, s: id });
  };
  vX.forEach((x, i) => {
    out.push({ t: "L", l: "EJES", x1: x, y1: -1.4, x2: x, y2: D + 1.4, dash: true, thin: true });
    bubble(x, D + 1.75, labelsX[i]);
  });
  hY.forEach((y, i) => {
    out.push({ t: "L", l: "EJES", x1: -1.4, y1: y, x2: W + 1.4, y2: y, dash: true, thin: true });
    bubble(-1.75, y, labelsY[i]);
  });
}

/** Tabla de texto simple con filas rayadas (compartida por todas las S). */
function tabla(
  out: Prim[], x: number, y: number, title: string, headers: string[],
  rows: string[][], cw: number[], rh = 0.34,
): void {
  const totalW = cw.reduce((a, b) => a + b, 0);
  let yy = y;
  out.push({ t: "T", l: "TEXTOS", x, y: yy, h: 0.2, s: title });
  yy -= 0.34;
  out.push({ t: "L", l: "TEXTOS", x1: x, y1: yy, x2: x + totalW, y2: yy });
  let cx = x;
  headers.forEach((h2, i) => {
    out.push({ t: "T", l: "TEXTOS", x: cx, y: yy - 0.2, h: 0.12, s: h2.slice(0, Math.floor(cw[i] / 0.085)) });
    cx += cw[i];
  });
  yy -= 0.3;
  out.push({ t: "L", l: "TEXTOS", x1: x, y1: yy, x2: x + totalW, y2: yy });
  for (const r of rows) {
    cx = x;
    r.forEach((cell, i) => {
      out.push({ t: "T", l: "TEXTOS", x: cx, y: yy - 0.19, h: 0.12, s: cell.slice(0, Math.floor(cw[i] / 0.08)) });
      cx += cw[i];
    });
    yy -= rh;
    out.push({ t: "L", l: "TEXTOS", x1: x, y1: yy, x2: x + totalW, y2: yy, thin: true });
  }
}

/** S-00 — MEMORIA GRÁFICA: la hoja que abre el paquete estructural. Dos
 *  columnas de contenido real (el QA de plot exige lámina llena ≥40%). */
export function memoriaPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const dl = deadLoads(plan);
  const ll = liveLoads(plan);
  const sw = seismicWeight(plan, dl.wPerM2, ll.weighted);
  const cc = columnCheck(plan, dl.wPerM2, ll.weighted);
  const Ey = Math.max(0.13 * dl.wPerM2, 30);
  const cb = combos(dl.wPerM2, ll.weighted, Ey);
  const sys = plan.structure?.system ?? "concreto";
  // Encabezado.
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 0, h: 0.3, s: "MEMORIA GRÁFICA ESTRUCTURAL — NSR-10" });
  const sysLabel = STRUCTURE_LABELS[sys as keyof typeof STRUCTURE_LABELS] ?? sys;
  out.push({ t: "T", l: "TEXTOS", x: 0, y: -0.45, h: 0.17, s: `SISTEMA: ${sysLabel.toUpperCase()} · ${plan.levels} NIVEL(ES) · PISO A PISO ${plan.floorToFloor.toFixed(2)} m · ${plan.outline.width.toFixed(1)}×${plan.outline.depth.toFixed(1)} m` });

  // ── COLUMNA IZQUIERDA (x=0, ancho 4.6): justificación + cargas + criterios.
  let y = -1.0;
  out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.18, s: "1 · JUSTIFICACIÓN (ING. CIVIL)" });
  y -= 0.32;
  const just = plan.structure?.justification ?? "Criterio del ingeniero civil según NSR-10.";
  const words = just.split(/\s+/);
  const jl: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 50) { jl.push(cur.trim()); cur = w; } else cur += " " + w;
  }
  if (cur.trim()) jl.push(cur.trim());
  for (const ln of jl.slice(0, 8)) {
    out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.12, s: ln.slice(0, 54) });
    y -= 0.27;
  }
  y -= 0.1;
  tabla(out, 0, y, "2 · CARGAS Y COMBINACIONES (TÍT. A/B)",
    ["COMB.", "VALOR", "REF."],
    cb.map((c) => [c.item, `${c.value}`, c.ref.replace("NSR-10 ", "")]),
    [1.7, 1.35, 1.55]);
  y -= 0.34 + 0.3 + cb.length * 0.34 + 0.45;
  tabla(out, 0, y, "3 · PESO SÍSMICO Y PREDIMENSIÓN",
    ["PARÁMETRO", "VALOR"],
    [
      ["D (muerta)", `${dl.wPerM2} kgf/m2`],
      ["L (viva pond.)", `${ll.weighted} kgf/m2`],
      ["W sísmico", `${Math.round(sw.W).toLocaleString("es-CO")} kgf`],
      ["Columna típica", `${cc.suggested}`],
      ["Pu estimado", `${Math.round(cc.Pu / 1000)} t`],
    ],
    [2.1, 2.4]);
  y -= 0.34 + 0.3 + 5 * 0.34 + 0.45;
  out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.18, s: "4 · CRITERIOS DE DISEÑO" });
  y -= 0.3;
  for (const c of [
    "Deriva límite 0.010h (NSR-10 A.3) · diafragma rígido",
    "Pórticos/mampostería confinada C.21 · min 1% Acero",
    "Recubrimiento 5 cm exteriores (durabilidad A.4)",
    "Confinamiento en nudas: estribos @ 0.10",
    "Estudio de suelos (CTL) obligatorio antes de cimentar",
    "Diafragma rígido: placa armada en dos sentidos",
    "Vivienda D.1/D.2 — grupo de uso I (NSR-10 A.2)",
  ]) {
    out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.12, s: `· ${c}`.slice(0, 54) });
    y -= 0.29;
  }

  // ── COLUMNA DERECHA (x=5.2, ancho 4.6): materiales + alcance + especifica.
  let y2 = -1.0;
  tabla(out, 5.2, y2, "5 · MATERIALES Y SECCIONES",
    ["ELEMENTO", "SECCIÓN"],
    [
      ["Columna", `${CONCRETE.column.w.toFixed(2)}×${CONCRETE.column.d.toFixed(2)} m`],
      ["Viga", `${CONCRETE.beam.w.toFixed(2)}×${CONCRETE.beam.d.toFixed(2)} m`],
      ["Placa maciza", `e = ${CONCRETE.slab.thickness.toFixed(2)} m`],
      ["Zapata aislada", `${CONCRETE.footing.pad.toFixed(2)}×${CONCRETE.footing.thickness.toFixed(2)} m`],
      ["Viga corrida", `0.20×0.25 m`],
    ],
    [1.9, 2.5]);
  y2 -= 0.34 + 0.3 + 5 * 0.34 + 0.45;
  out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2, h: 0.18, s: "6 · ALCANCE DEL PAQUETE S" });
  y2 -= 0.3;
  for (const c of [
    "S-01 Planta de cimentación — zapatas y corridas",
    "S-02 Planta estructural por nivel — C y vigas",
    "S-03 Corte de estructura completa",
    "S-04 Detalles de columna, viga, nuda y zapata",
    "S-05 Despieces de vigas, columnas y zapatas",
  ]) {
    out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2, h: 0.12, s: c.slice(0, 52) });
    y2 -= 0.29;
  }
  y2 -= 0.14;
  out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2, h: 0.18, s: "7 · ESPECIFICACIONES" });
  y2 -= 0.3;
  for (const c of [
    `Concreto ${CONCRETE.concretePSI} (f'c 21 MPa) a 28 días`,
    "Acero de refuerzo fy = 60000 psi (NTC 2289)",
    "Recubrimiento 5 cm cimentación · 4 cm interior",
    "Curado mínimo 7 días — resistividad y asentamiento",
    "Tolerancia vertical de columna: 1/500 de luz",
    "Recepción de acero por interventor antes de vaciado",
    "Esclerometría cada 50 m3 de concreto vaciado",
  ]) {
    out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2, h: 0.12, s: `· ${c}`.slice(0, 52) });
    y2 -= 0.29;
  }
  y2 -= 0.1;
  out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2, h: 0.13, s: "ESQUEMA DETERMINISTA — la numeración definitiva de" });
  out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2 - 0.24, h: 0.13, s: "refuerzo la diseña y FIRMA el ingeniero matriculado." });
  // Honestidad de alcance: los detalles S-04/S-05 están calibrados para
  // mampostería confinada. Otro sistema se DECLARA y su paquete propio
  // llega con su skill (timberframe/guadua, VIS C/F).
  if (sys !== "mamposteria_confinada" && sys !== "concreto") {
    out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2 - 0.52, h: 0.12, s: `NOTA: detalles S-04/S-05 esquemáticos de confinada — el` });
    out.push({ t: "T", l: "TEXTOS", x: 5.2, y: y2 - 0.76, h: 0.12, s: "despiece propio de este sistema llega en su skill." });
  }
  return out;
}

/** S-01 — PLANTA DE CIMENTACIÓN: zapatas + vigas corrida + retícula. */
export function cimentacionPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const { vX, hY } = axesOf(plan);
  reticula(plan, out);
  // Vigas de cimentación corrida entre ejes (doble línea).
  const vb = 0.2;
  for (const y of hY) for (let i = 0; i < vX.length - 1; i++) {
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: vX[i], y1: y - vb / 2, x2: vX[i + 1], y2: y - vb / 2 });
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: vX[i], y1: y + vb / 2, x2: vX[i + 1], y2: y + vb / 2 });
  }
  for (const x of vX) for (let i = 0; i < hY.length - 1; i++) {
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: x - vb / 2, y1: hY[i], x2: x - vb / 2, y2: hY[i + 1] });
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: x + vb / 2, y1: hY[i], x2: x + vb / 2, y2: hY[i + 1] });
  }
  // Zapatas aisladas bajo cada cruce (discontinuas — van bajo placa).
  let nz = 0;
  for (const x of vX) for (const y of hY) {
    nz++;
    out.push({ t: "H", l: "ESTRUCTURA-CIMENTACION", x: x - 0.55, y: y - 0.55, w: 1.1, h: 1.1 });
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: x - 0.55, y1: y - 0.55, x2: x + 0.55, y2: y + 0.55, dash: true, thin: true });
    out.push({ t: "L", l: "ESTRUCTURA-CIMENTACION", x1: x + 0.55, y1: y - 0.55, x2: x - 0.55, y2: y + 0.55, dash: true, thin: true });
    out.push({ t: "T", l: "TEXTOS", x: x - 0.18, y: y + 0.62, h: 0.14, s: `Z-${nz}` });
  }
  // Cotas entre ejes (cadena inferior) + silueta de referencia.
  out.push({ t: "H", l: "ESTRUCTURA-LOSAS", x: 0, y: 0, w: W, h: D, });
  const xsChain = [0, ...vX, W];
  out.push({ t: "L", l: "COTAS", x1: 0, y1: -0.7, x2: W, y2: -0.7 });
  for (const x of xsChain) {
    out.push({ t: "L", l: "COTAS", x1: x - 0.07, y1: -0.77, x2: x + 0.07, y2: -0.63 });
  }
  for (let i = 0; i < xsChain.length - 1; i++) {
    const seg = xsChain[i + 1] - xsChain[i];
    if (seg > 0.3) out.push({ t: "T", l: "COTAS", x: (xsChain[i] + xsChain[i + 1]) / 2 - 0.16, y: -0.98, h: 0.16, s: seg.toFixed(2) });
  }
  // Notas del calculista a la derecha.
  const dl = deadLoads(plan);
  const cc = columnCheck(plan, dl.wPerM2, liveLoads(plan).weighted);
  const notes = [
    "NOTAS DE CIMENTACIÓN",
    `Zapatas aisladas ${CONCRETE.footing.pad.toFixed(2)}×${CONCRETE.footing.pad.toFixed(2)}×${CONCRETE.footing.thickness.toFixed(2)} m (${nz} u.)`,
    `Columna arranque ${cc.suggested} · Concreto ${CONCRETE.concretePSI}`,
    "Viga corrida 0.20×0.25 bajo muros portantes",
    "Descargar en suelo firme — verificar estudio de suelos (CTL)",
  ];
  notes.forEach((n, i) => out.push({ t: "T", l: "TEXTOS", x: W + 1.2, y: D - i * 0.4, h: i === 0 ? 0.2 : 0.15, s: n.slice(0, 46) }));
  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 2.4, h: 0.26, s: "PLANTA DE CIMENTACIÓN — ZAPATAS AISLADAS" });
  return out;
}

/** S-02 — PLANTA ESTRUCTURAL por nivel: columnas + vigas + placa. */
export function plantaEstructuralPrimitives(plan: FloorPlan, level = 0): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const { vX, hY } = axesOf(plan);
  reticula(plan, out);
  // Placa (silueta de losa del nivel).
  out.push({ t: "H", l: "ESTRUCTURA-LOSAS", x: 0, y: 0, w: W, h: D });
  // Columnas macizas en cruces.
  const col = CONCRETE.column.w;
  let nc = 0;
  for (const x of vX) for (const y of hY) {
    nc++;
    out.push({ t: "F", l: "ESTRUCTURA-COLUMNAS", x: x - col / 2, y: y - col / 2, w: col, h: col });
    out.push({ t: "T", l: "TEXTOS", x: x - 0.14, y: y + 0.22, h: 0.12, s: `C-${nc}` });
  }
  // Vigas en doble línea entre ejes.
  const vb = CONCRETE.beam.d;
  for (const y of hY) for (let i = 0; i < vX.length - 1; i++) {
    out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: vX[i], y1: y - vb / 2, x2: vX[i + 1], y2: y - vb / 2 });
    out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: vX[i], y1: y + vb / 2, x2: vX[i + 1], y2: y + vb / 2 });
  }
  for (const x of vX) for (let i = 0; i < hY.length - 1; i++) {
    out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: x - vb / 2, y1: hY[i], x2: x - vb / 2, y2: hY[i + 1] });
    out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: x + vb / 2, y1: hY[i], x2: x + vb / 2, y2: hY[i + 1] });
  }
  // Cotas entre ejes.
  const xsChain = [0, ...vX, W];
  out.push({ t: "L", l: "COTAS", x1: 0, y1: -0.7, x2: W, y2: -0.7 });
  for (const x of xsChain) out.push({ t: "L", l: "COTAS", x1: x - 0.07, y1: -0.77, x2: x + 0.07, y2: -0.63 });
  for (let i = 0; i < xsChain.length - 1; i++) {
    const seg = xsChain[i + 1] - xsChain[i];
    if (seg > 0.3) out.push({ t: "T", l: "COTAS", x: (xsChain[i] + xsChain[i + 1]) / 2 - 0.16, y: -0.98, h: 0.16, s: seg.toFixed(2) });
  }
  const notas = [
    `PLACA MACIZA e = ${CONCRETE.slab.thickness.toFixed(2)} m · ${nc} columnas ${col.toFixed(2)}×${col.toFixed(2)}`,
    `Vigas ${CONCRETE.beam.w.toFixed(2)}×${CONCRETE.beam.d.toFixed(2)} · Concreto ${CONCRETE.concretePSI}`,
    `NPT +${(level * plan.floorToFloor).toFixed(2)} m`,
  ];
  notas.forEach((n, i) => out.push({ t: "T", l: "TEXTOS", x: W + 1.2, y: D - i * 0.4, h: 0.15, s: n.slice(0, 46) }));
  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 2.4, h: 0.26, s: plan.levels > 1 ? `PLANTA ESTRUCTURAL NIVEL ${level + 1}` : "PLANTA ESTRUCTURAL" });
  return out;
}

/** S-03 — CORTE DE ESTRUCTURA completo (por la escalera — cutLines). */
export function seccionEstructuralPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const L = "ESTRUCTURA-LOSAS";
  const { width: W } = plan.outline;
  const { vX } = axesOf(plan);
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  const totalH = fft * levels;
  const GROUND = -0.3;
  // Terreno + terrain hatch.
  out.push({ t: "L", l: L, x1: -0.6, y1: GROUND, x2: W + 0.6, y2: GROUND });
  for (let i = 0; i < Math.ceil((W + 1.2) / 0.25); i++) {
    const x = -0.6 + i * 0.25;
    out.push({ t: "L", l: L, x1: x, y1: GROUND, x2: x - 0.18, y2: GROUND - 0.22, thin: true });
  }
  // Por cada eje vertical: zapata + columna de piso a piso.
  for (const x of vX) {
    const pad = CONCRETE.footing.pad, th = CONCRETE.footing.thickness;
    out.push({ t: "F", l: "ESTRUCTURA-CIMENTACION", x: x - pad / 2, y: -1.4, w: pad, h: th });
    out.push({ t: "F", l: "ESTRUCTURA-COLUMNAS", x: x - CONCRETE.column.w / 2, y: -1.1, w: CONCRETE.column.w, h: totalH + 1.1 });
    out.push({ t: "L", l: "EJES", x1: x, y1: -1.8, x2: x, y2: totalH + 0.9, dash: true, thin: true });
  }
  // Placas (poché de losa) + vigas ocultas por nivel.
  for (let lvl = 0; lvl <= levels; lvl++) {
    const z = lvl * fft;
    out.push({ t: "F", l: L, x: -0.02, y: z, w: W + 0.04, h: 0.2 });
    if (lvl < levels) {
      out.push({ t: "T", l: "TEXTOS", x: -1.3, y: z + 0.55, h: 0.15, s: `+${z.toFixed(2)}` });
    }
  }
  // Vigas en perfil (rectángulo sobre cada eje en cada nivel).
  for (let lvl = 1; lvl <= levels; lvl++) {
    const z = lvl * fft;
    for (const x of vX) {
      out.push({ t: "H", l: "ESTRUCTURA-VIGAS", x: x - CONCRETE.beam.w / 2, y: z - CONCRETE.beam.d, w: CONCRETE.beam.w, h: CONCRETE.beam.d });
    }
  }
  // Parapeto/remate estructural (continúa el lenguaje de las fachadas).
  out.push({ t: "L", l: L, x1: 0, y1: totalH, x2: W, y2: totalH });
  out.push({ t: "L", l: L, x1: 0, y1: totalH + 0.45, x2: W, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: 0, y1: totalH, x2: 0, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: W, y1: totalH, x2: W, y2: totalH + 0.45 });
  // PROFUNDIDAD de cimentación (cadena izquierda: NPT → fondo de zapata).
  const xz = -1.1;
  out.push({ t: "L", l: "COTAS", x1: xz, y1: 0, x2: xz, y2: -1.7 });
  out.push({ t: "L", l: "COTAS", x1: xz - 0.07, y1: -0.07, x2: xz + 0.07, y2: 0.07 });
  out.push({ t: "L", l: "COTAS", x1: xz - 0.07, y1: -1.77, x2: xz + 0.07, y2: -1.63 });
  out.push({ t: "T", l: "COTAS", x: xz - 0.62, y: -0.85, h: 0.15, s: "Df=1.70", r: 90 });
  out.push({ t: "T", l: "TEXTOS", x: -1.6, y: -2.15, h: 0.13, s: "NPT ±0.00" });
  // Cadenas de cotas VERTICALES (por nivel + total) — como el corte A-02.
  const xd = W + 1.4;
  out.push({ t: "L", l: "COTAS", x1: xd, y1: 0, x2: xd, y2: totalH });
  for (let lvl = 1; lvl <= levels; lvl++) {
    out.push({ t: "L", l: "COTAS", x1: xd - 0.07, y1: lvl * fft - 0.07, x2: xd + 0.07, y2: lvl * fft + 0.07 });
    out.push({ t: "L", l: "COTAS", x1: xd - 0.12, y1: lvl * fft, x2: xd - 0.28, y2: lvl * fft, thin: true });
    out.push({ t: "T", l: "COTAS", x: xd + 0.18, y: (lvl - 0.5) * fft, h: 0.16, s: fft.toFixed(2) });
  }
  out.push({ t: "L", l: "COTAS", x1: xd + 0.7, y1: 0, x2: xd + 0.7, y2: totalH });
  out.push({ t: "T", l: "COTAS", x: xd + 0.88, y: totalH / 2, h: 0.18, s: totalH.toFixed(2), r: 90 });
  // Cota horizontal entre ejes (cadena inferior).
  const xsChain = [0, ...vX, W];
  out.push({ t: "L", l: "COTAS", x1: 0, y1: -2.5, x2: W, y2: -2.5 });
  for (const x of xsChain) out.push({ t: "L", l: "COTAS", x1: x - 0.07, y1: -2.57, x2: x + 0.07, y2: -2.43 });
  for (let i = 0; i < xsChain.length - 1; i++) {
    const seg = xsChain[i + 1] - xsChain[i];
    if (seg > 0.3) out.push({ t: "T", l: "COTAS", x: (xsChain[i] + xsChain[i + 1]) / 2 - 0.16, y: -2.78, h: 0.16, s: seg.toFixed(2) });
  }
  // Notas del calculista + título.
  const notas = [
    `Columnas ${CONCRETE.column.w.toFixed(2)}×${CONCRETE.column.d.toFixed(2)} m en CADA cruce de ejes · ${vX.length} planos`,
    `Placas macizas e = ${CONCRETE.slab.thickness.toFixed(2)} m · vigas ${CONCRETE.beam.w.toFixed(2)}×${CONCRETE.beam.d.toFixed(2)} m`,
    `Zapatas ${CONCRETE.footing.pad.toFixed(2)}×${CONCRETE.footing.pad.toFixed(2)}×${CONCRETE.footing.thickness.toFixed(2)} m a −1.40 m`,
    "Ejes proyectados desde S-01/S-02 — correspondencia planta↔corte",
  ];
  notas.forEach((n, i) => out.push({ t: "T", l: "TEXTOS", x: 0, y: -4.4 - i * 0.34, h: 0.13, s: n.slice(0, 60) }));
  out.push({ t: "T", l: "TEXTOS", x: 0, y: totalH + 1.4, h: 0.26, s: "CORTE DE ESTRUCTURA — POR LA ESCALERA" });
  return out;
}

/** Detalle E1 — COLUMNA en sección (refuerzo esquemático). */
function detalleE1Columna(): Prim[] {
  const out: Prim[] = [];
  const s = CONCRETE.column.w; // 0.30 — dibujado a escala 5:1
  const k = 5, S = s * k, cx = 0.8, cy = 0.6;
  out.push({ t: "H", l: "ESTRUCTURA-COLUMNAS", x: cx, y: cy, w: S, h: S });
  out.push({ t: "H", l: "ESTRUCTURA-VIGAS", x: cx + 0.12, y: cy + 0.12, w: S - 0.24, h: S - 0.24 }); // estribo
  for (const [dx, dy] of [[0.12, 0.12], [S - 0.12, 0.12], [0.12, S - 0.12], [S - 0.12, S - 0.12]] as const) {
    out.push({ t: "C", l: "ESTRUCTURA-VIGAS", x: cx + dx, y: cy + dy, r: 0.06 }); // barra
  }
  out.push({ t: "T", l: "TEXTOS", x: cx + S + 0.25, y: cy + S - 0.1, h: 0.13, s: `4 Ø 5/8"` });
  out.push({ t: "T", l: "TEXTOS", x: cx + S + 0.25, y: cy + S - 0.35, h: 0.13, s: "Estribo Ø 1/4\" @ 0.15" });
  out.push({ t: "T", l: "TEXTOS", x: cx - 0.15, y: cy - 0.3, h: 0.13, s: `COL ${s.toFixed(2)}×${s.toFixed(2)} m (5:1)` });
  return out;
}

/** Detalle E2 — VIGA en elevación con estribos. */
function detalleE2Viga(): Prim[] {
  const out: Prim[] = [];
  const w = 1.6, d = 0.25, x = 0.3, y = 0.9;
  out.push({ t: "H", l: "ESTRUCTURA-VIGAS", x, y, w, h: d });
  out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: x + w / 2, y1: y, x2: x + w / 2, y2: y + d, thin: true });
  // Estribos concentrados en extremos (convención: @0.10 en 1/4, @0.20 centro).
  for (let i = 0; i < 6; i++) {
    const xx = x + 0.08 + i * 0.14;
    out.push({ t: "L", l: "ESTRUCTURA-COLUMNAS", x1: xx, y1: y, x2: xx, y2: y + d, thin: true });
    out.push({ t: "L", l: "ESTRUCTURA-COLUMNAS", x1: x + w - 0.08 - i * 0.14, y1: y, x2: x + w - 0.08 - i * 0.14, y2: y + d, thin: true });
  }
  for (let i = 0; i < 5; i++) {
    const xx = x + w / 2 - 0.45 + i * 0.22;
    out.push({ t: "L", l: "ESTRUCTURA-COLUMNAS", x1: xx, y1: y, x2: xx, y2: y + d, thin: true });
  }
  out.push({ t: "T", l: "TEXTOS", x, y: y + d + 0.15, h: 0.13, s: "Ø 1/4\" @ 0.10 EXT · @ 0.20 CENTRO" });
  out.push({ t: "T", l: "TEXTOS", x, y: y - 0.28, h: 0.13, s: `VIGA 0.30×0.25 · NEG (-) 2Ø1/2" · POS (+) 2Ø5/8"` });
  return out;
}

/** Detalle E3 — UNIÓN VIGA-COLUMA (esquema de confinamiento). */
function detalleE3Union(): Prim[] {
  const out: Prim[] = [];
  out.push({ t: "F", l: "ESTRUCTURA-COLUMNAS", x: 0.9, y: 0, w: 0.3 * 4, h: 2.2 });
  out.push({ t: "H", l: "ESTRUCTURA-VIGAS", x: 0, y: 0.95, w: 2.1, h: 0.25 * 4 * 0.6 });
  out.push({ t: "H", l: "ESTRUCTURA-VIGAS", x: 0.6, y: 1.55, w: 1.5, h: 0.25 * 4 * 0.6 });
  // Estribos de confinamiento en el nudo (más densos).
  for (let i = 0; i < 5; i++) {
    out.push({ t: "L", l: "ESTRUCTURA-VIGAS", x1: 0.95 + i * 0.2, y1: 0.85, x2: 0.95 + i * 0.2, y2: 1.05, thin: true });
  }
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 2.15, h: 0.13, s: "NUDA: estribos Ø1/4\" @ 0.10 (confinamiento NSR-10 C.21)" });
  out.push({ t: "T", l: "TEXTOS", x: 0, y: -0.28, h: 0.13, s: "UNIÓN VIGA-COLUMNA — ESQUEMA" });
  return out;
}

/** Detalle E4 — ZAPATA en sección con malla. */
function detalleE4Zapata(): Prim[] {
  const out: Prim[] = [];
  const pad = 1.1, th = 0.3, x = 0.6, y = 0.4;
  out.push({ t: "F", l: "ESTRUCTURA-CIMENTACION", x, y, w: pad, h: th });
  // Pedestal + columna arranque.
  out.push({ t: "F", l: "ESTRUCTURA-COLUMNAS", x: x + pad / 2 - 0.15, y: y + th, w: 0.3, h: 0.9 });
  // Malla en ambos sentidos (cruces).
  for (let i = 0; i <= 6; i++) {
    const xx = x + (i * pad) / 6;
    out.push({ t: "C", l: "ESTRUCTURA-VIGAS", x: xx, y: y + 0.08, r: 0.04 });
    out.push({ t: "C", l: "ESTRUCTURA-VIGAS", x: xx, y: y + th - 0.08, r: 0.04 });
  }
  out.push({ t: "T", l: "TEXTOS", x, y: y + th + 1.0, h: 0.13, s: `ZAPATA ${pad.toFixed(2)}×${pad.toFixed(2)}×${th.toFixed(2)} m` });
  out.push({ t: "T", l: "TEXTOS", x, y: y + th + 0.75, h: 0.13, s: "Malla Ø 3/8\" @ 0.20 AMBOS SENTIDOS" });
  out.push({ t: "T", l: "TEXTOS", x, y: -0.28, h: 0.13, s: "DESCANSA EN SUELO FIRME (q admisible del estudio)" });
  return out;
}

/** Cuadrícula 2×2 de cajas rotuladas (mismo patrón de la lámina A-07) —
 *  la composición que pasa el QA de llenado. */
function gridBoxes(boxes: Array<{ code: string; title: string; prims: Prim[] }>): Prim[] {
  const BW = 4.5, BH = 4.4;
  const out: Prim[] = [];
  boxes.forEach((b, i) => {
    const row = Math.floor(i / 2), col = i % 2;
    const x0 = col * (BW + 0.8), y0 = -row * (BH + 0.9);
    out.push({ t: "H", l: "ESTRUCTURA-LOSAS", x: x0, y: y0 - BH, w: BW, h: BH });
    out.push({ t: "C", l: "CORTE", x: x0 + 0.35, y: y0 - 0.35, r: 0.24 });
    out.push({ t: "T", l: "CORTE", x: x0 + 0.35 - b.code.length * 0.07, y: y0 - 0.42, h: 0.16, s: b.code });
    out.push({ t: "T", l: "TEXTOS", x: x0 + 0.75, y: y0 - 0.42, h: 0.15, s: b.title });
    // Escala del contenido a SU caja (sin deformar).
    const bb = primsBoundsOf(b.prims);
    const s = Math.min((BW - 0.8) / (bb.maxX - bb.minX), (BH - 1.0) / (bb.maxY - bb.minY));
    const dx = x0 + 0.4 + ((BW - 0.8) - (bb.maxX - bb.minX) * s) / 2;
    const dy = y0 - 0.8 - (bb.maxY - bb.minY) * s;
    for (const p of b.prims) {
      if (p.t === "L") out.push({ ...p, x1: dx + (p.x1 - bb.minX) * s, y1: dy + (p.y1 - bb.minY) * s, x2: dx + (p.x2 - bb.minX) * s, y2: dy + (p.y2 - bb.minY) * s });
      else if (p.t === "T") out.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, h: p.h * Math.min(s, 1) });
      else if (p.t === "C") out.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, r: p.r * s });
      else out.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, w: p.w * s, h: p.h * s });
    }
  });
  return out;
}

/** S-04 — DETALLES E1…E4 en cuadrícula 2×2 (mismo patrón de la A-07). */
export function detallesEstructuralesPrimitives(): Prim[] {
  return gridBoxes([
    { code: "E1", title: "COLUMNA — SECCIÓN Y REFUERZO", prims: detalleE1Columna() },
    { code: "E2", title: "VIGA — ELEVACIÓN Y ESTRIBOS", prims: detalleE2Viga() },
    { code: "E3", title: "UNIÓN VIGA-COLUMNA", prims: detalleE3Union() },
    { code: "E4", title: "ZAPATA AISLADA — SECCIÓN", prims: detalleE4Zapata() },
  ]);
}
function primsBoundsOf(prims: Prim[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of prims) {
    if (p.t === "L") {
      minX = Math.min(minX, p.x1, p.x2); minY = Math.min(minY, p.y1, p.y2);
      maxX = Math.max(maxX, p.x1, p.x2); maxY = Math.max(maxY, p.y1, p.y2);
    } else if (p.t === "T") {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.s.length * p.h * 0.7); maxY = Math.max(maxY, p.y + p.h);
    } else if (p.t === "C") {
      minX = Math.min(minX, p.x - p.r); minY = Math.min(minY, p.y - p.r);
      maxX = Math.max(maxX, p.x + p.r); maxY = Math.max(maxY, p.y + p.r);
    } else {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** S-05 — DESPIECES: cuadros de vigas, columnas y zapatas por retícula,
 *  banco de barras y esquema de refuerzo — en cuadrícula 2×2 (QA de plot). */
export function despiecesPrimitives(plan: FloorPlan): Prim[] {
  const { vX, hY, labelsX, labelsY } = axesOf(plan);
  // Vigas: cada vano entre ejes.
  const vigas: string[][] = [];
  let nv = 0;
  hY.forEach((_y, yi) => {
    for (let i = 0; i < vX.length - 1; i++) {
      nv++;
      vigas.push([`V-${100 + nv}`, `${labelsX[i]}-${labelsX[i + 1]}/${labelsY[yi]}`, (vX[i + 1] - vX[i]).toFixed(2), "0.30×0.25", `Ø1/4@0.15`]);
    }
  });
  vX.forEach((_x, xi) => {
    for (let i = 0; i < hY.length - 1; i++) {
      nv++;
      vigas.push([`V-${100 + nv}`, `${labelsY[i]}-${labelsY[i + 1]}/${labelsX[xi]}`, (hY[i + 1] - hY[i]).toFixed(2), "0.30×0.25", `Ø1/4@0.15`]);
    }
  });
  // Columnas: una por cruce.
  const cols: string[][] = [];
  let nc = 0;
  vX.forEach((_x, xi) => hY.forEach((_y, yi) => {
    nc++;
    cols.push([`C-${nc}`, `${labelsX[xi]}/${labelsY[yi]}`, plan.floorToFloor.toFixed(2), `4Ø5/8"`, `Ø1/4@0.15`]);
  }));
  // Caja 1 — despiece de vigas.
  const b1: Prim[] = [];
  tabla(b1, 0, 0, `DESPIECE DE VIGAS (${nv} u.) — ESQUEMA`,
    ["ID", "EJE", "LUZ", "SECC.", "ESTRIBO"],
    vigas.slice(0, 11), [0.7, 1.2, 0.5, 1.1, 1.05]);
  // Caja 2 — columnas.
  const b2: Prim[] = [];
  tabla(b2, 0, 0, `DESPIECE DE COLUMNAS (${nc} u.)`,
    ["ID", "EJE", "ALT.", "REFUERZO", "ESTRIBO"],
    cols.slice(0, 11), [0.65, 1.0, 0.55, 0.9, 1.0]);
  // Caja 3 — zapatas + banco de barras.
  const b3: Prim[] = [];
  tabla(b3, 0, 0, `DESPIECE DE ZAPATAS (${nc} u.)`,
    ["ID", "DIMENSIÓN", "REFUERZO"],
    cols.slice(0, 5).map((_c, i) => [`Z-${i + 1}`, "1.10×1.10", `Ø3/8@0.20`]),
    [0.65, 1.7, 1.25]);
  tabla(b3, 0, -3.1, "BANCO DE BARRAS (kg/m)",
    ["Ø", "kg/m", "L. COMERCIAL"],
    [["1/4", "0.25", "6.00 m"], ["3/8", "0.56", "6.00 m"], ["1/2", "0.99", "6.00 m"], ["5/8", "1.55", "6.00 m"]],
    [0.6, 0.65, 1.15]);
  // Caja 4 — esquema de viga + nota final.
  const b4: Prim[] = [...detalleE2Viga()];
  b4.push({ t: "T", l: "TEXTOS", x: 0, y: 0.2, h: 0.12, s: "Longitudes de despiece DEFINITIVAS las diseña y firma" });
  b4.push({ t: "T", l: "TEXTOS", x: 0, y: -0.02, h: 0.12, s: "el ingeniero matriculado (gancho 0.15 m incluido)." });
  return gridBoxes([
    { code: "V", title: `DESPIECE DE VIGAS (${nv} u.)`, prims: b1 },
    { code: "C", title: `DESPIECE DE COLUMNAS (${nc} u.)`, prims: b2 },
    { code: "Z", title: `ZAPATAS Y BANCO DE BARRAS`, prims: b3 },
    { code: "R", title: "REFUERZO TÍPICO DE VIGA", prims: b4 },
  ]);
}
