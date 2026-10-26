/**
 * ✏️ Diseño IA — Vistas: CORTE A-A' y FACHADAS (N/S/E/W).
 *
 * Primitivas puras (deterministas) que alimentan DOS renderizadores: el
 * motor DXF (capas CORTE/FACHADA-*) y el SVG de la UI. Convenciones de los
 * libros de la KB (Ching "Architectural Graphics", Plazola, Neufert):
 *  · JERARQUÍA DE LÍNEA: lo cortado es lo más grueso; perfiles medios;
 *    texturas/cotas finas (Ching §2 — el dibujo se lee por pesos).
 *  · Poché SÓLIDO en muros/placas cortados (F = relleno).
 *  · Niveles con ▲ + cota (+0.00, +2.60…) en TODOS los pisos.
 *  · Cotas verticales (piso a piso + total) y horizontales (cadenas).
 *  · Vidrio = diagonales finas (Ching); antepechos/dinteles marcados.
 *  · Terreno rayado; zapatas y viga de cimentación bajo el corte.
 *  · Fachadas: zócalo, textura de mampostería, bajante, manija.
 */

import type { FloorPlan, Room, WallSide } from "./schema";
import { furnishRoom, labelSpot, escalera } from "./symbols";

/** Primitiva de dibujo (unidades: metros, CAD — Y hacia arriba). */
export type Prim =
  | { t: "L"; l: string; x1: number; y1: number; x2: number; y2: number; dash?: boolean; thin?: boolean }
  | { t: "T"; l: string; x: number; y: number; h: number; s: string; r?: number }
  | { t: "H"; l: string; x: number; y: number; w: number; h: number } // rect hueco
  | { t: "F"; l: string; x: number; y: number; w: number; h: number } // rect RELLENO (poché/zócalo)
  | { t: "C"; l: string; x: number; y: number; r: number };            // círculo (burbujas de eje)

const DOOR_H = 2.1;
/** Escala gráfica declarada (Plazola: cortes/fachadas 1:75, planta 1:75/1:100). */

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Marca de nivel (▲ +N.NN) — Ching. */
function levelMark(l: string, x: number, z: number, out: Prim[], label: string) {
  out.push({ t: "L", l, x1: x, y1: z, x2: x + 0.5, y2: z });
  out.push({ t: "L", l, x1: x + 0.5, y1: z + 0.08, x2: x + 0.58, y2: z });          // ▲ aprox
  out.push({ t: "L", l, x1: x + 0.5, y1: z + 0.08, x2: x + 0.42, y2: z });
  out.push({ t: "T", l, x: x + 0.65, y: z - 0.07, h: 0.16, s: label });
}

/** Cota tipo cadena con ticks oblicuos (Ching) — segmentos [a,b] sobre y. */
function dimChain(l: string, xs: number[], y: number, out: Prim[]) {
  out.push({ t: "L", l, x1: xs[0], y1: y, x2: xs[xs.length - 1], y2: y });
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    out.push({ t: "L", l, x1: x - 0.07, y1: y - 0.07, x2: x + 0.07, y2: y + 0.07 }); // tick oblicuo
    out.push({ t: "L", l, x1: x, y1: y - 0.12, x2: x, y2: y - 0.28, thin: true });   // extensión
  }
}

/** Zapata aislada + arranque de muro bajo un eje cortado (Plazola/NSR). */
function footingAt(l: string, x: number, out: Prim[], floorY = -1.4) {
  const w = 1.1, t = 0.3; // zapata 1.10×1.10×0.30 (materials.ts CONCRETE)
  out.push({ t: "F", l, x: x - w / 2, y: floorY, w, h: t });
  // Trapecio de arranque (transición zapata→muro).
  out.push({ t: "L", l, x1: x - w / 2, y1: floorY + t, x2: x - 0.18, y2: floorY + t + 0.35 });
  out.push({ t: "L", l, x1: x + w / 2, y1: floorY + t, x2: x + 0.18, y2: floorY + t + 0.35 });
}

/** ── CAJA DE ESCALERA (fuente única, curaduría): local tipado ESCALERA si
 *  el modelo lo pidió; si no, la heurística histórica (espacio más grande
 *  del N1 pegado al muro este). Null = un solo nivel sin local de escalera.
 *  La consumen: la planta (símbolo), las LÍNEAS DE CORTE (cutLines) y el
 *  corte (vuelo de peldaños) — todos ven la MISMA escalera. */
export function stairBox(plan: FloorPlan): { x: number; y: number; w: number; d: number } | null {
  const room = plan.rooms.find((r) => r.level === 0 && r.type === "escalera" && r.width >= 0.8 && r.depth >= 1.6);
  if (room) return { x: room.x, y: room.y, w: room.width, d: room.depth };
  if ((plan.levels ?? 1) <= 1) return null;
  const host = [...plan.rooms.filter((r) => r.level === 0)]
    .sort((a, b) => b.width * b.depth - a.width * a.depth)[0];
  if (!host) return null;
  const w = 0.9;
  const len = Math.min(host.depth - 0.35, plan.floorToFloor * 2.1);
  if (len < 1.2) return null;
  return { x: host.x + host.width - w - 0.15, y: host.y + 0.15, w, d: len };
}

/** ── LÍNEAS DE CORTE (fuente única): curaduría exige cortes POR LA
 *  ESCALERA — el longitudinal (A-A') corta por el centro Y de la escalera
 *  y el transversal (B-B') por su centro X. Sin escalera: centros del
 *  rectángulo (comportamiento histórico). Planta y corte consumen ESTA
 *  función: la marca del plano y el corte dibujado nunca se contradicen. */
export function cutLines(plan: FloorPlan): { longY: number; transX: number } {
  const { width: W, depth: D } = plan.outline;
  const s = stairBox(plan);
  if (!s) return { longY: D / 2, transX: W / 2 };
  return {
    longY: Math.min(Math.max(s.y + s.d / 2, 1), D - 1),
    transX: Math.min(Math.max(s.x + s.w / 2, 1), W - 1),
  };
}

/** ── CORTE — vertical por el eje largo (A-A') o corto (B-B') ───────────── */
export function sectionPrimitives(plan: FloorPlan, opts: { transverse?: boolean } = {}): Prim[] {
  const out: Prim[] = [];
  const L = "CORTE";
  const { width: W0, depth: D0 } = plan.outline;
  // Transversal: intercambia ejes — el corte corre por x = W/2 mirando E.
  const W = opts.transverse ? D0 : W0;
  const D = opts.transverse ? W0 : D0;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  // El corte pasa POR LA ESCALERA (cutLines — fuente única compartida con
  // las marcas de la planta): longitudinal a su centro Y, transversal a su X.
  const cuts = cutLines(plan);
  const cutY = opts.transverse ? cuts.transX : cuts.longY;
  const totalH = fft * levels;
  const GROUND = -0.3;

  // Terreno rayado (Ching: hatch del suelo natural) hasta cimentación.
  out.push({ t: "L", l: L, x1: -0.6, y1: GROUND, x2: W + 0.6, y2: GROUND });
  for (let i = 0; i < Math.ceil((W + 1.2) / 0.25); i++) {
    const x = -0.6 + i * 0.25;
    out.push({ t: "L", l: L, x1: x, y1: GROUND, x2: x - 0.18, y2: GROUND - 0.22, thin: true });
  }

  // Particiones interiores que cruza el corte + bordes de espacios cortados.
  const edges = new Set<number>();
  for (const r of plan.rooms.filter((r) => r.level === 0)) {
    const along = opts.transverse ? r.y : r.x;
    const alongW = opts.transverse ? r.depth : r.width;
    const across = opts.transverse ? r.x : r.y;
    const acrossW = opts.transverse ? r.width : r.depth;
    if (across <= cutY && across + acrossW >= cutY) {
      edges.add(Math.round(along * 100) / 100);
      edges.add(Math.round((along + alongW) * 100) / 100);
    }
  }
  const inner = [...edges].filter((x) => x > 0.2 && x < W - 0.2).sort((a, b) => a - b);

  // CIMENTACIÓN bajo cada muro cortado: zapatas + viga de cimentación.
  for (const x of [0, W, ...inner]) footingAt(L, x, out);
  out.push({ t: "H", l: L, x: -0.12, y: -1.1, w: W + 0.24, h: 0.2 }); // viga de cimentación corrida

  for (let lvl = 0; lvl < levels; lvl++) {
    const z0 = lvl * fft;
    // Placa pisotecho MACIZA (banda rellena — poché de losa, Ching).
    out.push({ t: "F", l: L, x: -0.02, y: z0, w: W + 0.04, h: 0.2 });

    // Muros cortados: POCHÉ SÓLIDO (extremos) y particiones.
    for (const x of [0, W]) {
      out.push({ t: "F", l: L, x: x === 0 ? 0 : x - 0.12, y: z0 + 0.2, w: 0.12, h: fft - 0.2 });
    }
    for (const x of inner) {
      out.push({ t: "F", l: L, x: x - 0.05, y: z0 + 0.2, w: 0.1, h: fft - 0.2 });
    }

    // Nombres + áreas de los espacios cortados.
    for (const r of plan.rooms.filter((r) => r.level === lvl)) {
      const across = opts.transverse ? r.x : r.y;
      const acrossW = opts.transverse ? r.width : r.depth;
      if (!(across <= cutY && across + acrossW >= cutY)) continue;
      const cx = (opts.transverse ? r.y + r.depth / 2 : r.x + r.width / 2);
      out.push({ t: "T", l: L, x: cx - r.name.length * 0.06, y: z0 + fft / 2 + 0.08, h: 0.18, s: r.name.toUpperCase() });
      out.push({ t: "T", l: L, x: cx - 0.25, y: z0 + fft / 2 - 0.2, h: 0.13, s: `${(r.width * r.depth).toFixed(1)} m²` });
    }

    // Ventanas en muros N/S cortados: marco + VIDRIO (diagonal Ching) + dintel.
    for (const w of plan.windows.filter((w) => w.level === lvl && (w.wall === "norte" || w.wall === "sur"))) {
      const room = plan.rooms.find(roomAt(plan, w.room, lvl));
      if (!room) continue;
      const edgeY = w.wall === "norte" ? room.y + room.depth : room.y;
      if (Math.abs(edgeY - (w.wall === "norte" ? D : 0)) > 0.35) continue;
      const wx = w.x - w.width / 2, wy = z0 + w.sill;
      out.push({ t: "H", l: L, x: wx, y: wy, w: w.width, h: w.height });           // marco
      out.push({ t: "L", l: L, x1: wx + 0.05, y1: wy + w.height / 2, x2: wx + w.width - 0.05, y2: wy + w.height / 2, thin: true }); // vidrio
      out.push({ t: "L", l: L, x1: wx + 0.05, y1: wy + 0.05, x2: wx + w.width * 0.4, y2: wy + w.height - 0.08, thin: true });      // reflejo
      out.push({ t: "L", l: L, x1: wx, y1: wy + w.height + 0.12, x2: wx + w.width, y2: wy + w.height + 0.12 });                    // dintel
    }

    // Marca de nivel en CADA piso (Ching: siempre todos los NPT).
    levelMark(L, -1.2, z0, out, `+${fmt(z0)}`);
  }
  // NPT superior (cara superior de la última placa).
  levelMark(L, -1.2, totalH, out, `+${fmt(totalH)}`);

  // ESCALERA EN CORTE (Ching: el corte por la escalera muestra el VUELO —
  // peldaños como escalera diagonal + pasamanos). Sólo si la línea de corte
  // cruza la caja de la escalera (misma fuente que la planta).
  const st = stairBox(plan);
  if (st && levels > 1) {
    const along0 = opts.transverse ? st.y : st.x;
    const acrossSt = opts.transverse ? st.x : st.y;
    const acrossStW = opts.transverse ? st.w : st.d;
    if (acrossSt <= cutY && acrossSt + acrossStW >= cutY) {
      const n = Math.max(3, Math.floor(fft / 0.18));
      const run = Math.max(1.4, Math.min(st.d, n * 0.26));
      for (let i = 0; i < n; i++) {
        const x0 = along0 + (i * run) / n, y0 = (i * fft) / n;
        out.push({ t: "L", l: "MOBILIARIO", x1: x0, y1: y0, x2: x0 + run / n, y2: y0 });                          // huella
        out.push({ t: "L", l: "MOBILIARIO", x1: x0 + run / n, y1: y0, x2: x0 + run / n, y2: y0 + fft / n });      // contrahuella
      }
      out.push({ t: "L", l: "MOBILIARIO", x1: along0, y1: 0.95, x2: along0 + run, y2: fft + 0.05, thin: true });  // pasamanos
      out.push({ t: "T", l: "TEXTOS", x: along0 + run / 2 - 0.35, y: fft / 2, h: 0.14, s: "SUBE" });
    }
  }

  // Parapeto/remate superior (continúa el lenguaje de las fachadas).
  out.push({ t: "L", l: L, x1: 0, y1: totalH, x2: W, y2: totalH });
  out.push({ t: "L", l: L, x1: 0, y1: totalH + 0.45, x2: W, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: 0, y1: totalH, x2: 0, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: W, y1: totalH, x2: W, y2: totalH + 0.45 });

  // Ejes estructurales verticales proyectados (relación planta↔corte).
  for (const ax of plan.structure?.axes ?? []) {
    if (ax.orientation !== "vertical") continue;
    out.push({ t: "L", l: "EJES", x1: ax.at, y1: -1.2, x2: ax.at, y2: totalH + 0.8, dash: true });
    out.push({ t: "T", l: "EJES", x: ax.at - 0.08, y: totalH + 0.95, h: 0.2, s: ax.id });
  }

  // Cadenas de cotas VERTICALES (piso a piso + total) — Ching.
  const xd = W + 1.4;
  out.push({ t: "L", l: "COTAS", x1: xd, y1: 0, x2: xd, y2: totalH });
  for (let lvl = 1; lvl <= levels; lvl++) {
    out.push({ t: "L", l: "COTAS", x1: xd - 0.07, y1: lvl * fft - 0.07, x2: xd + 0.07, y2: lvl * fft + 0.07 });
    out.push({ t: "L", l: "COTAS", x1: xd - 0.12, y1: lvl * fft, x2: xd - 0.28, y2: lvl * fft, thin: true });
    out.push({ t: "T", l: "COTAS", x: xd + 0.18, y: (lvl - 0.5) * fft, h: 0.16, s: fmt(fft) });
  }
  out.push({ t: "L", l: "COTAS", x1: xd + 0.7, y1: 0, x2: xd + 0.7, y2: totalH });
  out.push({ t: "T", l: "COTAS", x: xd + 0.88, y: totalH / 2, h: 0.18, s: fmt(totalH), r: 90 });

  // Cota HORIZONTAL de los espacios cortados (cadena inferior — Plazola).
  dimChain("COTAS", [0, ...inner, W], -0.85, out);
  for (let i = 0; i < [0, ...inner, W].length - 1; i++) {
    const a = [0, ...inner, W][i], b = [0, ...inner, W][i + 1];
    if (b - a < 0.05) continue;
    out.push({ t: "T", l: "COTAS", x: (a + b) / 2 - 0.18, y: -0.78, h: 0.14, s: fmt(b - a) });
  }

  // Título + escala (Plazola: toda vista rotulada con escala).
  out.push({ t: "T", l: "TEXTOS", x: 0, y: totalH + 1.4, h: 0.26, s: opts.transverse ? "CORTE B-B'" : "CORTE A-A'" });
  return out;
}

