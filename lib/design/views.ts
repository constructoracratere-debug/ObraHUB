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
 *  · Fachadas: zócalo, textura de mampostería, bajante, manija, ESC 1:75.
 */

import type { FloorPlan, Room, WallSide } from "./schema";

/** Primitiva de dibujo (unidades: metros, CAD — Y hacia arriba). */
export type Prim =
  | { t: "L"; l: string; x1: number; y1: number; x2: number; y2: number; dash?: boolean; thin?: boolean }
  | { t: "T"; l: string; x: number; y: number; h: number; s: string; r?: number }
  | { t: "H"; l: string; x: number; y: number; w: number; h: number } // rect hueco
  | { t: "F"; l: string; x: number; y: number; w: number; h: number }; // rect RELLENO (poché/zócalo)

const DOOR_H = 2.1;
/** Escala gráfica declarada (Plazola: cortes/fachadas 1:75, planta 1:75/1:100). */
const ESC = "ESC 1:75";

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
  const cutY = D / 2;
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
  out.push({ t: "T", l: "TEXTOS", x: 4.2, y: totalH + 1.4, h: 0.16, s: ESC });
  return out;
}

function roomAt(plan: FloorPlan, name: string, level: number): (r: Room) => boolean {
  const key = name.toLowerCase().replace(/\s+/g, "");
  return (r) => r.level === level && r.name.toLowerCase().replace(/\s+/g, "") === key;
}

/** ── PLANTA como primitivas (para la LÁMINA compuesta). ─────────────────── */
export function plantaPrimitives(plan: FloorPlan, level = 0): Prim[] {
  const out: Prim[] = [];
  const { width: W, depth: D } = plan.outline;
  const L = "MUROS";
  const rooms = plan.rooms.filter((r) => r.level === level);
  out.push({ t: "H", l: L, x: 0, y: 0, w: W, h: D });
  for (const r of rooms) {
    out.push({ t: "H", l: L, x: r.x, y: r.y, w: r.width, h: r.depth });
    const a = r.width * r.depth;
    out.push({ t: "T", l: "TEXTOS", x: r.x + r.width / 2 - r.name.length * 0.055, y: r.y + r.depth / 2 + 0.05, h: 0.14, s: r.name.toUpperCase() });
    out.push({ t: "T", l: "TEXTOS", x: r.x + r.width / 2 - 0.3, y: r.y + r.depth / 2 - 0.18, h: 0.11, s: `${a.toFixed(1)}` });
  }
  // Ejes con etiquetas.
  for (const ax of plan.structure?.axes ?? []) {
    if (ax.orientation === "vertical") {
      out.push({ t: "L", l: "EJES", x1: ax.at, y1: -0.9, x2: ax.at, y2: D + 0.9 });
      out.push({ t: "T", l: "EJES", x: ax.at - 0.07, y: D + 1.05, h: 0.16, s: ax.id });
    } else {
      out.push({ t: "L", l: "EJES", x1: -0.9, y1: ax.at, x2: W + 0.9, y2: ax.at });
      out.push({ t: "T", l: "EJES", x: -1.2, y: ax.at - 0.07, h: 0.16, s: ax.id });
    }
  }
  // Ventanas (triple línea) y puertas (hoja + arco de giro — Ching).
  for (const w of plan.windows.filter((x) => x.level === level)) {
    const room = plan.rooms.find(roomAt(plan, w.room, level));
    if (!room) continue;
    if (w.wall === "norte" || w.wall === "sur") {
      const yy = w.wall === "norte" ? room.y + room.depth : room.y;
      for (const off of [-0.03, 0, 0.03]) out.push({ t: "L", l: "VENTANAS", x1: w.x - w.width / 2, y1: yy + off, x2: w.x + w.width / 2, y2: yy + off });
    } else {
      const xx = w.wall === "este" ? room.x + room.width : room.x;
      for (const off of [-0.03, 0, 0.03]) out.push({ t: "L", l: "VENTANAS", x1: xx + off, y1: w.x - w.width / 2, x2: xx + off, y2: w.x + w.width / 2 });
    }
  }
  for (const d of plan.doors.filter((x) => x.level === level)) {
    // Muro vertical (E/O) si la puerta está pegada a un borde lateral del
    // edificio; si no, muro horizontal (N/S). Hoja + cuerda de arco (Ching).
    const vert = d.x < 0.35 || d.x > W - 0.35;
    if (vert) {
      const hy = d.hinge === "left" ? d.y - d.width / 2 : d.y + d.width / 2;
      const tipX = d.x < W / 2 ? d.x + d.width : d.x - d.width; // hoja hacia adentro
      out.push({ t: "L", l: "PUERTAS", x1: d.x, y1: d.y - d.width / 2, x2: d.x, y2: d.y + d.width / 2 });
      out.push({ t: "L", l: "PUERTAS", x1: d.x, y1: hy, x2: tipX, y2: hy });
      out.push({ t: "L", l: "PUERTAS", x1: tipX, y1: hy, x2: d.x, y2: d.hinge === "left" ? d.y + d.width / 2 : d.y - d.width / 2, dash: true, thin: true });
    } else {
      const hx = d.hinge === "left" ? d.x - d.width / 2 : d.x + d.width / 2;
      const tipY = d.swing === "in" ? d.y - d.width : d.y + d.width;
      out.push({ t: "L", l: "PUERTAS", x1: d.x - d.width / 2, y1: d.y, x2: d.x + d.width / 2, y2: d.y });
      out.push({ t: "L", l: "PUERTAS", x1: hx, y1: d.y, x2: hx, y2: tipY });
      out.push({ t: "L", l: "PUERTAS", x1: hx, y1: tipY, x2: d.hinge === "left" ? d.x + d.width / 2 : d.x - d.width / 2, y2: d.y, dash: true, thin: true });
    }
  }
  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 1.6, h: 0.22, s: plan.levels > 1 ? `PLANTA NIVEL ${level + 1}` : "PLANTA ARQUITECTÓNICA" });
  return out;
}

