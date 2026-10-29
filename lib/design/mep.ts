/**
 * ✏️ PAQUETE DE INSTALACIONES (I-01/I-02) — eléctrico RETIE + hidrosanitario RAS.
 *
 * Lo que curaduría y el interventor leen en unas instalaciones:
 *   I-01 ELÉCTRICA — planta con CIRCUITOS dibujados (tablero→puntos),
 *        símbolos normalizados y CUADRO DE CARGAS (RETIE Res. 40117 de
 *        2021 · NTC 2050): circuito, puntos, VA, breaker, conductor,
 *        diferenciales 30 mA en húmedos.
 *   I-02 HIDROSANITARIA — planta con REDES: acometida+contador, red de
 *        agua fría Ø, agua caliente ACS aislada, desagües con pendiente
 *        hacia caja de inspección, ventilación Ø 2", cuadro de aparatos
 *        con dotación L/día (RAS 2017 — Res. 0330 · NTC 1500/2455).
 *
 * La CLASIFICACIÓN de circuitos/redes es 100% determinista desde los
 * puntos que dejaron los expertos (circuitsOf): mismas entradas, mismo
 * cuadro, mismo rayado — "la IA piensa, los motores dibujan". El diseño
 * definitivo y los certificados los firma el profesional matriculado
 * (aviso en cada lámina).
 *
 * TIPOGRAFÍA de cuadros: h 0.19 m en celdas y notas — así ni el piso de
 * 2.5 mm del plot estira el texto más allá de su celda a 1:75.
 */

import type { FloorPlan, ElectricalPoint } from "./schema";
import type { Prim } from "./views";
import { plantaPrimitives, mepSymbols, mepLegendPrimitives, primsBounds } from "./views";

/** Traslada primitivas (la composición de la lámina I trabaja en metros). */
const shift = (prims: Prim[], dx: number, dy: number): Prim[] =>
  prims.map((p) =>
    p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
    : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
    : { ...p, x: p.x + dx, y: p.y + dy },
  );

const E = "ELECTRICO";
const H = "HIDROSANITARIO";
const TX = "TEXTOS";

/** ── CIRCUITOS ELÉCTRICOS (determinista) ─────────────────────────────────── */

/** Carga unitaria por punto (VA) — cargas mínimas NTC 2050 para
 *  iluminación y tomas de uso general en vivienda. */
const VA_OF: Record<string, number> = {
  iluminacion: 100, tomacorriente: 180, tomacorriente_especial: 1500,
  interruptor: 0, tablero: 0,
};

export type MepCircuit = {
  id: string;
  desc: string;
  points: ElectricalPoint[];
  va: number;
  breaker: string;
  conductor: string;
  dif: boolean;
};

const isWetRoom = (plan: FloorPlan, p: ElectricalPoint) => {
  const r = plan.rooms.find(
    (rr) => rr.level === p.level && p.x >= rr.x - 0.15 && p.x <= rr.x + rr.width + 0.15 &&
      p.y >= rr.y - 0.15 && p.y <= rr.y + rr.depth + 0.15,
  );
  if (!r) return false;
  const nm = (r.name + " " + r.type).toLowerCase();
  return /ba[nñ]o|bano|cocina|lavander/.test(nm);
};

/** Circuitos derivados por grupo de uso (RETIE/NTC 2050): iluminación por
 *  nivel (≤10 lámparas), tomas de zonas húmedas CON diferencial 30 mA,
 *  tomas especiales de cocina dedicadas 20 A y tomas generales en bloques
 *  de 8. Los interruptores viajan con la iluminación de su nivel. */