function roomAt(plan: FloorPlan, name: string, level: number): (r: Room) => boolean {
  const key = name.toLowerCase().replace(/\s+/g, "");
  return (r) => r.level === level && r.name.toLowerCase().replace(/\s+/g, "") === key;
}

/** Burbuja de eje — círculo + letra (Ching: retícula con burbujas). */
function axisBubble(l: string, x: number, y: number, id: string, out: Prim[]) {
  out.push({ t: "C", l: "EJES", x, y, r: 0.28 });
  out.push({ t: "T", l: "EJES", x: x - 0.09, y: y + 0.09, h: 0.2, s: id });
  void l;
}

/** ── PLANTA como primitivas (para la LÁMINA compuesta). ─────────────────── */
export function plantaPrimitives(plan: FloorPlan, level = 0, opts: { den?: number } = {}): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const L = "MUROS";
  const rooms = plan.rooms.filter((r) => r.level === level);
  const doorsLvl = plan.doors.filter((d) => d.level === level);
  const winsLvl = plan.windows.filter((w) => w.level === level);
  out.push({ t: "H", l: L, x: 0, y: 0, w: W, h: D });

  // ── VANOS REALES (guía §2.3/§2.6): la planta es un CORTE — puertas y
  // ventanas son HUECOS en el muro con sus jambas, jamás símbolos pintados
  // sobre una banda continua. Cada banda de muro se construye RESTANDO el
  // intervalo del vano sobre su eje; el extremo de cada segmento es la
  // jamba. (Antes: banda sólida + puerta encima = vano "tapado".)
  const t = 0.12;
  const TOL = 0.13; // tolerancia línea de vano ↔ eje de banda
  type Band = { axis: "h" | "v"; c: number; a: number; b: number; th: number };
  const bands: Band[] = [
    { axis: "h", c: t / 2, a: 0, b: W, th: t },      // muro sur (cortado en A)
    { axis: "h", c: D - t / 2, a: 0, b: W, th: t },  // muro norte
    { axis: "v", c: t / 2, a: t, b: D - t, th: t },  // muro oeste
    { axis: "v", c: W - t / 2, a: t, b: D - t, th: t }, // muro este
  ];
  // Particiones interiores: bordes compartidos entre espacios (dedup).
  const seen = new Set<string>();
  for (const r of rooms) {
    for (const [ex1, ey1, ex2, ey2] of [
      [r.x, r.y, r.x + r.width, r.y], // sur
      [r.x, r.y + r.depth, r.x + r.width, r.y + r.depth], // norte
      [r.x, r.y, r.x, r.y + r.depth], // oeste
      [r.x + r.width, r.y, r.x + r.width, r.y + r.depth], // este
    ] as Array<[number, number, number, number]>) {
      const interior = ex1 > t && ex2 < W - t && ey1 > t && ey2 < D - t;
      const key = interior
        ? ex1 === ex2 ? `V:${ex1.toFixed(2)}:${Math.min(ey1, ey2)}:${Math.max(ey1, ey2)}`
        : `H:${ey1.toFixed(2)}:${Math.min(ex1, ex2)}:${Math.max(ex1, ex2)}`
        : null;
      if (!interior || !key || seen.has(key)) continue;
      seen.add(key);
      if (ex1 === ex2) bands.push({ axis: "v", c: ex1, a: Math.min(ey1, ey2), b: Math.max(ey1, ey2), th: 0.1 });
      else bands.push({ axis: "h", c: ey1, a: Math.min(ex1, ex2), b: Math.max(ex1, ex2), th: 0.1 });
    }
  }
  // Vano → intervalo a restar sobre la banda de su muro.
  const cuts: Array<{ axis: "h" | "v"; line: number; i0: number; i1: number }> = [];
  for (const d of doorsLvl) {
    cuts.push(d.axis === "y"
      ? { axis: "v", line: d.x, i0: d.y - d.width / 2, i1: d.y + d.width / 2 }
      : { axis: "h", line: d.y, i0: d.x - d.width / 2, i1: d.x + d.width / 2 });
  }
  for (const w of winsLvl) {
    const room = plan.rooms.find(roomAt(plan, w.room, level));
    if (!room) continue;
    if (w.wall === "norte" || w.wall === "sur") {
      const yy = w.wall === "norte" ? room.y + room.depth : room.y;
      cuts.push({ axis: "h", line: yy, i0: w.x - w.width / 2, i1: w.x + w.width / 2 });
    } else {
      const xx = w.wall === "este" ? room.x + room.width : room.x;
      cuts.push({ axis: "v", line: xx, i0: w.x - w.width / 2, i1: w.x + w.width / 2 });
    }
  }
  // Resta de intervalos → segmentos de muro (cada extremo = jamba del vano).
  const emit = (bd: Band, s: number, e: number) => {
    if (e - s <= 0.02) return;
    if (bd.axis === "h") out.push({ t: "F", l: L, x: s, y: bd.c - bd.th / 2, w: e - s, h: bd.th });
    else out.push({ t: "F", l: L, x: bd.c - bd.th / 2, y: s, w: bd.th, h: e - s });
  };
  for (const bd of bands) {
    const hits = cuts
      .filter((c) => c.axis === bd.axis && Math.abs(c.line - bd.c) <= TOL)
      .map((c) => [Math.max(bd.a, c.i0), Math.min(bd.b, c.i1)] as [number, number])
      .filter(([i0, i1]) => i1 - i0 > 0.02)
      .sort((p, q) => p[0] - q[0]);
    let cursor = bd.a;
    for (const [i0, i1] of hits) {
      emit(bd, cursor, i0);
      cursor = Math.max(cursor, i1);
    }
    emit(bd, cursor, bd.b);
  }
  // Centro de la banda donde vive una línea de vano (para el marco de la
  // ventana: el vidrio se dibuja DENTRO del hueco, al centro del muro).
  const bandCenter = (axis: "h" | "v", line: number): number | null => {
    const bd = bands.find((b) => b.axis === axis && Math.abs(line - b.c) <= TOL);
    return bd ? bd.c : null;
  };
  // ESCALERA (punto fijo de corte — curaduría exige cortes por escalera):
  // la caja viene de stairBox (fuente única: local "escalera" o heurística
  // del local más grande pegada al muro este). N1: vuelo completo con SUBE;
  // N2: llegada con línea de quiebre (el resto del vuelo queda por debajo).
  const st = stairBox(plan);
  if (st) {
    if (level === 0) {
      escalera(out, st.x, st.y, st.w, st.d, true);
    } else if (level === 1) {
      out.push({ t: "H", l: "MOBILIARIO", x: st.x, y: st.y, w: st.w, h: st.d });
      out.push({ t: "L", l: "MOBILIARIO", x1: st.x + 0.05, y1: st.y + st.d * 0.28, x2: st.x + st.w - 0.05, y2: st.y + st.d * 0.18, dash: true, thin: true });
      out.push({ t: "T", l: "TEXTOS", x: st.x + 0.05, y: st.y + st.d * 0.5, h: 0.13, s: "LLEGADA" });
    }
  }
  // Cajas de texto de cada espacio (nombre+área): las etiquetas de VANOS las
  // consultan para no montarse encima (guía §2.7: minimizar cruces/traslapes).
  const labelBoxes: Array<{ x: number; y: number; w: number; d: number }> = [];
  for (const r of rooms) {
    out.push({ t: "H", l: L, x: r.x, y: r.y, w: r.width, h: r.depth });
    const a = r.width * r.depth;
    // Etiqueta en hueco LIBRE (anti-tapado por mobiliario — Ching) y también
    // lejos de los SÍMBOLOS MEP de su cuarto (review #13: colisiones en
    // cocina/lavandería/baño del plano real de Guadua).
    const placed = furnishRoom(out, r, plan.doors.filter((d) => d.level === level), r.name.toLowerCase().includes("principal"));
    const mepObs = mepSymbols(plan, level)
      .filter((p) => p.x >= r.x - 0.35 && p.x <= r.x + r.width + 0.35 && p.y >= r.y - 0.35 && p.y <= r.y + r.depth + 0.35)
      .map((p) => ({ x: p.x - 0.35, y: p.y - 0.35, w: 0.7, d: 0.7, kind: "mep", wall: "C" as const }));
    // ── Texto a TAMAÑO DE PAPEL FINAL (guía §2.5): con la escala de lámina
    // conocida se MIDE si el nombre y la línea de área+cotas caben en el
    // ancho del espacio; si la línea no cabe, las cotas se retiran (área
    // sola); si el nombre tampoco cabe, parte en dos renglones. Sin den
    // (vista de pantalla) se mantiene el comportamiento histórico.
    const k = opts.den ? 1000 / opts.den : 0;
    const hFloor = opts.den ? 2.5 * opts.den / 1000 : 0; // piso papel → unidades de modelo
    const effH = (hModel: number) => Math.max(hModel, hFloor);
    const paperW = (s: string, hModel: number) => s.length * effH(hModel) * 0.7;
    const fits = (s: string, hModel: number) => !k || paperW(s, hModel) <= r.width * k - 2;
    const name = r.name.toUpperCase();
    const nameLines: string[] = fits(name, 0.14) || !name.includes(" ")
      ? [name]
      : name.split(/\s+/).reduce<string[][]>((acc, w) => {
          const last = acc[acc.length - 1];
          if (!last || (last.join(" ") + " " + w).length > Math.ceil(name.length / 2) + 2) acc.push([w]);
          else last.push(w);
          return acc;
        }, []).map((l) => l.join(" "));
    const dimsTxt = `${a.toFixed(1)} m² · ${fmt(r.width)}×${fmt(r.depth)}`;
    const areaOnly = `${a.toFixed(1)} m²`;
    const nRows = nameLines.length;
    const longestName = nameLines.reduce((a2, b2) => (b2.length > a2.length ? b2 : a2), "");
    const dTxt = 0.55 + (nRows - 1) * 0.26 + 0.1;
    // Escalera de degradación (determinista, sin colisiones): nombre+área+cotas
    // → nombre+área → nombre. Las cotas del espacio ya viven en las cadenas de
    // cota de la planta; si el cuarto está saturado, la etiqueta CEDE antes
    // que montarse sobre un símbolo o mueble (guía §2.7).
    const obstacles = placed.concat(mepObs);
    const trySpot = (line: string) => {
      const w = Math.max(paperW(longestName, 0.14), paperW(line, 0.11)) + 0.3;
      return { line, w, spot: labelSpot(r, obstacles, Math.min(w, r.width), dTxt) };
    };
    let chosen = trySpot(fits(dimsTxt, 0.11) ? dimsTxt : areaOnly);
    if (!chosen.spot) chosen = trySpot(areaOnly);
    if (!chosen.spot) {
      const w = paperW(longestName, 0.14) + 0.3;
      chosen = { line: "", w, spot: labelSpot(r, obstacles, Math.min(w, r.width), 0.4) };
    }
    const spot = chosen.spot ?? { x: r.x + r.width / 2, y: r.y + r.depth / 2 }; // saturación total: el nombre manda al centro
    const areaTxt = chosen.line;
    const wTxt = chosen.w;
    out.push(...nameLines.map((ln, i) => ({
      t: "T" as const, l: "TEXTOS",
      x: spot.x - (ln.length * 0.14 * 0.7) / 2, y: spot.y + 0.05 + (nRows - 1 - i) * 0.26,
      h: 0.14, s: ln,
    })));
    if (areaTxt) out.push({ t: "T", l: "TEXTOS", x: spot.x - (areaTxt.length * effH(0.11) * 0.7) / 2, y: spot.y - 0.18, h: 0.11, s: areaTxt });
    labelBoxes.push({ x: spot.x - wTxt / 2 - 0.05, y: spot.y - dTxt / 2, w: wTxt + 0.1, d: dTxt });
  }
  // (La cuadrícula cerámica de baños/cocina vivía AQUÍ en A-TEXTOS — fuera
  // del plano general: los acabados van en lámina propia A-06 con capa
  // A-ACABADOS-HATCH cuando exista; el plano arquitectónico queda LIMPIO.)
  // Ejes con burbujas + líneas dash-dot.
  for (const ax of plan.structure?.axes ?? []) {
    if (ax.orientation === "vertical") {
      out.push({ t: "L", l: "EJES", x1: ax.at, y1: -1.1, x2: ax.at, y2: D + 1.1, dash: true, thin: true });
      axisBubble("EJES", ax.at, D + 1.45, ax.id, out);
    } else {
      out.push({ t: "L", l: "EJES", x1: -1.1, y1: ax.at, x2: W + 1.1, y2: ax.at, dash: true, thin: true });
      axisBubble("EJES", -1.45, ax.at, ax.id, out);
    }
  }
  // ── COTAS PROFESIONALES (Ching §dimensioning / Plazola): DOS cadenas por
  // eje — la interior incluye JAMBS de vanos (la marca del plano pro: se
  // dimensiona dónde está cada puerta/ventana), la exterior solo
  // particiones, y la total cierra. Además: ancho de cada vano rotulado
  // y dim interior (ancho×fondo) en cada espacio.
  const sortUniq = (arr: number[]) => [...new Set(arr.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  // EJE X: jambs de vanos en muros horizontales (sur/norte) + bordes de espacios.
  const jambX: number[] = [];
  for (const d of doorsLvl) if (d.axis !== "y") jambX.push(d.x - d.width / 2, d.x + d.width / 2);
  for (const w of winsLvl) if (w.wall === "sur" || w.wall === "norte") jambX.push(w.x - w.width / 2, w.x + w.width / 2);
  const xsOpen = sortUniq([0, ...rooms.flatMap((r) => [r.x, r.x + r.width]), ...jambX, W].filter((v) => v >= -0.01 && v <= W + 0.01));
  const xsPart = sortUniq([0, ...rooms.flatMap((r) => [r.x, r.x + r.width]), W]);
  dimChain("COTAS", xsOpen, -0.55, out);   // cadena 1: particiones + vanos
  dimChain("COTAS", xsPart, -1.2, out);    // cadena 2: particiones
  out.push({ t: "L", l: "COTAS", x1: -1.85, y1: 0, x2: -1.85, y2: D });  // total
  out.push({ t: "L", l: "COTAS", x1: -1.92, y1: -0.07, x2: -1.78, y2: 0.07 });
  out.push({ t: "L", l: "COTAS", x1: -1.92, y1: D - 0.07, x2: -1.78, y2: D + 0.07 });
  out.push({ t: "T", l: "COTAS", x: -1.8, y: D / 2, h: 0.18, s: fmt(D), r: 90 });
  for (let i = 0; i < xsPart.length - 1; i++) {
    const seg = xsPart[i + 1] - xsPart[i];
    if (seg > 0.55) out.push({ t: "T", l: "COTAS", x: (xsPart[i] + xsPart[i + 1]) / 2 - 0.16, y: -1.13, h: 0.12, s: fmt(seg) });
  }

  // EJE Y: jambs de vanos en muros verticales (este/oeste) + bordes.
  const jambY: number[] = [];
  for (const d of doorsLvl) if (d.axis === "y") jambY.push(d.y - d.width / 2, d.y + d.width / 2);
  for (const w of winsLvl) if (w.wall === "este" || w.wall === "oeste") jambY.push(w.x - w.width / 2, w.x + w.width / 2);
  const ysOpen = sortUniq([0, ...rooms.flatMap((r) => [r.y, r.y + r.depth]), ...jambY, D].filter((v) => v >= -0.01 && v <= D + 0.01));
  const ysPart = sortUniq([0, ...rooms.flatMap((r) => [r.y, r.y + r.depth]), D]);
  const chainY = (ys: number[], x: number) => {
    out.push({ t: "L", l: "COTAS", x1: x, y1: ys[0], x2: x, y2: ys[ys.length - 1] });
    for (const yv of ys) {
      out.push({ t: "L", l: "COTAS", x1: x - 0.07, y1: yv - 0.07, x2: x + 0.07, y2: yv + 0.07 });
      out.push({ t: "L", l: "COTAS", x1: x - 0.12, y1: yv, x2: x - 0.3, y2: yv, thin: true });
    }
  };
  chainY(ysOpen, -0.55);
  chainY(ysPart, -1.2);
  chainY([0, D], -1.85);
  out.push({ t: "T", l: "COTAS", x: -2.32, y: D / 2, h: 0.16, s: fmt(D), r: 90 });
  out.push({ t: "T", l: "COTAS", x: W / 2 - 0.22, y: -1.75, h: 0.18, s: fmt(W) });
  for (let i = 0; i < ysPart.length - 1; i++) {
    const seg = ysPart[i + 1] - ysPart[i];
    if (seg > 0.55) out.push({ t: "T", l: "COTAS", x: -1.14, y: (ysPart[i] + ysPart[i + 1]) / 2, h: 0.12, s: fmt(seg), r: 90 });
  }

  // Ancho de cada VANO rotulado junto a su símbolo (convención: cota del
  // vano). Escalera de offsets determinista (interior cerca → lejos →
  // exterior) que esquiva etiquetas de espacio, símbolos MEP y TODAS las
  // cotas de vano ya puestas — puertas Y ventanas comparten el registro
  // (antes ambas caían al lado exterior sin mirarse: colisión medida por
  // el QA cuando puerta y ventana sirven el mismo muro).
  const sideTo = (wallY: number, room?: Room) => (room ? (room.y + room.depth / 2 >= wallY ? 1 : -1) : 1);
  const mepBoxes = mepSymbols(plan, level).map((p) => ({ x: p.x - 0.3, y: p.y - 0.3, w: 0.6, d: 0.6 }));
  const obstacles = [...labelBoxes, ...mepBoxes];
  const hits = (cx: number, cy: number) =>
    obstacles.some((b) => cx + 0.35 > b.x && cx - 0.35 < b.x + b.w && cy + 0.16 > b.y && cy - 0.16 < b.y + b.d);
  const vanoTags: Array<{ x: number; y: number }> = [];
  const tagFree = (x: number, y: number) =>
    !hits(x, y) && !vanoTags.some((t) => Math.abs(t.y - y) < 0.18 && Math.abs(t.x - x) < 0.7);
  const OFFSETS = [0.32, 0.52, 0.74, -0.38, -0.58, -0.8];
  const placeVanoTag = (x: number, wallY: number, dir: number, width: number) => {
    let y = wallY + dir * 0.32;
    for (const o of OFFSETS) {
      if (tagFree(x, wallY + dir * o)) { y = wallY + dir * o; break; }
    }
    vanoTags.push({ x, y });
    out.push({ t: "T", l: "COTAS", x: x - 0.18, y, h: 0.13, s: fmt(width) });
  };
  for (const d of doorsLvl) {
    if (d.axis === "y") continue;
    const to = plan.rooms.find(roomAt(plan, d.to, level));
    placeVanoTag(d.x, d.y, sideTo(d.y, to), d.width);
  }
  for (const w of winsLvl) {
    if (w.wall !== "sur" && w.wall !== "norte") continue;
    const room = plan.rooms.find(roomAt(plan, w.room, level));
    if (!room) continue;
    const yy = w.wall === "norte" ? room.y + room.depth : room.y;
    placeVanoTag(w.x, yy, sideTo(yy, room), w.width);
  }

  // Dim INTERIOR de cada espacio (ancho×fondo) bajo el área — lo primero
  // que lee el constructor (Neufert).
  // (dims interiores fusionadas con la etiqueta de área arriba)
  // Marca de nivel +0.00 del piso terminado.
  levelMark("TEXTOS", W * 0.45, D * 0.12, out, "+0.00");
  // Ventanas (triple línea) y puertas (hoja + arco — Ching). El marco de
  // la ventana se dibuja al CENTRO del muro (dentro del hueco recortado).
  for (const w of plan.windows.filter((x) => x.level === level)) {
    const room = plan.rooms.find(roomAt(plan, w.room, level));
    if (!room) continue;
    if (w.wall === "norte" || w.wall === "sur") {
      const yy = w.wall === "norte" ? room.y + room.depth : room.y;
      const yc = bandCenter("h", yy) ?? yy;
      for (const off of [-0.03, 0, 0.03]) out.push({ t: "L", l: "VENTANAS", x1: w.x - w.width / 2, y1: yc + off, x2: w.x + w.width / 2, y2: yc + off });
    } else {
      const xx = w.wall === "este" ? room.x + room.width : room.x;
      const xc = bandCenter("v", xx) ?? xx;
      for (const off of [-0.03, 0, 0.03]) out.push({ t: "L", l: "VENTANAS", x1: xc + off, y1: w.x - w.width / 2, x2: xc + off, y2: w.x + w.width / 2 });
    }
  }
  for (const d of plan.doors.filter((x) => x.level === level)) {
    // Geometría DERIVADA (axis/swingDir del sanitizador): vano sobre su muro,
    // hoja perpendicular al interior, cuerda de giro discontinua (Ching).
    const isY = d.axis === "y";
    const sd = d.swingDir ?? 1;
    const half = d.width / 2;
    const o1: [number, number] = isY ? [d.x, d.y - half] : [d.x - half, d.y];
    const o2: [number, number] = isY ? [d.x, d.y + half] : [d.x + half, d.y];
    const hg: [number, number] = d.hinge === "left" ? o1 : o2;
    const tip: [number, number] = isY ? [hg[0] + d.width * sd, hg[1]] : [hg[0], hg[1] + d.width * sd];
    out.push({ t: "L", l: "PUERTAS", x1: o1[0], y1: o1[1], x2: o2[0], y2: o2[1] });
    out.push({ t: "L", l: "PUERTAS", x1: hg[0], y1: hg[1], x2: tip[0], y2: tip[1] });
    out.push({ t: "L", l: "PUERTAS", x1: tip[0], y1: tip[1], x2: o2[0], y2: o2[1], dash: true, thin: true });
  }
  // Marcas de CORTE A-A' y B-B' sobre la planta (Ching: triángulos + letras).
  // Posición desde cutLines (fuente única): la marca y el corte dibujado en
  // A-02 pasan por la MISMA línea — POR LA ESCALERA cuando existe.
  const cutMark = (label: [string, string], x1: number, y1: number, x2: number, y2: number) => {
    out.push({ t: "L", l: "CORTE", x1, y1, x2, y2, dash: true, thin: true });
    const mk = (lb: string, px: number, py: number, dx: number, dy: number) => {
      out.push({ t: "F", l: "CORTE", x: px - 0.16 + dx * 0.3, y: py - 0.16, w: 0.32, h: 0.1 });
      out.push({ t: "T", l: "CORTE", x: px + dx * 0.4, y: py + 0.12, h: 0.2, s: lb });
    };
    mk(label[0], x1, y1, -0.1, 0);
    mk(label[1], x2, y2, 0.1, 0);
  };
  const cutPos = cutLines(plan);
  cutMark(["A", "A'"], -0.7, cutPos.longY, W + 0.7, cutPos.longY);
  cutMark(["B", "B'"], cutPos.transX, -0.7, cutPos.transX, D + 0.7);
  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 2.1, h: 0.22, s: plan.levels > 1 ? `PLANTA NIVEL ${level + 1}` : "PLANTA ARQUITECTÓNICA" });
  return out;
}