/** ── TABLA DE ÁREAS dibujada (cuadro de áreas de la lámina). ────────────── */
export function areaTablePrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const L = "TEXTOS";
  const rows = plan.rooms.map((r) => ({ name: r.name, lvl: r.level, area: r.width * r.depth }));
  const total = rows.reduce((s, r) => s + r.area, 0);
  const w = 4.6, rowH = 0.32, headerH = 0.4;
  const h = headerH + (rows.length + 1) * rowH + 0.15;
  // Marco + cabecera.
  out.push({ t: "H", l: L, x: 0, y: -h, w, h });
  out.push({ t: "L", l: L, x1: 0, y1: -headerH, x2: w, y2: -headerH });
  out.push({ t: "T", l: L, x: 0.15, y: -headerH + 0.12, h: 0.14, s: "CUADRO DE ÁREAS" });
  out.push({ t: "L", l: L, x1: 3.1, y1: 0, x2: 3.1, y2: -h });
  out.push({ t: "L", l: L, x1: 4.0, y1: 0, x2: 4.0, y2: -h });
  // Filas.
  rows.slice(0, 18).forEach((r, i) => {
    const y = -headerH - (i + 1) * rowH + 0.1;
    out.push({ t: "T", l: L, x: 0.15, y, h: 0.11, s: r.name.slice(0, 22).toUpperCase() });
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

  // Puerta principal (la que conecta con "exterior") proyectada al lado correcto.
  for (const d of plan.doors) {
    if (d.from !== "exterior" && d.to !== "exterior") continue;
    let doorSide: WallSide | null = null;
    if (d.y < 0.35) doorSide = "sur";
    else if (d.y > D - 0.35) doorSide = "norte";
    else if (d.x < 0.35) doorSide = "oeste";
    else if (d.x > W - 0.35) doorSide = "este";
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
  out.push({ t: "T", l: "TEXTOS", x: facadeW - 1.6 > 0 ? facadeW - 1.6 : 3, y: -1.0, h: 0.16, s: ESC });
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
    else { see(p.x, p.y); see(p.x + p.w, p.y + p.h); }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { minX, minY, maxX, maxY };
}

/** ── LÁMINA COMPLETA de curaduría — todo el paquete en una vista ──────────
 *  Layout: planta + cuadro de áreas arriba · cortes A-A' y B-B' en fila ·
 *  4 fachadas en fila inferior. Determinista (para UI y DXF). */
export function sheetPrimitives(plan: FloorPlan): Prim[] {
  const { width: W, depth: D } = plan.outline;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  const totalH = fft * levels;

  const shift = (prims: Prim[], dx: number, dy: number): Prim[] =>
    prims.map((p) =>
      p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
      : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
      : { ...p, x: p.x + dx, y: p.y + dy },
    );

  // Fila 1: planta (0,0) + cuadro de áreas a su derecha.
  const row1 = [
    ...shift(plantaPrimitives(plan), 0, 0),
    ...shift(areaTablePrimitives(plan), W + 2.5, D - 1),
  ];

  // Fila 2: cortes A-A' (longitudinal) y B-B' (transversal).
  const corteAY0 = -(totalH + 3.2);
  const row2 = [
    ...shift(sectionPrimitives(plan), 0, corteAY0),
    ...shift(sectionPrimitives(plan, { transverse: true }), W + 3.5, corteAY0),
  ];

  // Fila 3: fachadas en fila.
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

  return [...title, ...row1, ...row2, ...row3];
}