export function circuitsOf(plan: FloorPlan): MepCircuit[] {
  const pts = plan.electrical?.points ?? [];
  const out: MepCircuit[] = [];
  let n = 0;
  const id = () => `C${++n}`;
  const lvlName = (lvl: number) => (lvl === 0 ? "PB" : `N${lvl + 1}`);
  const levels = Array.from(new Set(pts.map((p) => p.level))).sort((a, b) => a - b);

  for (const lvl of levels) {
    const pl = pts.filter((p) => p.level === lvl);
    const lights = pl.filter((p) => p.kind === "iluminacion");
    const switches = pl.filter((p) => p.kind === "interruptor");
    for (let i = 0; i < lights.length; i += 10) {
      const chunk = lights.slice(i, i + 10);
      out.push({
        id: id(), desc: `ILUMINACIÓN ${lvlName(lvl)}`,
        points: [...chunk, ...switches],
        va: chunk.length * VA_OF.iluminacion,
        breaker: "1P 15 A", conductor: "AWG 14", dif: false,
      });
    }
    const recepts = pl.filter((p) => p.kind === "tomacorriente");
    const wet = recepts.filter((p) => isWetRoom(plan, p));
    const dry = recepts.filter((p) => !isWetRoom(plan, p));
    if (wet.length) out.push({
      id: id(), desc: `TOMAS HÚMEDAS ${lvlName(lvl)}`,
      points: wet, va: wet.length * VA_OF.tomacorriente,
      breaker: "1P 20 A", conductor: "AWG 12", dif: true,
    });
    for (let i = 0; i < dry.length; i += 8) {
      const chunk = dry.slice(i, i + 8);
      out.push({
        id: id(), desc: `TOMAS GENERALES ${lvlName(lvl)}`,
        points: chunk, va: chunk.length * VA_OF.tomacorriente,
        breaker: "1P 15 A", conductor: "AWG 14", dif: false,
      });
    }
    for (const s of pl.filter((p) => p.kind === "tomacorriente_especial")) {
      out.push({
        id: id(), desc: "COCINA DEDICADO", points: [s],
        va: VA_OF.tomacorriente_especial,
        breaker: "1P 20 A", conductor: "AWG 12", dif: true,
      });
    }
  }
  return out;
}

/** Ruta ortogonal con un codo (h→v): el alambre/tubería se dibuja como se
 *  corre en obra — nunca diagonal. Segmentos degenerados no se emiten. */
const routeL = (out: Prim[], l: string, x1: number, y1: number, x2: number, y2: number, dash = false) => {
  if (Math.abs(x1 - x2) > 0.01 && Math.abs(y1 - y2) > 0.01) {
    out.push({ t: "L", l, x1, y1, x2, y2, thin: true, dash });
    out.push({ t: "L", l, x1: x2, y1, x2, y2, thin: true, dash });
  } else if (Math.abs(x1 - x2) > 0.01) {
    out.push({ t: "L", l, x1, y1, x2, y2, thin: true, dash });
  } else if (Math.abs(y1 - y2) > 0.01) {
    out.push({ t: "L", l, x1, y1, x2, y2, thin: true, dash });
  }
};

/** ── TABLA genérica (estilo del paquete S: caja + raya por fila, h 0.19
 *  para que el piso de 2.5 mm del plot no desborde la celda a 1:75). ──── */
function tabla(
  out: Prim[], x: number, y: number, title: string,
  headers: string[], rows: string[][], cw: number[], rh = 0.34,
): number {
  const totalW = cw.reduce((a, b) => a + b, 0);
  const top = y + rh * (rows.length + 1);
  out.push({ t: "T", l: TX, x, y: top + 0.28, h: 0.19, s: title });
  out.push({ t: "H", l: TX, x, y, w: totalW, h: rh * (rows.length + 1) });
  out.push({ t: "L", l: TX, x1: x, y1: top - rh, x2: x + totalW, y2: top - rh, thin: true }); // cabecera | datos
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    out.push({ t: "T", l: TX, x: cx + 0.06, y: top - rh + 0.07, h: 0.19, s: headers[i] });
    cx += cw[i];
  }
  for (let r = 0; r < rows.length; r++) {
    const yy = y + rh * (rows.length - 1 - r);
    out.push({ t: "L", l: TX, x1: x, y1: yy, x2: x + totalW, y2: yy, thin: true });
    cx = x;
    for (let i = 0; i < rows[r].length; i++) {
      out.push({ t: "T", l: TX, x: cx + 0.06, y: yy + 0.07, h: 0.19, s: rows[r][i] });
      cx += cw[i];
    }
  }
  return rh * (rows.length + 1) + 0.9;
}

const notas = (out: Prim[], x: number, y: number, title: string, lines: string[]) => {
  out.push({ t: "T", l: TX, x, y, h: 0.19, s: title });
  lines.forEach((s, i) => out.push({ t: "T", l: TX, x, y: y - 0.42 - i * 0.34, h: 0.19, s: s }));
};