/** ── LOCALIZACIÓN DEL PROYECTO (lámina A-00 del primer paquete): el
 *  revisor de curaduría ubica la obra en su contexto urbano antes de leer
 *  una planta. ESQUEMA determinista — manzana, lote (envolvente del
 *  proyecto), vías, acceso y norte; datos de la ficha de sitio cuando
 *  existen. No es cartografía: verificación contra el amojonamiento real. */
export function localizacionPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const pad = 1.5, vw = 1.4;
  // MANZANA (contexto urbano) y VÍAS al sur y occidente (esquema).
  // Ejes de vía (contexto urbano, NO son cotas — MOBILIARIO para no mentirle
  // al QA de escala, que lee la cota vertical A-COTAS más larga).
  out.push({ t: "H", l: "MOBILIARIO", x: -pad, y: -pad, w: W + pad * 2, h: D + pad * 2 });
  out.push({ t: "H", l: "MOBILIARIO", x: -pad - vw, y: -pad - vw, w: W + pad * 2 + vw * 2, h: vw });
  out.push({ t: "H", l: "MOBILIARIO", x: -pad - vw, y: -pad, w: vw, h: D + pad * 2 });
  out.push({ t: "L", l: "MOBILIARIO", x1: -pad - vw, y1: -pad - vw / 2, x2: W + pad + vw, y2: -pad - vw / 2, dash: true, thin: true });
  out.push({ t: "T", l: "TEXTOS", x: W / 2 - 0.8, y: -pad - vw / 2 + 0.08, h: 0.2, s: "VÍA" });
  out.push({ t: "L", l: "MOBILIARIO", x1: -pad - vw / 2, y1: -pad, x2: -pad - vw / 2, y2: D + pad, dash: true, thin: true });
  out.push({ t: "T", l: "TEXTOS", x: -pad - vw / 2 + 0.08, y: D / 2 + 0.8, h: 0.2, s: "VÍA", r: 90 });
  // LOTE — la envolvente del proyecto al centro de la manzana.
  out.push({ t: "H", l: "MUROS", x: 0, y: 0, w: W, h: D });
  out.push({ t: "T", l: "TEXTOS", x: W / 2 - 2.2, y: D / 2 + 0.1, h: 0.22, s: "LOTE / PROYECTO" });
  // ACCESO desde la vía sur al centro del lote.
  const ax = W / 2;
  out.push({ t: "L", l: "PUERTAS", x1: ax, y1: -pad - vw + 0.1, x2: ax, y2: -0.05 });
  out.push({ t: "L", l: "PUERTAS", x1: ax - 0.18, y1: -0.35, x2: ax, y2: -0.05 });
  out.push({ t: "L", l: "PUERTAS", x1: ax + 0.18, y1: -0.35, x2: ax, y2: -0.05 });
  out.push({ t: "T", l: "TEXTOS", x: ax + 0.15, y: -pad - vw + 0.45, h: 0.16, s: "ACCESO" });
  // NORTE (misma convención de las plantas, §2.10).
  const nx = W + pad - 0.15, ny = D + pad - 0.15;
  out.push({ t: "L", l: "TEXTOS", x1: nx, y1: ny - 0.95, x2: nx, y2: ny, thin: true });
  out.push({ t: "L", l: "TEXTOS", x1: nx - 0.2, y1: ny - 0.3, x2: nx, y2: ny, thin: true });
  out.push({ t: "L", l: "TEXTOS", x1: nx + 0.2, y1: ny - 0.3, x2: nx, y2: ny, thin: true });
  out.push({ t: "T", l: "TEXTOS", x: nx + 0.1, y: ny - 0.45, h: 0.2, s: "N" });
  // Cotas del lote (frente × fondo) — el revisor las coteja con el POT.
  out.push({ t: "L", l: "COTAS", x1: 0, y1: D + 0.55, x2: W, y2: D + 0.55, thin: true });
  out.push({ t: "T", l: "COTAS", x: W / 2 - 0.4, y: D + 0.62, h: 0.16, s: fmt(W) });
  out.push({ t: "L", l: "COTAS", x1: W + 0.55, y1: 0, x2: W + 0.55, y2: D, thin: true });
  out.push({ t: "T", l: "COTAS", x: W + 0.65, y: D / 2, h: 0.16, s: fmt(D), r: 90 });
  // Datos del sitio (ficha del urbanista) — coordenadas cuando existen.
  const s = plan.site;
  const x0 = -pad - vw;
  let dy = -pad - vw - 0.6;
  out.push({ t: "T", l: "TEXTOS", x: x0, y: dy, h: 0.24, s: "LOCALIZACIÓN DEL PROYECTO" });
  dy -= 0.4;
  const cityLine = s?.city ? `${s.city.toUpperCase()}${s.department ? " · " + s.department.toUpperCase() : ""}` : "VERIFICAR MUNICIPIO";
  out.push({ t: "T", l: "TEXTOS", x: x0, y: dy, h: 0.17, s: cityLine });
  if (typeof s?.latitude === "number" && typeof s?.longitude === "number") {
    dy -= 0.34;
    out.push({ t: "T", l: "TEXTOS", x: x0, y: dy, h: 0.17, s: `N ${Math.abs(s.latitude).toFixed(4)} · ${s.longitude < 0 ? "O" : "E"} ${Math.abs(s.longitude).toFixed(4)}` });
  }
  dy -= 0.34;
  out.push({ t: "T", l: "TEXTOS", x: x0, y: dy, h: 0.14, s: "ESQUEMA — VERIFICAR AMOJONAMIENTO EN TERRENO" });
  return out;
}

