/**
 * MOTOR DE LÁMINAS — composición profesional multi-hoja.
 * Regla anti-solape: cada dibujo se coloca a partir de SUS PROPIOS bounds
 * reales (primsBounds) + separación fija — jamás offsets a ojo. Una lámina
 * por dibujo (A-01 planta, A-02 cortes, A-03 fachadas, A-04 estructura,
 * A-05 cubiertas). El formato OBRAHUB 700×500 (marco doble + rótulo) lo
 * pone cada motor: dress() para SVG/PDF, el propio DXF en láminas mm.
 */
import type { FloorPlan } from "../design/schema";
import { sectionPrimitives, facadePrimitives, plantaPrimitives, areaTablePrimitives, roofPlanPrimitives, mepLegendPrimitives, primsBounds, type Prim } from "./views";
import { structuralPlanPrimitives } from "../structural/plan";

export type Sheet = { code: string; title: string; prims: Prim[]; level?: number };

const GAP = 2.4; // separación entre dibujos (m de papel @1:75)

function shift(prims: Prim[], dx: number, dy: number): Prim[] {
  return prims.map((p) =>
    p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
    : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
    : { ...p, x: p.x + dx, y: p.y + dy },
  );
}

/** Coloca prims con su esquina (minX, maxY) en (tx, ty) — bounds reales. */
function placeAt(prims: Prim[], tx: number, ty: number): Prim[] {
  const b = primsBounds(prims);
  return shift(prims, tx - b.minX, ty - b.maxY);
}

/** ── A-00: ÍNDICE DEL SET + SIMBOLOGÍA (guía §2.8: lámina introductoria
 *  con el índice, códigos y símbolos — el mapa del paquete para el
 *  revisor de curaduría y el constructor). ──────────────────────────────── */
function indexSheetPrimitives(plan: FloorPlan, list: Array<{ code: string; title: string }>): Prim[] {
  const out: Prim[] = [];
  const TW = 7.6; // ancho de la tabla índice
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 1.55, h: 0.34, s: "OBRAHUB — ÍNDICE DEL SET DE LÁMINAS" });
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 1.2, h: 0.17, s: plan.name.toUpperCase().slice(0, 46) });
  let y = 1.0;
  out.push({ t: "L", l: "TEXTOS", x1: 0, y1: y, x2: TW, y2: y });
  for (const s of list) {
    y -= 0.42;
    out.push({ t: "T", l: "TEXTOS", x: 0.12, y: y + 0.1, h: 0.2, s: s.code });
    out.push({ t: "T", l: "TEXTOS", x: 1.15, y: y + 0.09, h: 0.17, s: s.title.slice(0, 36) });
    out.push({ t: "L", l: "TEXTOS", x1: 0, y1: y, x2: TW, y2: y, thin: true });
  }
  // Simbología de líneas (§2.6) — muestra real de cada linetype del set.
  y -= 0.55;
  out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.24, s: "SIMBOLOGÍA DE LÍNEAS" });
  const samples: Array<{ layer: string; label: string; dash?: boolean; thin?: boolean }> = [
    { layer: "MUROS", label: "CORTE EN PLANTA — MURO/ESTRUCTURA (GROSOR SEGÚN ESCALA)" },
    { layer: "PUERTAS", label: "PROYECCIÓN · GIRO DE PUERTA (DISCONTINUA)", dash: true },
    { layer: "EJES", label: "EJE PUNTO-RAYA — RETÍCULA ESTRUCTURAL", dash: true, thin: true },
    { layer: "COTAS", label: "COTAS · LÍNEA FINA CON TICKS 45°", thin: true },
  ];
  samples.forEach((sm, i) => {
    const yy = y - 0.45 * (i + 1);
    out.push({ t: "L", l: sm.layer, x1: 0, y1: yy, x2: 2.3, y2: yy, dash: sm.dash, thin: sm.thin ?? sm.layer !== "MUROS" });
    out.push({ t: "T", l: "TEXTOS", x: 2.55, y: yy - 0.05, h: 0.16, s: sm.label });
  });
  // Convenciones: marca de corte + flecha norte (§2.4/§2.10).
  y -= 0.45 * samples.length - 0.75;
  out.push({ t: "T", l: "TEXTOS", x: 0, y, h: 0.24, s: "CONVENCIONES" });
  const cy = y - 0.55;
  out.push({ t: "L", l: "CORTE", x1: 0, y1: cy, x2: 1.5, y2: cy, dash: true, thin: true });
  out.push({ t: "F", l: "CORTE", x: 1.5, y: cy - 0.05, w: 0.32, h: 0.1 });
  out.push({ t: "T", l: "CORTE", x: 1.85, y: cy - 0.28, h: 0.2, s: "A" });
  out.push({ t: "T", l: "TEXTOS", x: 2.3, y: cy - 0.05, h: 0.16, s: "MARCA DE CORTE → LÁMINA A-02" });
  out.push({ t: "L", l: "TEXTOS", x1: 0, y1: cy - 0.85, x2: 0.55, y2: cy - 0.05, thin: true });
  out.push({ t: "T", l: "TEXTOS", x: 0.1, y: cy - 1.0, h: 0.2, s: "N" });
  out.push({ t: "T", l: "TEXTOS", x: 2.3, y: cy - 0.85, h: 0.16, s: "FLECHA NORTE — EN TODAS LAS PLANTAS" });
  // Simbología MEP al costado derecho (misma tabla de la lámina de planta).
  const legend = mepLegendPrimitives(plan, 0);
  if (legend.length) out.push(...placeAt(legend, TW + 1.2, 1.0));
  return out;
}