/** Planta de FONDO para láminas de instalaciones: la arquitectura en
 *  silueta (muros/vanos) SIN mobiliario, cotas ni MEP — el especialista
 *  lee sus redes sobre el casco. Los muros pasan a MOBILIARIO para trazar
 *  con pluma de perfil (fondo), no de corte. */
function mepBase(plan: FloorPlan, level: number): Prim[] {
  return plantaPrimitives(plan, level)
    .filter((p) => (p.l === "MUROS" || p.l === "PUERTAS" || p.l === "VENTANAS") && p.t !== "F")
    .map((p) => (p.l === "MUROS" ? { ...p, l: "MOBILIARIO" } : p));
}

/** Símbolos MEP (mismo solver anti-amontonamiento del plano) como prims. */
function mepSymbolPrims(plan: FloorPlan, level: number, disc: "E" | "H"): Prim[] {
  const out: Prim[] = [];
  for (const s of mepSymbols(plan, level)) {
    if (s.disc !== disc) continue;
    const l = disc === "E" ? E : H;
    out.push({ t: "C", l, x: s.x, y: s.y, r: s.r });
    out.push({ t: "T", l, x: s.x - s.letter.length * 0.07, y: s.y - 0.05, h: 0.13, s: s.letter });
  }
  return out;
}

/** ── I-01 · INSTALACIÓN ELÉCTRICA ────────────────────────────────────────── */

export function electricalSheetPrimitives(plan: FloorPlan, level = 0): Prim[] {
  const out: Prim[] = mepBase(plan, level);
  const circuits = circuitsOf(plan).filter((c) => c.points.some((p) => p.level === level));
  const tablero: ElectricalPoint =
    (plan.electrical?.points ?? []).find((p) => p.kind === "tablero" && p.level === level)
    ?? { kind: "tablero", room: "", x: 0.4, y: 0.4, level };

  // Alambres: tablero → puntos encadenados por circuito (una ruta, un
  // rótulo C# al primer tramo — así se cuenta el cuadro contra el plano).
  for (const c of circuits) {
    const chain = [tablero, ...c.points].sort((a, b) => a.y + a.x - (b.y + b.x));
    for (let i = 1; i < chain.length; i++) routeL(out, E, chain[i - 1].x, chain[i - 1].y, chain[i].x, chain[i].y);
    out.push({ t: "T", l: E, x: (tablero.x + chain[1].x) / 2 + 0.12, y: (tablero.y + chain[1].y) / 2 + 0.08, h: 0.16, s: c.id });
  }
  // Interruptor → lámpara más cercana de su nivel (canaleta de conmutación).
  const lights = (plan.electrical?.points ?? []).filter((p) => p.kind === "iluminacion" && p.level === level);
  for (const sw of (plan.electrical?.points ?? []).filter((p) => p.kind === "interruptor" && p.level === level)) {
    const near = [...lights].sort(
      (a, b) => (a.x - sw.x) ** 2 + (a.y - sw.y) ** 2 - ((b.x - sw.x) ** 2 + (b.y - sw.y) ** 2),
    )[0];
    if (near) routeL(out, E, sw.x, sw.y, near.x, near.y, true);
  }
  out.push(...mepSymbolPrims(plan, level, "E"));
  out.push({ t: "T", l: E, x: tablero.x + 0.14, y: tablero.y + 0.2, h: 0.15, s: "TABLERO" });

  // LEYENDA de símbolos al costado (como A-01): llena el ancho de la lámina
  // y el especialista la lee sin cambiar de plano.
  const legend = mepLegendPrimitives(plan, level);
  if (legend.length) {
    const b = primsBounds(out);
    out.push(...shift(legend, b.maxX + 1.2, b.maxY));
  }

  // CUADRO DE CARGAS (RETIE) bajo la planta.
  const rows = circuits.map((c) => [
    c.id, c.desc, String(c.points.filter((p) => VA_OF[p.kind] > 0).length),
    String(c.va), c.breaker, c.conductor, c.dif ? "30 mA" : "—",
  ]);
  const va = circuits.reduce((a, c) => a + c.va, 0);
  rows.push(["—", "TOTAL CONECTADO", "—", String(va), "1F 2H", "AWG 8", "PT"]);
  let y = primsBounds(out).minY - 1.6;
  const hh = tabla(out, 0, y, "CUADRO DE CARGAS — 1F 2H 120/240 V (RETIE Res. 40117/2021)",
    ["CTO", "DESCRIPCIÓN", "PTS", "VA", "BREAKER", "COND.", "DIF."], rows,
    [0.45, 2.5, 0.45, 0.6, 0.95, 0.85, 0.6]);
  y -= hh + 0.35;
  notas(out, 0, y, "NOTAS ELÉCTRICAS (RETIE · NTC 2050)", [
    '1. SISTEMA 1F 2H 120/240 V · PT ELECTRODO 5/8" × 2.4 M + AWG 8',
    "2. BAÑOS/COCINA/EXTERIORES: DIFERENCIAL 30 mA (NTC 2050 210.8)",
    '3. MÁX 8 TOMAS/CIRCUITO · THW-90 °C · TUBERÍA PVC-P 5/8"',
    '4. CAJAS 2×4" A 0.40 SOBRE NPT · OCTOGONALES EN TECHO',
    "5. CERTIFICADO RETIE Y DISEÑO: PROFESIONAL MATRICULADO",
  ]);
  return out;
}