/** ── TABLA DE ÁREAS dibujada (cuadro de áreas de la lámina). ────────────── */
export function areaTablePrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const L = "TEXTOS";
  const rows = plan.rooms.map((r) => ({ name: r.name, lvl: r.level, area: r.width * r.depth }));
  const total = rows.reduce((s, r) => s + r.area, 0);
  const w = 4.6, rowH = 0.36, headerH = 0.4;
  const h = headerH + (rows.length + 1) * rowH + 0.15;
  // Marco + cabecera.
  out.push({ t: "H", l: L, x: 0, y: -h, w, h });
  out.push({ t: "L", l: L, x1: 0, y1: -headerH, x2: w, y2: -headerH });
  out.push({ t: "T", l: L, x: 0.15, y: -headerH + 0.12, h: 0.14, s: "CUADRO DE ÁREAS" });
  out.push({ t: "L", l: L, x1: 3.1, y1: 0, x2: 3.1, y2: -h });
  out.push({ t: "L", l: L, x1: 4.0, y1: 0, x2: 4.0, y2: -h });
  // Filas — nombre COMPLETO en hasta 2 renglones (jamás truncado: QA plot).
  rows.slice(0, 18).forEach((r, i) => {
    const y = -headerH - (i + 1) * rowH + 0.1;
    const nm = r.name.toUpperCase();
    const words = nm.split(/\s+/);
    let l1 = nm, l2 = "";
    if (nm.length > 20 && words.length > 1) {
      let acc = "";
      for (const wd of words) {
        if ((acc + " " + wd).trim().length > 20 && acc) { l2 = nm.slice(acc.length + 1); l1 = acc; break; }
        acc = (acc + " " + wd).trim();
      }
    }
    out.push({ t: "T", l: L, x: 0.15, y: l2 ? y + 0.13 : y, h: l2 ? 0.09 : 0.11, s: l1 });
    if (l2) out.push({ t: "T", l: L, x: 0.15, y: y - 0.08, h: 0.09, s: l2 });
    out.push({ t: "T", l: L, x: 3.25, y, h: 0.11, s: String(r.lvl + 1) });
    out.push({ t: "T", l: L, x: 4.1, y, h: 0.11, s: r.area.toFixed(2) });
  });
  const yT = -headerH - (rows.length + 1) * rowH + 0.1;
  out.push({ t: "L", l: L, x1: 0, y1: -headerH - rows.length * rowH, x2: w, y2: -headerH - rows.length * rowH });
  out.push({ t: "T", l: L, x: 0.15, y: yT, h: 0.12, s: "TOTAL" });
  out.push({ t: "T", l: L, x: 4.1, y: yT, h: 0.12, s: total.toFixed(2) });
  return out;
}