/** Contenido SIN vestir por lámina (el motor DXF pone su propio formato
 *  OBRAHUB 700×500 en mm; el SVG viste con dress()). */
export function sheetContents(plan: FloorPlan): Sheet[] {
  const sheets: Sheet[] = [];

  // A-01 — PLANTA por NIVEL + CUADRO DE ÁREAS + SIMBOLOGÍA MEP (colocación
  // por bounds: nunca solapa). Guía §2.8: cada planta de piso es una lámina.
  const levels = Math.max(1, plan.levels);
  for (let lvl = 0; lvl < levels; lvl++) {
    if (!plan.rooms.some((r) => r.level === lvl)) continue;
    const planta = plantaPrimitives(plan, lvl);
    const pb = primsBounds(planta);
    const tabla = lvl === 0 ? areaTablePrimitives(plan) : [];
    let prims: Prim[] = [...planta];
    if (tabla.length) prims = [...prims, ...placeAt(tabla, pb.maxX + GAP, pb.maxY)];
    // Leyenda MEP bajo el cuadro (o bajo la planta si no hay cuadro).
    const legend = mepLegendPrimitives(plan, lvl);
    if (legend.length) {
      const anchor = tabla.length ? primsBounds(tabla) : pb;
      prims = [...prims, ...placeAt(legend, anchor.minX, anchor.minY - GAP)];
    }
    sheets.push({
      code: lvl === 0 ? "A-01" : `A-01.${lvl + 1}`,
      title: levels > 1 ? `PLANTA ARQUITECTÓNICA NIVEL ${lvl + 1} + CUADRO DE ÁREAS` : "PLANTA ARQUITECTÓNICA + CUADRO DE ÁREAS",
      prims,
      level: lvl,
    });
  }
  // A-02 — CORTES A-A' y B-B' lado a lado por bounds
  {
    const ca = sectionPrimitives(plan);
    const ab = primsBounds(ca);
    const cb = shift(sectionPrimitives(plan, { transverse: true }), ab.maxX + GAP, 0);
    sheets.push({ code: "A-02", title: "CORTES A-A' Y B-B'", prims: [...ca, ...cb] });
  }
  // A-03 — FACHADAS: fila por bounds; si excede formato, segunda fila.
  {
    const sides = ["sur", "oeste", "este", "norte"] as const;
    const placed: Array<{ w: number; prims: Prim[] }> = [];
    let cursor = 0;
    for (const s of sides) {
      const f = facadePrimitives(plan, s);
      const b = primsBounds(f);
      const w = b.maxX - b.minX;
      placed.push({ w, prims: shift(f, cursor - b.minX, -b.minY) });
      cursor += w + GAP;
    }
    const totalW = cursor - GAP;
    const maxH = Math.max(...placed.map((p) => primsBounds(p.prims).maxY));
    // Dos filas de 2 si es muy ancha (proporción de lámina ~1.5:1)
    if (totalW > maxH * 1.9) {
      const top = [...placed[0].prims, ...placed[1].prims];
      const tb = primsBounds(top);
      const bot = [...shift(placed[2].prims, 0, tb.minY - maxH - GAP), ...shift(placed[3].prims, placed[2].w + GAP, tb.minY - maxH - GAP)];
      sheets.push({ code: "A-03", title: "FACHADAS", prims: [...top, ...bot] });
    } else {
      sheets.push({ code: "A-03", title: "FACHADAS", prims: placed.flatMap((p) => p.prims) });
    }
  }
  // A-04 — PLANO ESTRUCTURAL
  sheets.push({ code: "A-04", title: "PLANO ESTRUCTURAL — RETÍCULA, COLUMNAS Y CIMENTACIÓN", prims: structuralPlanPrimitives(plan) });
  // A-05 — CUBIERTAS (placa maciza — MPr / Decreto 1077).
  sheets.push({ code: "A-05", title: "PLANTA DE CUBIERTAS — PLACA MACIZA", prims: roofPlanPrimitives(plan) });
  // A-00 — ÍNDICE DEL SET + SIMBOLOGÍA: la lámina introductoria de la guía
  // (§2.8) — se genera AL FINAL (necesita la lista) pero viaja PRIMERO;
  // el índice se incluye a sí mismo (set completo).
  const SELF = { code: "A-00", title: "ÍNDICE DEL SET Y SIMBOLOGÍA" };
  sheets.unshift({
    ...SELF,
    prims: indexSheetPrimitives(plan, [SELF, ...sheets]),
  });
  return sheets;
}