/** ── I-02 · INSTALACIÓN HIDROSANITARIA ──────────────────────────────────── */

/** Dotación L/día por aparato (uso típico vivienda — RAS 2017 título B). */
const L_DIA: Record<string, number> = {
  sanitario: 80, lavamanos: 30, ducha: 100, lavaplatos: 40, lavadero: 60,
  calentador: 0, punto_hidraulico: 0,
};
const NAME_H: Record<string, string> = {
  sanitario: "SANITARIO T/B", lavamanos: "LAVAMANOS", ducha: "DUCHA", lavaplatos: "LAVAPLATOS",
  lavadero: "LAVADERO", calentador: "CALENTADOR", punto_hidraulico: "PUNTO AGUA",
};
const AC_OF: Record<string, string> = {
  sanitario: 'Ø1/2"', lavamanos: 'Ø1/2"', ducha: 'Ø1/2"', lavaplatos: 'Ø1/2"',
  lavadero: 'Ø1/2"', calentador: 'Ø1/2"', punto_hidraulico: 'Ø1/2"',
};
const DH_OF: Record<string, string> = {
  sanitario: 'Ø3"', lavamanos: 'Ø1 1/2"', ducha: 'Ø2"', lavaplatos: 'Ø1 1/2"',
  lavadero: 'Ø2"', calentador: "—", punto_hidraulico: "—",
};