/** ── FACHADA — proyección del lado indicado (N/S/E/W) ───────────────────── */
export function facadePrimitives(plan: FloorPlan, side: WallSide): Prim[] {
  const out: Prim[] = [];
  const L = `FACHADA-${side.toUpperCase()}`;
  const { width: W, depth: D } = plan.outline;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  const totalH = fft * levels;
  const facadeW = side === "norte" || side === "sur" ? W : D;

  // Envolvente + líneas de nivel + parapeto (remate superior).
  out.push({ t: "H", l: L, x: 0, y: 0, w: facadeW, h: totalH });
  out.push({ t: "L", l: L, x1: -0.1, y1: totalH + 0.45, x2: facadeW + 0.1, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: -0.1, y1: totalH, x2: -0.1, y2: totalH + 0.45 });
  out.push({ t: "L", l: L, x1: facadeW + 0.1, y1: totalH, x2: facadeW + 0.1, y2: totalH + 0.45 });
  for (let lvl = 1; lvl < levels; lvl++) {
    out.push({ t: "L", l: L, x1: 0, y1: lvl * fft, x2: facadeW, y2: lvl * fft });
  }

  // TEXTURA de mampostería/pañete (Ching elevaciones): tramas finas
  // desfasadas — se dibujan ANTES de vanos y zócalo para quedar de fondo.
  const rowH = 0.45, tickW = 0.5;
  for (let row = 0; row * rowH < totalH; row++) {
    const y = row * rowH;
    const off = row % 2 === 0 ? 0 : tickW / 2; // aparejo corrido (desfasado)
    for (let x = off; x < facadeW; x += tickW) {
      // Solo el cuerpo del muro (evita saturar): 1 tick por celda.
      out.push({ t: "L", l: L, x1: x + 0.08, y1: y + rowH * 0.3, x2: x + 0.28, y2: y + rowH * 0.3, thin: true });
    }
  }

  // ZÓCALO base (banda maciza — Ching: la línea de mayor peso visual).
  out.push({ t: "F", l: L, x: 0, y: 0, w: facadeW, h: 0.15 });
  out.push({ t: "L", l: L, x1: -0.4, y1: 0, x2: facadeW + 0.4, y2: 0 });

  // Suelo con rayado.
  out.push({ t: "L", l: L, x1: -0.4, y1: -0.25, x2: facadeW + 0.4, y2: -0.25 });
  for (let i = 0; i < Math.ceil((facadeW + 1) / 0.3); i++) {
    const x = -0.4 + i * 0.3;
    out.push({ t: "L", l: L, x1: x, y1: -0.25, x2: x - 0.15, y2: -0.45, thin: true });
  }

  // Marcas de nivel en TODOS los pisos (Ching).
  for (let lvl = 0; lvl <= levels; lvl++) levelMark(L, -1.1, lvl * fft, out, `+${fmt(lvl * fft)}`);

  const horizontal = side === "norte" || side === "sur";

  // Ventanas proyectadas: las de espacios cuyo borde en `side` coincide con
  // la envolvente del edificio (aparecen en la fachada real).
  for (const w of plan.windows) {
    if (w.wall !== side) continue;
    const room = plan.rooms.find(roomAt(plan, w.room, w.level));
    if (!room) continue;
    const edgePos = side === "norte" ? room.y + room.depth : side === "sur" ? room.y : side === "este" ? room.x + room.width : room.x;
    const buildingEdge = side === "norte" ? D : side === "sur" ? 0 : side === "este" ? W : 0;
    if (Math.abs(edgePos - buildingEdge) > 0.35) continue; // ventana interior, no da a fachada
    const z0 = w.level * fft;
    const x = w.x;
    const wx = x - w.width / 2, wy = z0 + w.sill;
    // Marco doble + cruz de paños — convención gráfica (Ching).
    out.push({ t: "H", l: L, x: wx, y: wy, w: w.width, h: w.height });
    out.push({ t: "H", l: L, x: wx + 0.06, y: wy + 0.06, w: w.width - 0.12, h: w.height - 0.12 });
    out.push({ t: "L", l: L, x1: wx + 0.06, y1: z0 + w.sill + w.height / 2, x2: wx + w.width - 0.06, y2: z0 + w.sill + w.height / 2 });
    out.push({ t: "L", l: L, x1: x, y1: wy + 0.06, x2: x, y2: wy + w.height - 0.06 });
    // VIDRIO: 2 diagonales finas por paño (Ching: reflejo del vidrio).
    const paneW = w.width / 2;
    out.push({ t: "L", l: L, x1: wx + 0.09, y1: wy + 0.09, x2: wx + paneW - 0.04, y2: wy + w.height - 0.09, thin: true });
    out.push({ t: "L", l: L, x1: wx + paneW + 0.04, y1: wy + 0.09, x2: wx + w.width - 0.09, y2: wy + w.height - 0.09, thin: true });
    // Antepecho proyectado (ledgerilla) + dintel marcado.
    out.push({ t: "L", l: L, x1: x - w.width / 2 - 0.07, y1: z0 + w.sill - 0.05, x2: x + w.width / 2 + 0.07, y2: z0 + w.sill - 0.05 });
    out.push({ t: "L", l: L, x1: wx, y1: wy + w.height + 0.1, x2: wx + w.width, y2: wy + w.height + 0.1, thin: true });
  }

  // Puerta principal (conecta con "exterior") — lado por su EJE derivado.
  for (const d of plan.doors) {
    if (d.from !== "exterior" && d.to !== "exterior") continue;
    let doorSide: WallSide | null = null;
    if (d.axis !== "y") {
      if (d.y < 0.35) doorSide = "sur";
      else if (d.y > D - 0.35) doorSide = "norte";
    } else {
      if (d.x < 0.35) doorSide = "oeste";
      else if (d.x > W - 0.35) doorSide = "este";
    }
    if (doorSide !== side) continue;
    const pos = horizontal ? d.x : d.y;
    const px = pos - d.width / 2, py = d.level * fft;
    out.push({ t: "H", l: L, x: px, y: py, w: d.width, h: DOOR_H });
    out.push({ t: "L", l: L, x1: px, y1: py + DOOR_H + 0.1, x2: px + d.width, y2: py + DOOR_H + 0.1 }); // dintel
    // Hoja entreabierta + PANELES interiores + MANIJA (Neufert/Panero).
    out.push({ t: "L", l: L, x1: px, y1: py, x2: px - d.width * 0.45, y2: py + DOOR_H * 0.5 });
    out.push({ t: "H", l: L, x: px + d.width * 0.2, y: py + DOOR_H * 0.25, w: d.width * 0.6, h: DOOR_H * 0.2 });
    out.push({ t: "H", l: L, x: px + d.width * 0.2, y: py + DOOR_H * 0.6, w: d.width * 0.6, h: DOOR_H * 0.2 });
    out.push({ t: "F", l: L, x: px + d.width * 0.82, y: py + DOOR_H * 0.45, w: 0.05, h: 0.05 });
  }

  // BAJANTE hidráulica en el extremo derecho (RAS — siempre en fachada).
  out.push({ t: "L", l: L, x1: facadeW - 0.12, y1: -0.1, x2: facadeW - 0.12, y2: totalH + 0.3, thin: true });
  out.push({ t: "L", l: L, x1: facadeW - 0.2, y1: -0.1, x2: facadeW - 0.2, y2: totalH + 0.3, thin: true });

  // Cota vertical TOTAL a la derecha (Plazola: toda fachada acotada).
  const xd = facadeW + 0.9;
  out.push({ t: "L", l: "COTAS", x1: xd, y1: 0, x2: xd, y2: totalH });
  out.push({ t: "L", l: "COTAS", x1: xd - 0.07, y1: -0.07, x2: xd + 0.07, y2: 0.07 });
  out.push({ t: "L", l: "COTAS", x1: xd - 0.07, y1: totalH - 0.07, x2: xd + 0.07, y2: totalH + 0.07 });
  out.push({ t: "T", l: "COTAS", x: xd + 0.18, y: totalH / 2, h: 0.18, s: fmt(totalH), r: 90 });

  // Título de la fachada + escala.
  out.push({ t: "T", l: "TEXTOS", x: 0, y: -1.0, h: 0.24, s: `FACHADA ${side.toUpperCase()}` });
  return out;
}

/** Bounds de un conjunto de primitivas (para viewBox/fit). */
export function primsBounds(prims: Prim[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const see = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.t === "L") { see(p.x1, p.y1); see(p.x2, p.y2); }
    else if (p.t === "T") { see(p.x, p.y); see(p.x + p.s.length * p.h * 0.7, p.y + p.h); }
    else if (p.t === "C") { see(p.x - p.r, p.y - p.r); see(p.x + p.r, p.y + p.r); }
    else { see(p.x, p.y); see(p.x + p.w, p.y + p.h); }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { minX, minY, maxX, maxY };
}

/** Bounds de un conjunto de primitivas con el TEXTO YA CLAMPADO al piso de
 *  papel (2.5 mm) a la escala `den` — rotación-aware. Es la MISMA medida que
 *  usa fitSheetScale: componer y medir fill con cualquier otra daría mentiras. */
export function floorBounds(prims: Prim[], den: number) {
  const floor = 2.5 * den / 1000; // piso de texto en unidades de modelo
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const see = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.t === "L") { see(p.x1, p.y1); see(p.x2, p.y2); }
    else if (p.t === "T") {
      const h = Math.max(p.h, floor);
      if ((p.r ?? 0) === 90) { see(p.x - h, p.y - 0.05); see(p.x, p.y + p.s.length * h * 0.7); }
      else { see(p.x, p.y); see(p.x + p.s.length * h * 0.7, p.y + h); }
    }
    else if (p.t === "C") { see(p.x - p.r, p.y - p.r); see(p.x + p.r, p.y + p.r); }
    else { see(p.x, p.y); see(p.x + p.w, p.y + p.h); }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { minX, minY, maxX, maxY };
}

/** ── Escala de lámina con TAMAÑOS DE PAPEL FINALES ──────────────────────────
 *  Elige el denominador de la serie normalizada (50…200) contra el área
 *  imprimible, pero midiéndolo con los bounds DEL TEXTO YA AGRANDADO al
 *  piso de 2.5 mm impresos (rotación-aware: r=90 intercambia ejes). Así el
 *  clamp de anotación nunca desborda la lámina ni elige una escala que no
 *  cabe después de agrandar. Único punto de decisión para PDF y DXF. */
export function fitSheetScale(prims: Prim[], availW: number, availH: number): number {
  // Serie con 1:250 REAL: el último candidato se COMPRUEBA igual que los
  // demás; si ni ese cabe, se devuelve y el QA de plot reporta el desborde
  // (entidad fuera del marco interior) — nunca un "cabe" en silencio.
  for (const den of [50, 75, 100, 125, 150, 200, 250]) {
    const b = floorBounds(prims, den);
    const sx = b.maxX - b.minX, sy = b.maxY - b.minY;
    if (sx * (1000 / den) <= availW && sy * (1000 / den) <= availH) return den;
  }
  return 250;
}

// ── SIMBOLOGÍA MEP (RETIE eléctrico / RAS hidrosanitario) ───────────────────
// Tablas canónicas de símbolos: [inicial corta, descripción]. Viven AQUÍ
// (no en dxf.ts) para que la leyenda y el plano compartan fuente única.

export const ELEC_SYMBOLS: Record<string, [string, string]> = {
  tomacorriente: ["T", "Tomacorriente"],
  tomacorriente_especial: ["TE", "Tomacorriente especial"],
  interruptor: ["I", "Interruptor"],
  iluminacion: ["L", "Punto de iluminación"],
  tablero: ["TB", "Tablero eléctrico"],
};

export const HYDRO_SYMBOLS: Record<string, [string, string]> = {
  lavamanos: ["LM", "Lavamanos"],
  sanitario: ["SA", "Sanitario"],
  ducha: ["DU", "Ducha"],
  lavaplatos: ["LP", "Lavaplatos"],
  lavadero: ["LD", "Lavadero"],
  calentador: ["CA", "Calentador"],
  punto_hidraulico: ["PH", "Punto hidráulico"],
};

/** ── LEYENDA MEP: los círculos del plano, explicados (guía §Símbolos) ──────
 *  Dos columnas (ELÉCTRICO / HIDRÁULICO) con símbolo + descripción de cada
 *  tipo REALMENTE presente en el nivel. Sólo los que están en el plano. */
export function mepLegendPrimitives(plan: FloorPlan, level = 0): Prim[] {
  const out: Prim[] = [];
  const elec = [...new Set((plan.electrical?.points ?? []).filter((p) => p.level === level).map((p) => p.kind))];
  const hyd = [...new Set((plan.hydro?.points ?? []).filter((p) => p.level === level).map((p) => p.kind))];
  if (elec.length === 0 && hyd.length === 0) return out;
  const RH = 0.34;              // alto de fila
  const CW = 3.5;               // ancho de columna
  const rows = Math.max(elec.length, hyd.length);
  const Ht = 0.62 + rows * RH;  // banda título + columnas
  const Wt = 2 * CW + 0.3;
  out.push({ t: "H", l: "TEXTOS", x: 0, y: 0, w: Wt, h: Ht });
  out.push({ t: "T", l: "TEXTOS", x: 0.12, y: Ht - 0.3, h: 0.16, s: "SIMBOLOGÍA MEP · RETIE / RAS" });
  out.push({ t: "L", l: "TEXTOS", x1: 0, y1: Ht - 0.42, x2: Wt, y2: Ht - 0.42, thin: true });
  const col = (kinds: string[], cx: number, SYM: Record<string, [string, string]>, header: string, lay: string) => {
    if (kinds.length === 0) return;
    out.push({ t: "T", l: "TEXTOS", x: cx, y: Ht - 0.68, h: 0.13, s: header });
    kinds.forEach((k, i) => {
      const [sym, desc] = SYM[k] ?? ["?", k];
      const y = Ht - 1.02 - i * RH;
      out.push({ t: "C", l: lay, x: cx + 0.14, y: y + 0.07, r: 0.1 });
      out.push({ t: "T", l: "TEXTOS", x: cx + 0.04, y: y - 0.005, h: 0.1, s: sym });
      out.push({ t: "T", l: "TEXTOS", x: cx + 0.46, y: y + 0.005, h: 0.11, s: desc.toUpperCase().slice(0, 24) });
    });
  };
  col(elec, 0.12, ELEC_SYMBOLS, "ELÉCTRICO", "ELECTRICO");
  col(hyd, CW + 0.22, HYDRO_SYMBOLS, "HIDRÁULICO", "HIDROSANITARIO");
  return out;
}

