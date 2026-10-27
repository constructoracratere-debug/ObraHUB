/**
 * MOTOR DE LÁMINAS — composición profesional multi-hoja.
 * Regla anti-solape: cada dibujo se coloca a partir de SUS PROPIOS bounds
 * reales (primsBounds/floorBounds) + separación fija — jamás offsets a ojo.
 *
 * ANTI-LÁMINA-MEDIA-VACÍA (QA de plot): para cada lámina se generan VARIAS
 * composiciones candidatas (lado a lado / apilado / columna) y se elige la
 * que mejor LLENA el área útil a la escala normalizada que le corresponde
 * (fillScore = min(ancho%, alto%) con la MISMA medida texto-clamped de
 * fitSheetScale). La escala NUNCA se deforma: se compone para ella.
 */
import type { FloorPlan } from "../design/schema";
import {
  sectionPrimitives, facadePrimitives, plantaPrimitives, acabadosPrimitives,
  areaTablePrimitives, roofPlanPrimitives, mepLegendPrimitives, mepSymbols,
  openingSchedulePrimitives, localizacionPrimitives, detallesAcabadosPrimitives,
  primsBounds, floorBounds, fitSheetScale, type Prim,
} from "./views";
import {
  memoriaPrimitives, cimentacionPrimitives, plantaEstructuralPrimitives,
  seccionEstructuralPrimitives, detallesEstructuralesPrimitives, despiecesPrimitives,
} from "../structural/sheets";

export type Sheet = { code: string; title: string; prims: Prim[]; level?: number; pkg?: "A" | "S" };

const GAP = 2.4; // separación entre dibujos (m de modelo)

// Área útil de la lámina OBRAHUB 700×500 en dxf.ts emitSheets (marco 10 +
// rótulo 185 + aire 12). MISMO valor allí y aquí — si cambia uno, cambia el otro.
export const SHEET_AVAIL_W = 700 - 2 * 10 - 185 - 2 * 12; // 471 mm
export const SHEET_AVAIL_H = 500 - 2 * 10 - 2 * 12;       // 456 mm

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

/** Elige la composición que mejor llena el área útil (escala normalizada).
 *  Segundo criterio: menor denominador (dibujo más grande). Determinista. */
function bestByFill(candidates: Prim[][]): Prim[] {
  let best: { prims: Prim[]; fill: number; den: number } | null = null;
  for (const c of candidates) {
    if (!c.length) continue;
    const den = fitSheetScale(c, SHEET_AVAIL_W, SHEET_AVAIL_H);
    const b = floorBounds(c, den);
    const fill = Math.min(
      ((b.maxX - b.minX) * (1000 / den)) / SHEET_AVAIL_W,
      ((b.maxY - b.minY) * (1000 / den)) / SHEET_AVAIL_H,
    );
    if (!best || fill > best.fill + 1e-9 || (Math.abs(fill - best.fill) <= 1e-9 && den < best.den)) {
      best = { prims: c, fill, den };
    }
  }
  return best!.prims;
}

/** ── A-00: ÍNDICE DEL SET + SIMBOLOGÍA (guía §2.8: lámina introductoria
 *  con el índice, códigos y símbolos — el mapa del paquete para el
 *  revisor de curaduría y el constructor). ──────────────────────────────── */
function indexSheetPrimitives(plan: FloorPlan, list: Array<{ code: string; title: string }>): Prim[] {
  const out: Prim[] = [];
  const TW = 7.6; // ancho de la tabla índice
  // Texto que JAMÁS se trunca: encoge proporcionalmente hasta caber (QA plot).
  const fitH = (s: string, h: number, maxChars: number, floorH = 0.11) =>
    Math.max(Math.min(h, (h * maxChars) / Math.max(s.length, 1)), floorH);
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 1.55, h: 0.34, s: "OBRAHUB — ÍNDICE DEL SET DE LÁMINAS" });
  out.push({ t: "T", l: "TEXTOS", x: 0, y: 1.2, h: fitH(plan.name.toUpperCase(), 0.17, 52), s: plan.name.toUpperCase() });
  let y = 1.0;
  out.push({ t: "L", l: "TEXTOS", x1: 0, y1: y, x2: TW, y2: y });
  for (const s of list) {
    y -= 0.42;
    out.push({ t: "T", l: "TEXTOS", x: 0.12, y: y + 0.1, h: 0.2, s: s.code });
    out.push({ t: "T", l: "TEXTOS", x: 1.15, y: y + 0.09, h: fitH(s.title.toUpperCase(), 0.17, 42), s: s.title.toUpperCase() });
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
  // Cuadro de áreas bajo el índice: el revisor de curaduría lo lee aquí
  // primero (y la lámina A-01 no queda sola si es pequeña).
  const tabla = areaTablePrimitives(plan);
  const below = primsBounds(out);
  out.push(...placeAt(tabla, 0, below.minY - 1.6));
  // LOCALIZACIÓN DEL PROYECTO bajo el cuadro (requisito del primer
  // paquete: el revisor ubica la obra en su contexto urbano).
  out.push(...placeAt(localizacionPrimitives(plan), 0, primsBounds(out).minY - 1.8));
  return out;
}