export function hydroSheetPrimitives(plan: FloorPlan, level = 0): Prim[] {
  const out: Prim[] = mepBase(plan, level);
  const aparatos = (plan.hydro?.points ?? []).filter((p) => p.level === level);
  const { width: W, depth: D } = plan.outline;
  // MONTANTE MOJADA: centroide del grupo húmedo (redondeado a 5 cm) —
  // RAS: áreas húmedas AGRUPADAS, un solo bajante.
  const mx = aparatos.length
    ? Math.round((aparatos.reduce((a, p) => a + p.x, 0) / aparatos.length) * 20) / 20 : W / 2;
  const my = aparatos.length
    ? Math.round((aparatos.reduce((a, p) => a + p.y, 0) / aparatos.length) * 20) / 20 : D / 2;

  // ACOMETIDA (lado oeste, a la altura del grupo húmedo) + CONTADOR en caja:
  // la red pública llega y SE MARCA (RAS título A/B).
  const ay = Math.min(Math.max(my, 0.6), D - 0.6);
  out.push({ t: "H", l: H, x: -1.15, y: ay - 0.2, w: 0.4, h: 0.4 });
  out.push({ t: "T", l: TX, x: -1.45, y: ay + 0.34, h: 0.19, s: 'Ø3/4" ACUEDUCTO' });
  out.push({ t: "T", l: TX, x: -1.45, y: ay + 0.1, h: 0.19, s: "+ CONTADOR" });
  routeL(out, H, -0.75, ay, mx, my);

  // Por CADA aparato: derivación de AGUA FRÍA (montante → aparato) y su
  // DESAGÜE (aparato → montante, desfasado −0.12 para leerse como red
  // paralela — jamás una sola línea haciendo de las dos).
  for (const p of aparatos) {
    if (p.kind === "calentador") continue;
    routeL(out, H, mx, my, p.x, p.y);
    routeL(out, H, p.x, p.y - 0.12, mx, my - 0.12);
  }
  if (aparatos.length) out.push({ t: "T", l: H, x: mx + 0.12, y: my + 0.14, h: 0.14, s: 'Ø3/4"' });

  // AGUA CALIENTE SANITARIA (ACS aislada — discontinua): calentador →
  // ducha/lavamanos/lavaplatos. Sin calentador declarado no se dibuja.
  const heater = aparatos.find((p) => p.kind === "calentador");
  if (heater) {
    out.push({ t: "T", l: H, x: heater.x + 0.14, y: heater.y + 0.22, h: 0.13, s: "ACS AISL." });
    for (const p of aparatos) {
      if (p.kind === "ducha" || p.kind === "lavamanos" || p.kind === "lavaplatos") {
        routeL(out, H, heater.x, heater.y, p.x, p.y, true);
      }
    }
  }

  // BAJANTE → CAJA DE INSPECCIÓN al frente (sur) con pendiente 1.5% y
  // flecha de sentido (RAS título C); VENTILACIÓN primaria Ø 2" sube por
  // el mismo montante hasta 30 cm sobre cubierta (trazo discontinuo).
  out.push({ t: "L", l: H, x1: mx, y1: my - 0.12, x2: mx, y2: -1.05, thin: true });
  out.push({ t: "H", l: H, x: mx - 0.2, y: -1.3, w: 0.4, h: 0.4 });
  out.push({ t: "T", l: TX, x: mx - 0.32, y: -1.52, h: 0.19, s: "C.I. Ø 0.70" });
  const tickY = Math.max(0.5, my * 0.4);
  out.push({ t: "L", l: H, x1: mx - 0.16, y1: tickY, x2: mx + 0.16, y2: tickY - 0.08, thin: true });
  out.push({ t: "T", l: TX, x: mx + 0.22, y: tickY - 0.08, h: 0.19, s: "1.5%" });
  out.push({ t: "L", l: H, x1: mx, y1: my, x2: mx, y2: D + 0.45, thin: true, dash: true });
  out.push({ t: "T", l: TX, x: mx + 0.12, y: D + 0.5, h: 0.19, s: 'Ø2" VENT. +0.30' });

  out.push(...mepSymbolPrims(plan, level, "H"));

  // LEYENDA al costado (como A-01) y CUADRO DE APARATOS + DOTACIÓN (RAS
  // título B) bajo la planta.
  const legend = mepLegendPrimitives(plan, level);
  if (legend.length) {
    const b = primsBounds(out);
    out.push(...shift(legend, b.maxX + 1.2, b.maxY));
  }
  const byKind = new Map<string, number>();
  for (const p of aparatos) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  const rows = [...byKind.entries()].map(([k, c]) => [
    NAME_H[k] ?? k.toUpperCase(), String(c), AC_OF[k] ?? 'Ø1/2"', DH_OF[k] ?? "—", String((L_DIA[k] ?? 0) * c),
  ]);
  const total = [...byKind.entries()].reduce((a, [k, c]) => a + (L_DIA[k] ?? 0) * c, 0);
  rows.push(["TOTAL DOTACIÓN/DÍA", "—", "—", "—", String(total)]);
  let y = primsBounds(out).minY - 2.2;
  const hh = tabla(out, 0, y, "CUADRO DE APARATOS — DOTACIÓN RAS 2017 (Res. 0330)",
    ["APARATO", "CANT", "AC", "DESAGÜE", "L/DÍA"], rows, [2.5, 0.6, 1.0, 1.0, 0.55]);
  y -= hh + 0.35;
  notas(out, 0, y, "NOTAS HIDROSANITARIAS (RAS 2017 — Res. 0330 · NTC 1500)",
    [
      '1. ACOMETIDA Ø3/4" + CONTADOR · TANQUE ≥ 50% (RAS TÍT. B)',
      '2. DESAGÜES CON SIFÓN · PEND. 1.5% A C.I. · VENT. Ø2"',
      "3. TRAMPA DE GRASAS EN COCINA · C.I. Ø 0.70 CADA 15 M",
      "4. ACS AISLADA · PRUEBA ESTANQUEIDAD 1.5× PRESIÓN TRABAJO",
      "5. DISEÑO Y PRUEBAS: INGENIERO SANITARIO MATRICULADO",
    ]);
  return out;
}