/** Marco doble + cajetín estándar para el CONTENIDO dado (bounds reales) —
 *  vestido del SVG/PDF (formato OBRAHUB 700×500 en DXF es aparte). */
function dress(code: string, title: string, content: Prim[], planName: string): Prim[] {
  const b = primsBounds(content);
  const m1 = 0.8, m2 = 1.4;
  const x0 = b.minX - m2, y0 = b.minY - m2, x1 = b.maxX + m2, y1 = b.maxY + m2;
  const out: Prim[] = [...content];
  out.push({ t: "H", l: "TEXTOS", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  out.push({ t: "H", l: "TEXTOS", x: x0 + (m2 - m1), y: y0 + (m2 - m1), w: x1 - x0 - 2 * (m2 - m1), h: y1 - y0 - 2 * (m2 - m1) });
  // Cajetín: esquina inferior derecha, DENTRO del marco interior.
  const cw = 9.5, ch = 2.6;
  const cx0 = x1 - m2 + (m2 - m1) - cw, cy0 = y0 + (m2 - m1);
  const rows: Array<[number, string]> = [
    [0.68, planName.toUpperCase().slice(0, 42)],
    [0.48, "UBICACION: " + ""],
    [0.48, "ESCALA GRÁFICA · METROS · UNIDADES S.I."],
    [0.48, `${code} \u2014 ${title}`],
    [0.48, "OBRAHUB \u00b7 CRATERE S.A.S."],
  ];
  out.push({ t: "H", l: "TEXTOS", x: cx0, y: cy0, w: cw, h: ch });
  let yy = cy0 + ch;
  for (const [rh, label] of rows) {
    yy -= rh;
    out.push({ t: "L", l: "TEXTOS", x1: cx0, y1: yy, x2: cx0 + cw, y2: yy, thin: true });
    out.push({ t: "T", l: "TEXTOS", x: cx0 + 0.25, y: yy + rh / 2 - 0.09, h: 0.2, s: label });
  }
  return out;
}

export function buildSheets(plan: FloorPlan): Sheet[] {
  return sheetContents(plan).map((s) => ({ ...s, prims: dress(s.code, s.title, s.prims, plan.name) }));
}