/** Contenido SIN vestir por lámina (el motor DXF pone su propio formato
 *  OBRAHUB 700×500 en mm; el SVG viste con dress()). */
export function sheetContents(plan: FloorPlan): Sheet[] {
  const sheets: Sheet[] = [];

  // A-01 — PLANTA por NIVEL + CUADRO DE ÁREAS + SIMBOLOGÍA MEP. Tres
  // composiciones candidatas; gana la que mejor LLENA la lámina. Dos pasadas:
  // la 1ª fija la escala, la 2ª regenera con ella para que las etiquetas
  // midan su cabida al TAMAÑO DE PAPEL final (la 1ª puede soltar cotas y
  // mejorar la escala — se re-mide y se queda con la mejor).
  const levels = Math.max(1, plan.levels);
  for (let lvl = 0; lvl < levels; lvl++) {
    if (!plan.rooms.some((r) => r.level === lvl)) continue;
    const compose = (den?: number) => {
      const planta = plantaPrimitives(plan, lvl, { den });
      const pb = primsBounds(planta);
      const tabla = lvl === 0 ? areaTablePrimitives(plan) : [];
      const legend = mepLegendPrimitives(plan, lvl);
      // lado a lado (ancho máximo): planta | tabla | leyenda
      const side: Prim[] = [...planta];
      if (tabla.length) side.push(...placeAt(tabla, pb.maxX + GAP, pb.maxY));
      if (legend.length) side.push(...placeAt(legend, primsBounds(side).maxX + GAP, pb.minY));
      // apilado (alto máximo): planta arriba, tabla y leyenda debajo
      const stack: Prim[] = [...planta];
      if (tabla.length) stack.push(...placeAt(tabla, pb.minX, pb.minY - GAP));
      if (legend.length) stack.push(...placeAt(legend, primsBounds(tabla.length ? stack : planta).minX, primsBounds(tabla.length ? stack : planta).minY - GAP));
      // columna: planta | (tabla arriba, leyenda debajo de la tabla)
      const col: Prim[] = [...planta];
      let colX = pb.maxX + GAP, colTop = pb.maxY, colBottom = pb.minY;
      if (tabla.length) {
        col.push(...placeAt(tabla, colX, colTop));
        const tb = primsBounds(tabla);
        colBottom = Math.min(colBottom, tb.minY);
      }
      if (legend.length) col.push(...placeAt(legend, colX, (tabla.length ? primsBounds(tabla).minY : colTop) - GAP));
      return [side, stack, col];
    };
    const first = bestByFill(compose());
    const denFirst = fitSheetScale(first, SHEET_AVAIL_W, SHEET_AVAIL_H);
    const second = bestByFill(compose(denFirst));
    sheets.push({
      code: lvl === 0 ? "A-01" : `A-01.${lvl + 1}`,
      title: levels > 1 ? `PLANTA ARQUITECTÓNICA NIVEL ${lvl + 1} + CUADRO DE ÁREAS` : "PLANTA ARQUITECTÓNICA + CUADRO DE ÁREAS",
      prims: second,
      level: lvl,
    });
  }
  // A-02 — CORTES A-A' y B-B': lado a lado (comparten suelo) o apilados —
  // el que mejor llene. Alineación por bounds REALES (antes el shift no
  // restaba minX del segundo corte: solapaba marcas).
  {
    const ca = sectionPrimitives(plan);
    const cb0 = sectionPrimitives(plan, { transverse: true });
    const ba = primsBounds(ca), bb = primsBounds(cb0);
    const side = [...ca, ...shift(cb0, ba.maxX + GAP - bb.minX, 0)];
    const stack = [...ca, ...shift(cb0, ba.minX - bb.minX, ba.minY - bb.maxY - GAP)];
    sheets.push({ code: "A-02", title: "CORTES A-A' Y B-B'", prims: bestByFill([side, stack]) });
  }
  // A-03 — FACHADAS: una fila (terreno común) o 2×2, con el CUADRO DE
  // PUERTAS Y VENTANAS (guía §6 — backlog del libro) debajo cuando apila.
  // (El 2×2 histórico reutilizaba las X de la fila única: las fachadas 3-4
  // quedaban dispersas a 40 m del origen — lámina 96%×15% de fill.)
  {
    const sides = ["sur", "oeste", "este", "norte"] as const;
    const faces = sides.map((s) => facadePrimitives(plan, s));
    const bs = faces.map((f) => primsBounds(f));
    const ws = bs.map((b) => b.maxX - b.minX);
    const one: Prim[] = [];
    let cx = 0;
    faces.forEach((f, i) => {
      one.push(...shift(f, cx - bs[i].minX, -bs[i].minY));
      cx += ws[i] + GAP;
    });
    const hMax = Math.max(...bs.map((b) => b.maxY - b.minY));
    const rowAt = (i: number, j: number, x0: number, topY: number): Prim[] => [
      ...shift(faces[i], x0 - bs[i].minX, topY - bs[i].maxY),
      ...shift(faces[j], x0 + ws[i] + GAP - bs[j].minX, topY - bs[j].maxY),
    ];
    const two: Prim[] = [...rowAt(0, 1, 0, 0), ...rowAt(2, 3, 0, -hMax - GAP)];
    // Dos pasadas como A-01: la 1ª fija la escala, la 2ª mide las columnas
    // del cuadro al tamaño de papel final (el piso 2.5 mm manda).
    const withSchedAt = (den?: number) => [...two, ...placeAt(openingSchedulePrimitives(plan, { den }), 0, primsBounds(two).minY - GAP)];
    const first = withSchedAt();
    const withSched = withSchedAt(fitSheetScale(first, SHEET_AVAIL_W, SHEET_AVAIL_H));
    sheets.push({ code: "A-03", title: "FACHADAS + CUADRO DE PUERTAS Y VENTANAS", prims: bestByFill([one, two, withSched]) });
  }
  // A-05 — CUBIERTAS (placa maciza — MPr / Decreto 1077).
  sheets.push({ code: "A-05", title: "PLANTA DE CUBIERTAS — PLACA MACIZA", prims: roofPlanPrimitives(plan) });
  // A-06 — ACABADOS por nivel: MISMO muro del plano general (bandas con
  // jambas) + trama de piso por espacio en A-ACABADOS + cuadro de acabados
  // (debajo o al lado — el que mejor llene la lámina). El plano
  // arquitectónico queda LIMPIO (guía §2.4): el acabado vive aquí.
  for (let lvl = 0; lvl < levels; lvl++) {
    if (!plan.rooms.some((r) => r.level === lvl)) continue;
    const first = acabadosPrimitives(plan, lvl);
    const den = fitSheetScale(first, SHEET_AVAIL_W, SHEET_AVAIL_H);
    const prims = bestByFill([acabadosPrimitives(plan, lvl, { den, legend: "below" }), acabadosPrimitives(plan, lvl, { den, legend: "side" })]);
    sheets.push({
      code: lvl === 0 ? "A-06" : `A-06.${lvl + 1}`,
      title: levels > 1 ? `PLANTA DE ACABADOS NIVEL ${lvl + 1}` : "PLANTA DE ACABADOS",
      prims,
      level: lvl,
    });
  }
  // A-07 — DETALLES DE ACABADOS: D1/D2/D3 + D4 (cuadro por espacio) en 2×2
  // — el complemento del cuadro de acabados que el revisor/ interventor pide.
  sheets.push({
    code: "A-07",
    title: "DETALLES DE ACABADOS",
    prims: detallesAcabadosPrimitives(plan, 2),
  });
  // ── PAQUETE ESTRUCTURAL (S-*) — SÓLO cuando el ingeniero fijó su retícula:
  //    con el paquete A cerrado nace el paquete S completo de licencia
  //    (memoria, cimentación, estructura por nivel, cortes, detalles y
  //    despieces — lib/structural/sheets.ts).
  if ((plan.structure?.axes?.length ?? 0) >= 2) {
    sheets.push({ code: "S-00", title: "MEMORIA GRÁFICA ESTRUCTURAL — NSR-10", prims: memoriaPrimitives(plan), pkg: "S" });
    sheets.push({ code: "S-01", title: "PLANTA DE CIMENTACIÓN — ZAPATAS AISLADAS", prims: cimentacionPrimitives(plan), pkg: "S" });
    for (let lvl = 0; lvl < levels; lvl++) {
      if (!plan.rooms.some((r) => r.level === lvl)) continue;
      sheets.push({
        code: lvl === 0 ? "S-02" : `S-02.${lvl + 1}`,
        title: levels > 1 ? `PLANTA ESTRUCTURAL NIVEL ${lvl + 1}` : "PLANTA ESTRUCTURAL",
        prims: plantaEstructuralPrimitives(plan, lvl),
        level: lvl,
        pkg: "S",
      });
    }
    sheets.push({ code: "S-03", title: "CORTE DE ESTRUCTURA — POR LA ESCALERA", prims: seccionEstructuralPrimitives(plan), pkg: "S" });
    sheets.push({ code: "S-04", title: "DETALLES ESTRUCTURALES — COLUMNA · VIGA · NUDA · ZAPATA", prims: detallesEstructuralesPrimitives(), pkg: "S" });
    sheets.push({ code: "S-05", title: "DESPIECES — VIGAS · COLUMNAS · ZAPATAS", prims: despiecesPrimitives(plan), pkg: "S" });
  }
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
  const nm = planName.toUpperCase();
  // Sin truncados (QA plot): encoge hasta caber en el ancho de la fila.
  const fit = (s: string, base = 0.2, maxChars = 46) => Math.max(Math.min(base, (base * maxChars) / Math.max(s.length, 1)), 0.1);
  const rows: Array<[number, string]> = [
    [0.68, nm],
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
    out.push({ t: "T", l: "TEXTOS", x: cx0 + 0.25, y: yy + rh / 2 - 0.09, h: fit(label), s: label });
  }
  return out;
}

export function buildSheets(plan: FloorPlan): Sheet[] {
  return sheetContents(plan).map((s) => ({ ...s, prims: dress(s.code, s.title, s.prims, plan.name) }));
}