/** ── SÍMBOLOS MEP RESUELTOS (fuente única plano/etiquetas/leyenda) ──────────
 *  Los puntos del JSON tal cual pueden amontonarse (dos tomacorrientes a
 *  10 cm, tablero sobre interruptor…). Este solver determinista separa pares
 *  demasiado cercanos (radio+radio+holgura) empujándolos por el eje de mayor
 *  separación, con clamp al local que los contiene — el plano jamás dibuja
 *  dos círculos superpuestos. */
export type MepSymbol = { x: number; y: number; r: number; letter: string; kind: string; disc: "E" | "H" };

export function mepSymbols(plan: FloorPlan, level = 0): MepSymbol[] {
  const raw: MepSymbol[] = [];
  for (const p of plan.electrical?.points ?? []) {
    if (p.level !== level) continue;
    raw.push({ x: p.x, y: p.y, r: 0.1, letter: (ELEC_SYMBOLS[p.kind] ?? ["?"])[0], kind: p.kind, disc: "E" });
  }
  for (const p of plan.hydro?.points ?? []) {
    if (p.level !== level) continue;
    raw.push({ x: p.x, y: p.y, r: 0.11, letter: (HYDRO_SYMBOLS[p.kind] ?? ["H"])[0], kind: p.kind, disc: "H" });
  }
  const roomOf = (x: number, y: number) =>
    plan.rooms.find((r) => r.level === level && x >= r.x - 0.2 && x <= r.x + r.width + 0.2 && y >= r.y - 0.2 && y <= r.y + r.depth + 0.2);
  const clamp = (s: MepSymbol, room: Room | undefined) => {
    if (!room) return;
    s.x = Math.min(Math.max(s.x, room.x + 0.12), room.x + room.width - 0.12);
    s.y = Math.min(Math.max(s.y, room.y + 0.12), room.y + room.depth - 0.12);
  };
  for (let sweep = 0; sweep < 8; sweep++) {
    let moved = false;
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const a = raw[i], b = raw[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.r + b.r + 0.14;
        if (dx * dx + dy * dy >= minD * minD) continue;
        const s = 0.05;
        if (Math.abs(dx) >= Math.abs(dy)) {
          const dir = dx >= 0 ? 1 : -1;
          a.x -= dir * s; b.x += dir * s;
        } else {
          const dir = dy >= 0 ? 1 : -1;
          a.y -= dir * s; b.y += dir * s;
        }
        clamp(a, roomOf(a.x, a.y));
        clamp(b, roomOf(b.x, b.y));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return raw;
}

/** ── PLANTA DE ACABADOS (lámina A-06): el MISMO muro del plano general ──────
 *  (bandas con jambas reales de plantaPrimitives, capa MUROS) + trama de
 *  piso por espacio en A-ACABADOS: cerámica 30×30 en húmedos, tablones de
 *  madera en secos (espaciado real de modelo con piso de papel). El plano
 *  general queda LIMPIO: los acabados viven en SU lámina y SU capa (guía
 *  §2.4 + ISO 13567 — apagar A-ACABados apaga TODO acabado). */
export function acabadosPrimitives(plan: FloorPlan, level = 0, opts: { den?: number; legend?: "below" | "side" } = {}): Prim[] {
  const walls = plantaPrimitives(plan, level, opts).filter((p) => p.l === "MUROS" && p.t !== "T");
  const out: Prim[] = [...walls];
  const AC = "ACABADOS";
  const floorM = (paperMinMm: number, modelM: number) => Math.max(modelM, (paperMinMm / 1000) * (opts.den ?? 75));
  const FINISH: Record<string, { piso: string; trama: "ceramica" | "madera" | "liso" }> = {
    bano: { piso: "Cerámica 30×30 antideslizante", trama: "ceramica" },
    cocina: { piso: "Cerámica 45×45", trama: "ceramica" },
    lavanderia: { piso: "Cerámica 30×30", trama: "ceramica" },
    habitacion: { piso: "Laminado madera 8 mm", trama: "madera" },
    habitacion_principal: { piso: "Laminado madera 8 mm", trama: "madera" },
    sala: { piso: "Laminado madera 8 mm", trama: "madera" },
    comedor: { piso: "Laminado madera 8 mm", trama: "madera" },
    estudio: { piso: "Laminado madera 8 mm", trama: "madera" },
    pasillo: { piso: "Laminado madera 8 mm", trama: "madera" },
    garaje: { piso: "Concreto pulido", trama: "liso" },
    balcon: { piso: "Cerámica 30×30 exterior", trama: "ceramica" },
  };
  for (const r of plan.rooms.filter((r) => r.level === level)) {
    const fin = FINISH[r.type] ?? { piso: "Laminado madera 8 mm", trama: "madera" as const };
    const wet = /ba[nñ]o|bano|cocina|lavander|lavado|ropas/.test(r.name.toLowerCase()) || fin.trama === "ceramica";
    if (fin.trama === "ceramica" || wet) {
      const step = floorM(2.5, 0.3);
      for (let gx = r.x + step; gx < r.x + r.width - 0.03; gx += step)
        out.push({ t: "L", l: AC, x1: gx, y1: r.y + 0.02, x2: gx, y2: r.y + r.depth - 0.02, thin: true });
      for (let gy = r.y + step; gy < r.y + r.depth - 0.03; gy += step)
        out.push({ t: "L", l: AC, x1: r.x + 0.02, y1: gy, x2: r.x + r.width - 0.02, y2: gy, thin: true });
    } else if (fin.trama === "madera") {
      const step = floorM(2.2, 0.15);
      const along = r.width >= r.depth;
      const a0 = along ? r.y : r.x, a1 = along ? r.y + r.depth : r.x + r.width;
      for (let s = a0 + step; s < a1 - 0.03; s += step) {
        out.push(along
          ? { t: "L", l: AC, x1: r.x + 0.02, y1: s, x2: r.x + r.width - 0.02, y2: s, thin: true }
          : { t: "L", l: AC, x1: s, y1: r.y + 0.02, x2: s, y2: r.y + r.depth - 0.02, thin: true });
      }
    }
    // Nombre del espacio + su acabado de piso (la tabla resume todo).
    out.push({ t: "T", l: "TEXTOS", x: r.x + r.width / 2 - r.name.length * 0.055, y: r.y + r.depth / 2 + 0.08, h: 0.13, s: r.name.toUpperCase() });
    out.push({ t: "T", l: "TEXTOS", x: r.x + r.width / 2 - fin.piso.length * 0.042, y: r.y + r.depth / 2 - 0.16, h: 0.1, s: fin.piso.toUpperCase() });
  }
  // Cuadro de acabados: qué trama es qué (leyenda de la lámina). Va DEBAJO
  // del plano o AL LADO — lo elige el compositor de láminas por llenado.
  const cuadro: Prim[] = [];
  const ty0 = 0;
  cuadro.push({ t: "T", l: "TEXTOS", x: 0, y: ty0, h: 0.22, s: "CUADRO DE ACABADOS DE PISO" });
  const items = [...new Set(plan.rooms.filter((r) => r.level === level).map((r) => (FINISH[r.type] ?? { piso: "Laminado madera 8 mm" }).piso))];
  items.forEach((piso, i) => {
    const y = ty0 - 0.42 * (i + 1);
    const fin = Object.values(FINISH).find((f) => f.piso === piso);
    // muestra real de la trama al lado del texto
    if (fin?.trama === "ceramica") {
      for (let gx = 0.1; gx < 1.0; gx += 0.3) cuadro.push({ t: "L", l: AC, x1: gx, y1: y - 0.12, x2: gx, y2: y + 0.12, thin: true });
      for (let gy = y - 0.12 + 0.3; gy < y + 0.12; gy += 0.3) cuadro.push({ t: "L", l: AC, x1: 0.1, y1: gy, x2: 1.0, y2: gy, thin: true });
    } else if (fin?.trama === "madera") {
      for (let gy = y - 0.1; gy < y + 0.14; gy += 0.15) cuadro.push({ t: "L", l: AC, x1: 0.1, y1: gy, x2: 1.0, y2: gy, thin: true });
    }
    cuadro.push({ t: "H", l: "TEXTOS", x: 0.06, y: y - 0.15, w: 1.0, h: 0.3 });
    cuadro.push({ t: "T", l: "TEXTOS", x: 1.3, y: y - 0.05, h: 0.13, s: piso.toUpperCase() });
  });
  const shiftL = (prims: Prim[], dx: number, dy: number): Prim[] =>
    prims.map((p) =>
      p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
      : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
      : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
      : { ...p, x: p.x + dx, y: p.y + dy },
    );
  if (opts.legend === "side") {
    out.push(...shiftL(cuadro, plan.outline.width + 1.2, plan.outline.depth));
    out.push({ t: "T", l: "TEXTOS", x: 0, y: plan.outline.depth + 2.1, h: 0.24, s: plan.levels > 1 ? `PLANTA DE ACABADOS NIVEL ${level + 1}` : "PLANTA DE ACABADOS" });
  } else {
    out.push(...shiftL(cuadro, 0, plan.outline.depth + 1.1));
    out.push({ t: "T", l: "TEXTOS", x: 0, y: plan.outline.depth + 0.6, h: 0.24, s: plan.levels > 1 ? `PLANTA DE ACABADOS NIVEL ${level + 1}` : "PLANTA DE ACABADOS" });
  }
  return out;
}

/** ── CUADRO DE PUERTAS Y VENTANAS (guía §6 "cuadros puertas/ventanas" —
 *  backlog del libro): el computo de vanos que el constructor compra.
 *  Las columnas se miden al TAMAÑO DE PAPEL FINAL (con den: el piso de
 *  2.5 mm manda) y las celdas envuelven por palabras — JAMÁS truncadas.
 *  Texto 100% ASCII portable (txt.shx no tiene flechas). Comparte la
 *  lámina de fachadas (A-03), donde el vano se ve en contexto. */
export function openingSchedulePrimitives(plan: FloorPlan, opts: { den?: number } = {}): Prim[] {
  const out: Prim[] = [];
  const L = "TEXTOS";
  const rowH = 0.4, headH = 0.7;
  const hFloor = opts.den ? 2.5 * opts.den / 1000 : 0; // piso papel → modelo
  const effH = (hModel: number) => Math.max(hModel, hFloor);
  const cell = (x: number, y: number, s: string, colW: number, hModel: number): string[] => {
    const maxChars = Math.max(6, Math.floor((colW - 0.12) / (effH(hModel) * 0.7)));
    if (s.length <= maxChars) { out.push({ t: "T", l: L, x, y, h: hModel, s }); return [s]; }
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((ln, i) => out.push({ t: "T", l: L, x, y: y - i * (effH(hModel) * 1.5), h: hModel, s: ln }));
    return lines.slice(0, 2);
  };
  const table = (x0: number, title: string, cols: Array<[string, number]>, rows: string[][], hModel: number) => {
    const w = cols.reduce((s, c) => s + c[1], 0); // el marco mide EXACTO la suma de columnas
    // Altura de fila por fila: la celda que envuelve pide renglón más alto
    // (antes la 2ª línea pisaba la fila siguiente — colisión medida).
    const charsOf = (cw: number) => Math.max(6, Math.floor((cw - 0.12) / (effH(hModel) * 0.7)));
    const rowHs = rows.map((row) =>
      row.some((c, ci) => c.length > charsOf(cols[ci][1]) && c.includes(" ")) ? rowH * 1.6 : rowH);
    const h = headH + rowHs.reduce((s, rh) => s + rh, 0) + 0.1;
    out.push({ t: "H", l: L, x: x0, y: -h, w, h });
    out.push({ t: "T", l: L, x: x0 + 0.12, y: -0.2, h: 0.13, s: title });
    let cx = x0 + 0.06;
    cols.forEach(([hd, cw]) => {
      // cabecera: si no cabe ni encogida al 80%, se acorta la PALABRA (datos enteros siempre)
      const need = hd.length * effH(hModel) * 0.7 + 0.14;
      const hh = need <= cw ? hModel : Math.max(hModel * 0.8, (cw - 0.14) / (hd.length * 0.7));
      out.push({ t: "T", l: L, x: cx, y: -0.46, h: hh, s: hd });
      cx += cw;
    });
    out.push({ t: "L", l: L, x1: x0, y1: -0.58, x2: x0 + w, y2: -0.58, thin: true });
    let ry = -headH;
    rows.forEach((row, ri) => {
      ry -= rowHs[ri] * 0.8;
      let px = x0 + 0.06;
      row.forEach((c, ci) => { cell(px, ry, c, cols[ci][1], hModel); px += cols[ci][1]; });
      ry -= rowHs[ri] * 0.2;
    });
  };
  // Anchos de columna calculados para el PEOR texto a tamaño papel: cabeceras
  // y "ALCOBA PRINCIPAL - BAÑO SOCIAL" caben envueltos, no truncados.
  const den = opts.den ?? 75;
  const mm = (chars: number) => (chars * 2.5 * 0.7 + 3) * den / 1000 + 0.12; // ancho modelo para N caracteres a piso 2.5 mm
  const locW = mm(16);
  const doorCols: Array<[string, number]> = [["TIPO", mm(4)], ["NIV", mm(3)], ["ANCHO M", mm(7)], ["UBICACIÓN", locW]];
  table(0, "CUADRO DE PUERTAS", doorCols,
    plan.doors.map((d, i) => [`P-${i + 1}`, `N${(d.level ?? 0) + 1}`, d.width.toFixed(2), `${d.from.toUpperCase()} - ${d.to.toUpperCase()}`]),
    0.1);
  table(doorCols.reduce((s, c) => s + c[1], 0) + 0.5, "CUADRO DE VENTANAS",
    [["TIPO", mm(4)], ["NIV", mm(3)], ["ANCHO M", mm(7)], ["ALTO/ANTE M", mm(11)]],
    plan.windows.map((w, i) => [`V-${i + 1}`, `N${(w.level ?? 0) + 1}`, w.width.toFixed(2), `${w.height.toFixed(2)} / ${w.sill.toFixed(2)}`]),
    0.1);
  return out;
}

/** ── LÁMINA COMPLETA de curaduría — todo el paquete en una vista ──────────
 *  Composición profesional (referencias Plazola/Ching): plantas apiladas
 *  alineadas por eje · cortes en fila compartiendo línea de suelo · fachadas
 *  sobre terreno común · MARCO doble con margen · CAJETÍN · escala gráfica ·
 *  flecha norte. Determinista (para UI y DXF). */
export function sheetPrimitives(plan: FloorPlan): Prim[] {
  const { width: W, depth: D } = plan.outline;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  const totalH = fft * levels;

  const shift = (prims: Prim[], dx: number, dy: number): Prim[] =>
    prims.map((p) =>
      p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
      : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
      : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
      : { ...p, x: p.x + dx, y: p.y + dy },
    );

  // Fila 1: plantas de TODOS los niveles apiladas (alineadas por eje) +
  // cuadro de áreas a la derecha de la primera.
  const row1: Prim[] = [];
  let topY = 0;
  for (let lvl = 0; lvl < levels; lvl++) {
    row1.push(...shift(plantaPrimitives(plan, lvl), 0, topY));
    topY -= D + 3.2;
  }
  row1.push(...shift(areaTablePrimitives(plan), W + 2.5, D - 1));

  // Fila 2: cortes A-A' (longitudinal) y B-B' (transversal) — misma línea
  // de suelo (-1.4 cimentación).
  const corteAY0 = topY + (D + 3.2) - totalH - 3.4;
  const row2 = [
    ...shift(sectionPrimitives(plan), 0, corteAY0),
    ...shift(sectionPrimitives(plan, { transverse: true }), W + 3.5, corteAY0),
  ];

  // Fila 3: fachadas en fila sobre terreno común.
  const fachY = corteAY0 - totalH - 3.0;
  const sides = ["sur", "oeste", "este", "norte"] as const;
  let fx = 0;
  const row3: Prim[] = [];
  for (const side of sides) {
    const w = side === "norte" || side === "sur" ? W : D;
    row3.push(...shift(facadePrimitives(plan, side), fx, fachY));
    fx += w + 3.0;
  }

  // Título general de la lámina.
  const title: Prim[] = [
    { t: "T", l: "TEXTOS", x: 0, y: D + 2.4, h: 0.4, s: plan.name.toUpperCase() },
    { t: "T", l: "TEXTOS", x: 0, y: D + 1.9, h: 0.2, s: "PAQUETE ARQUITECTÓNICO — PLANTA · CORTES · FACHADAS · CUADRO DE ÁREAS" },
  ];

  const content = [...title, ...row1, ...row2, ...row3];

  // ── MARCO de lámina (doble línea) + CAJETÍN + escala + norte ────────────
  const b = primsBounds(content);
  const m1 = 1.0, m2 = 1.6; // margen interior/exterior
  const fx0 = b.minX - m2, fy0 = b.minY - m2, fx1 = b.maxX + m2, fy1 = b.maxY + m2;
  const frame: Prim[] = [
    { t: "H", l: "TEXTOS", x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 },          // marco exterior
    { t: "H", l: "TEXTOS", x: fx0 + (m2 - m1), y: fy0 + (m2 - m1), w: fx1 - fx0 - 2 * (m2 - m1), h: fy1 - fy0 - 2 * (m2 - m1) }, // marco interior
  ];

  // Cajetín (title block) pegado a la esquina inferior derecha del marco.
  const cw = 9.0, ch = 3.2;
  const cx0 = fx1 - m2 + (m2 - m1) - cw, cy0 = fy0 + (m2 - m1);
  const fit = (s: string, base = 0.18, maxChars = 48) => Math.max(Math.min(base, (base * maxChars) / Math.max(s.length, 1)), 0.1);
  const nm = plan.name.toUpperCase();
  const rows: Array<[number, string]> = [
    [0.62, nm],
    [0.5, "UBICACIÓN: " + (plan.site?.city ?? "—")],
    [0.5, "UNIDADES: METROS · ESCALA EN RÓTULO"],
    [0.5, "LÁMINA A-01 — PAQUETE PARA LICENCIA"],
    [0.5, "OBRAHUB · CRATERE S.A.S. — DISEÑO ASISTIDO POR IA"],
  ];
  const cajetin: Prim[] = [{ t: "H", l: "TEXTOS", x: cx0, y: cy0, w: cw, h: ch }];
  let yy = cy0 + ch;
  for (const [rh, label] of rows) {
    yy -= rh;
    cajetin.push({ t: "L", l: "TEXTOS", x1: cx0, y1: yy, x2: cx0 + cw, y2: yy, thin: true });
    cajetin.push({ t: "T", l: "TEXTOS", x: cx0 + 0.25, y: yy + rh / 2 - 0.08, h: fit(label), s: label });
  }

  // Escala gráfica (0—1—2—5 m) y flecha N justo ENCIMA del cajetín, dentro
  // del marco (composición: herramientas de lectura agrupadas, como Plazola).
  const sx = cx0, sy2 = cy0 + ch + 0.8;
  const scaleBar: Prim[] = [];
  for (const [a, bl] of [[0, "0"], [1, "1"], [2, "2"], [5, "5 m"]] as Array<[number, string]>) {
    scaleBar.push({ t: "L", l: "TEXTOS", x1: sx + a, y1: sy2, x2: sx + a, y2: sy2 + 0.18 });
    scaleBar.push({ t: "T", l: "TEXTOS", x: sx + a - 0.1, y: sy2 + 0.3, h: 0.16, s: bl });
  }
  scaleBar.push({ t: "L", l: "TEXTOS", x1: sx, y1: sy2 + 0.09, x2: sx + 5, y2: sy2 + 0.09 });
  const north: Prim[] = [
    { t: "L", l: "TEXTOS", x1: cx0 - 1.6, y1: sy2, x2: cx0 - 1.6, y2: sy2 + 1.2 },
    { t: "L", l: "TEXTOS", x1: cx0 - 1.6, y1: sy2 + 1.2, x2: cx0 - 1.78, y2: sy2 + 0.85 },
    { t: "L", l: "TEXTOS", x1: cx0 - 1.6, y1: sy2 + 1.2, x2: cx0 - 1.42, y2: sy2 + 0.85 },
    { t: "T", l: "TEXTOS", x: cx0 - 1.75, y: sy2 + 1.45, h: 0.2, s: "N" },
  ];

  return [...content, ...frame, ...cajetin, ...scaleBar, ...north];
}


/** PLANTA DE CUBIERTAS (curaduría la exige; placa maciza SIN cubierta =
   no suma área — MPr/D.1077). Pendientes 2%, bajales, rotulada y ACOTADA
   en ambos ejes (Plazola: todo plano de cubiertas dimensiona el faldón). */
export function roofPlanPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const L = "TEXTOS";
  out.push({ t: "H", l: "MUROS", x: 0, y: 0, w: W, h: D });
  const cx = W / 2, cy = D / 2;
  // Flechas de pendiente: las del EJE X (a cy) rotulan DEBAJO de la flecha
  // para no invadir el título central (colisión medida por el QA plot).
  const slopes: Array<[number, number, "up" | "down"]> = [
    [cx, D * 0.25, "up"], [cx, D * 0.75, "up"], [W * 0.25, cy, "down"], [W * 0.75, cy, "down"],
  ];
  for (const [tx, ty, side] of slopes) {
    out.push({ t: "L", l: L, x1: tx - 0.5, y1: ty, x2: tx + 0.5, y2: ty });
    out.push({ t: "L", l: L, x1: tx + 0.5, y1: ty, x2: tx + 0.35, y2: ty + 0.1 });
    out.push({ t: "L", l: L, x1: tx + 0.5, y1: ty, x2: tx + 0.35, y2: ty - 0.1 });
    out.push({ t: "T", l: L, x: tx - 0.12, y: ty + (side === "up" ? 0.3 : -0.55), h: 0.16, s: "2%" });
  }
  for (const [bx, by] of [[0.15, 0.15], [W - 0.15, D - 0.15]] as Array<[number, number]>) {
    out.push({ t: "H", l: L, x: bx - 0.08, y: by - 0.08, w: 0.16, h: 0.16 });
    out.push({ t: "T", l: L, x: bx - 0.3, y: by + 0.4, h: 0.14, s: "BJS 3in" });
  }
  out.push({ t: "T", l: L, x: cx - 2.6, y: cy + 0.1, h: 0.22, s: "PLACA MACIZA e=12 cm" });
  out.push({ t: "T", l: L, x: cx - 3.6, y: cy - 0.25, h: 0.15, s: "Sin cubierta — no suma área (MPr / D.1077)" });
  dimChain("COTAS", [0, W], -0.7, out);
  out.push({ t: "T", l: "COTAS", x: W / 2 - 0.22, y: -1.15, h: 0.18, s: fmt(W) });
  // Cadena Y (total del faldón) — mismo formato que la planta.
  out.push({ t: "L", l: "COTAS", x1: -0.7, y1: 0, x2: -0.7, y2: D });
  out.push({ t: "L", l: "COTAS", x1: -0.77, y1: -0.07, x2: -0.63, y2: 0.07 });
  out.push({ t: "L", l: "COTAS", x1: -0.77, y1: D - 0.07, x2: -0.63, y2: D + 0.07 });
  out.push({ t: "T", l: "COTAS", x: -1.17, y: D / 2, h: 0.18, s: fmt(D), r: 90 });
  out.push({ t: "T", l: L, x: 0, y: D + 1.2, h: 0.26, s: "PLANTA DE CUBIERTAS" });
  return out;
}

/** ── DETALLES DE ACABADOS (lámina A-07 del primer paquete): los detalles
 *  que curaduría y el interventor piden sobre el cuadro de acabados.
 *  Tres detalles deterministas con CÓDIGO (D1/D2/D3) referenciable desde
 *  el cuadro de acabados de A-06. Coordenadas locales por detalle, cada
 *  uno en su caja rotulada — composición 1×3 o 2×2 según lámina. */
export function detalleD1Pisos(): Prim[] {
  // D1 — TRANSICIÓN DE PISO cerámica ↔ madera con zócalo (sección).
  const out: Prim[] = [];
  const L = "ACABADOS";
  // Placa de piso (poché macizo — corte).
  out.push({ t: "F", l: "MUROS", x: 0, y: 0, w: 3.2, h: 0.18 });
  // Media cara cerámica: baldosa + pegante + tick de junta.
  for (let i = 0; i < 3; i++) {
    const x = i * 0.6;
    out.push({ t: "H", l: L, x, y: 0.18, w: 0.58, h: 0.04 });
    out.push({ t: "L", l: L, x1: x + 0.29, y1: 0.18, x2: x + 0.29, y2: 0.22, thin: true });
  }
  // Media cara madera: tablones corridos con junta perimetral.
  for (let i = 0; i < 4; i++) {
    const x = 1.8 + i * 0.35;
    out.push({ t: "H", l: L, x, y: 0.18, w: 0.33, h: 0.03 });
  }
  // Perfilería/junta de transición al centro.
  out.push({ t: "F", l: L, x: 1.75, y: 0.18, w: 0.05, h: 0.06 });
  // Zócalos en ambos extremos (h=10 cm).
  out.push({ t: "H", l: L, x: 0, y: 0.22, w: 0.1, h: 0.1 });
  out.push({ t: "H", l: L, x: 3.1, y: 0.22, w: 0.1, h: 0.1 });
  // Cotas y textos del detalle.
  out.push({ t: "T", l: "TEXTOS", x: 0.1, y: 0.75, h: 0.16, s: "CERÁMICA 30×30" });
  out.push({ t: "T", l: "TEXTOS", x: 2.1, y: 0.75, h: 0.16, s: "LAMINADO 8 mm" });
  out.push({ t: "T", l: "TEXTOS", x: 1.45, y: 0.5, h: 0.14, s: "JUNTA" });
  out.push({ t: "T", l: "TEXTOS", x: 0, y: -0.35, h: 0.15, s: "PLACA E=12 cm" });
  out.push({ t: "T", l: "TEXTOS", x: 3.1, y: 0.4, h: 0.14, s: "ZÓCALO h=10" });
  return out;
}

export function detalleD2Sanitarios(): Prim[] {
  // D2 — INSTALACIÓN DE APARATOS: sanitario + lavamanos (esquema AC/desagüe).
  const out: Prim[] = [];
  const L = "ACABADOS";
  // Muro de fondo y piso.
  out.push({ t: "F", l: "MUROS", x: 0, y: 0, w: 0.15, h: 2.1 });
  out.push({ t: "L", l: "MUROS", x1: 0, y1: 0, x2: 2.9, y2: 0 });
  // SANITARIO (perfil): tanque + taza.
  out.push({ t: "H", l: "SANITARIOS", x: 0.15, y: 1.35, w: 0.45, h: 0.5 });
  out.push({ t: "H", l: "SANITARIOS", x: 0.6, y: 0.95, w: 0.65, h: 0.4 });
  out.push({ t: "H", l: "SANITARIOS", x: 0.6, y: 0.25, w: 0.5, h: 0.7 });
  out.push({ t: "L", l: "SANITARIOS", x1: 1.1, y1: 0.25, x2: 1.1, y2: 0.95, thin: true });
  // LAVAMANOS (perfil): muerto + batea.
  out.push({ t: "H", l: "SANITARIOS", x: 1.8, y: 0.85, w: 0.75, h: 0.18 });
  out.push({ t: "H", l: "SANITARIOS", x: 2.05, y: 0.2, w: 0.25, h: 0.65 });
  // AC (fría y caliente, discontinua) desde el muro a cada aparato.
  out.push({ t: "L", l: "HIDROSANITARIO", x1: 0.15, y1: 1.55, x2: 1.9, y2: 1.55, dash: true, thin: true });
  out.push({ t: "L", l: "HIDROSANITARIO", x1: 0.15, y1: 1.45, x2: 1.9, y2: 1.45, dash: true, thin: true });
  out.push({ t: "L", l: "HIDROSANITARIO", x1: 1.9, y1: 1.55, x2: 1.9, y2: 1.05, dash: true, thin: true });
  // DESAGÜES hacia bajante (discontinua gruesa) con pendiente.
  out.push({ t: "L", l: "HIDROSANITARIO", x1: 0.85, y1: 0.25, x2: 0.85, y2: -0.45, dash: true });
  out.push({ t: "L", l: "HIDROSANITARIO", x1: 2.17, y1: 0.2, x2: 0.85, y2: -0.45, dash: true });
  out.push({ t: "T", l: "TEXTOS", x: 0.35, y: 1.75, h: 0.14, s: "AC Ø1/2\"" });
  out.push({ t: "T", l: "TEXTOS", x: 1.0, y: -0.35, h: 0.14, s: "DESAGÜE Ø3\" PEND. 2%" });
  out.push({ t: "T", l: "TEXTOS", x: 0.15, y: 2.25, h: 0.15, s: "SANITARIO" });
  out.push({ t: "T", l: "TEXTOS", x: 1.75, y: 1.1, h: 0.15, s: "LAVAMANOS" });
  return out;
}

export function detalleD3Ventana(plan: FloorPlan): Prim[] {
  // D3 — JAMBA Y DINTEL DE VENTANA con alfizar (sección vertical).
  const out: Prim[] = [];
  const L = "ACABADOS";
  const te = plan.wallThickness.exterior;
  // Muro cortado en L: jamba vertical + dintel superior (poché).
  out.push({ t: "F", l: "MUROS", x: 0, y: 0, w: te, h: 2.3 });
  out.push({ t: "F", l: "MUROS", x: 0, y: 1.75, w: 1.6, h: te });
  // Hueco: marco (doble línea) + vidrio + alfizar con pendiente 5%.
  out.push({ t: "H", l: "VENTANAS", x: te, y: 0.9, w: 0.05, h: 0.85 });
  out.push({ t: "H", l: "VENTANAS", x: te + 0.13, y: 0.9, w: 0.05, h: 0.85 });
  out.push({ t: "L", l: "VENTANAS", x1: te + 0.1, y1: 0.9, x2: te + 0.1, y2: 1.75, thin: true });
  out.push({ t: "L", l: "VENTANAS", x1: te - 0.02, y1: 0.9, x2: te + 0.2, y2: 0.82, thin: true }); // alfizar 5%
  // Dinteles y remates.
  out.push({ t: "H", l: L, x: te, y: 1.75 - 0.12, w: 0.25, h: 0.12 });
  out.push({ t: "T", l: "TEXTOS", x: 0.45, y: 2.15, h: 0.14, s: "DINTEL 0.15×0.20" });
  out.push({ t: "T", l: "TEXTOS", x: 0.45, y: 0.55, h: 0.14, s: "ALFIZAR PEND. 5%" });
  out.push({ t: "T", l: "TEXTOS", x: -0.85, y: 1.15, h: 0.14, s: "MURO", r: 90 });
  out.push({ t: "T", l: "TEXTOS", x: 0.28, y: 1.3, h: 0.13, s: "VIDRIO", r: 90 });
  return out;
}

/** D4 — CUADRO DE ACABADOS POR ESPACIO (texto): el complemento de los
 *  detalles: qué acabado lleva piso/muro/techo en CADA espacio (de
 *  plan.finishes si la etapa de acabados corrió; si no, del tipo). */
function detalleD4Cuadro(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const L = "ACABADOS";
  const guess = (t: string): [string, string, string] =>
    /baño|bano|cocina|lavander/i.test(t) ? ["CERÁMICA 45×45", "CERÁMICA h=1.50", "PINTURA ESMERILADA"]
    : /habitacion|alcoba|estudio/i.test(t) ? ["LAMINADO 8 mm", "PINTURA PLÁSTICA", "PINTURA BLANCA"]
    : /garaje|patio/i.test(t) ? ["CONCRETO PULIDO", "GRANOLADO", "PLACA N/A"]
    : ["PORCELANATO 60×60", "PINTURA PLÁSTICA", "PINTURA BLANCA"];
  const rows = plan.rooms.slice(0, 10).map((r) => {
    const f = plan.finishes?.find((x) => x.room === r.name);
    return { name: r.name.toUpperCase().slice(0, 11), floor: (f?.floor ?? guess(r.type)[0]).slice(0, 13), wall: (f?.walls ?? guess(r.type)[1]).slice(0, 13) };
  });
  const cw = [1.25, 1.45, 1.45], x0 = [0, cw[0], cw[0] + cw[1]];
  const hdr = ["ESPACIO", "PISO", "MURO/TECHO"];
  let y = 0;
  out.push({ t: "L", l: L, x1: 0, y1: y, x2: cw[0] + cw[1] + cw[2], y2: y });
  hdr.forEach((h2, i) => out.push({ t: "T", l: "TEXTOS", x: x0[i], y: y - 0.22, h: 0.13, s: h2 }));
  y -= 0.34;
  out.push({ t: "L", l: L, x1: 0, y1: y, x2: cw[0] + cw[1] + cw[2], y2: y });
  for (const r of rows) {
    out.push({ t: "T", l: "TEXTOS", x: x0[0], y: y - 0.2, h: 0.12, s: r.name });
    out.push({ t: "T", l: "TEXTOS", x: x0[1], y: y - 0.2, h: 0.12, s: r.floor });
    out.push({ t: "T", l: "TEXTOS", x: x0[2], y: y - 0.2, h: 0.12, s: r.wall });
    y -= 0.3;
    out.push({ t: "L", l: L, x1: 0, y1: y, x2: cw[0] + cw[1] + cw[2], y2: y, thin: true });
  }
  return out;
}

/** Composición de la lámina A-07: 2×2 — D1/D2/D3 + D4 (cuadro de acabados
 *  por espacio). Cada detalle en su caja con burbuja D# referenciable desde
 *  el cuadro de A-06. */
export function detallesAcabadosPrimitives(plan: FloorPlan, cols = 2): Prim[] {
  const boxes: Array<{ code: string; title: string; prims: Prim[] }> = [
    { code: "D1", title: "TRANSICIÓN DE PISOS — CERÁMICA / LAMINADO", prims: detalleD1Pisos() },
    { code: "D2", title: "APARATOS SANITARIOS — AC / DESAGÜE", prims: detalleD2Sanitarios() },
    { code: "D3", title: "JAMBA Y DINTEL DE VENTANA", prims: detalleD3Ventana(plan) },
    { code: "D4", title: "CUADRO DE ACABADOS POR ESPACIO", prims: detalleD4Cuadro(plan) },
  ];
  const BW = 4.5, BH = 4.4; // caja por detalle (modelo)
  const grid = (cols: number): Prim[] => {
    const acc: Prim[] = [];
    boxes.forEach((b, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const x0 = col * (BW + 0.8), y0 = -row * (BH + 0.9);
      acc.push({ t: "H", l: "ACABADOS", x: x0, y: y0 - BH, w: BW, h: BH });
      // Código D# en burbuja arriba a la izquierda de la caja.
      acc.push({ t: "C", l: "CORTE", x: x0 + 0.35, y: y0 - 0.35, r: 0.24 });
      acc.push({ t: "T", l: "CORTE", x: x0 + 0.35 - b.code.length * 0.07, y: y0 - 0.42, h: 0.16, s: b.code });
      acc.push({ t: "T", l: "TEXTOS", x: x0 + 0.75, y: y0 - 0.42, h: 0.16, s: b.title });
      // Contenido centrado y escalado a SU caja (el detalle no se deforma).
      const bb = primsBounds(b.prims);
      const s = Math.min((BW - 0.8) / (bb.maxX - bb.minX), (BH - 1.0) / (bb.maxY - bb.minY));
      const dx = x0 + 0.4 + ((BW - 0.8) - (bb.maxX - bb.minX) * s) / 2;
      const dy = y0 - 0.8 - (bb.maxY - bb.minY) * s;
      for (const p of b.prims) {
        if (p.t === "L") acc.push({ ...p, x1: dx + (p.x1 - bb.minX) * s, y1: dy + (p.y1 - bb.minY) * s, x2: dx + (p.x2 - bb.minX) * s, y2: dy + (p.y2 - bb.minY) * s });
        else if (p.t === "T") acc.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, h: p.h * Math.min(s, 1) });
        else if (p.t === "C") acc.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, r: p.r * s });
        else acc.push({ ...p, x: dx + (p.x - bb.minX) * s, y: dy + (p.y - bb.minY) * s, w: p.w * s, h: p.h * s });
      }
    });
    return acc;
  };
  return grid(cols);
}
