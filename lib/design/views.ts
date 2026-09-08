/**
 * ✏️ Diseño IA — Vistas: CORTE A-A' y FACHADAS (N/S/E/W).
 *
 * Primitivas puras (deterministas) que alimentan DOS renderizadores: el
 * motor DXF (capas CORTE/FACHADA-*) y el SVG de la UI. Convenciones de
 * Ching (Architectural Graphics §secciones/elevaciones):
 *  · Niveles marcados con ▲ + cota (+0.00, +2.60…)
 *  · Muros cortados con poché (en DXF: doble línea; espesor visual)
 *  · Cadena de cotas verticales (altura total y piso a piso)
 *  · Ventanas proyectadas con sill/alto reales; puerta principal 2.10 m
 *  · Línea de suelo con rayado en fachadas
 */

import type { FloorPlan, Room, WallSide } from "./schema";

/** Primitiva de dibujo (unidades: metros, CAD — Y hacia arriba). */
export type Prim =
  | { t: "L"; l: string; x1: number; y1: number; x2: number; y2: number }
  | { t: "T"; l: string; x: number; y: number; h: number; s: string; r?: number }
  | { t: "H"; l: string; x: number; y: number; w: number; h: number }; // rect hueco

const DOOR_H = 2.1;

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

/** ── CORTE A-A' — corte vertical por el eje largo (y = D/2), mirando N ──── */
export function sectionPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const L = "CORTE";
  const { width: W, depth: D } = plan.outline;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);
  const cutY = D / 2;
  const totalH = fft * levels;

  // Suelo (por debajo, con rayado) y línea de piso por nivel.
  out.push({ t: "L", l: L, x1: -0.6, y1: -0.3, x2: W + 0.6, y2: -0.3 });
  for (let i = 0; i < Math.ceil((W + 1.2) / 0.25); i++) {
    const x = -0.6 + i * 0.25;
    out.push({ t: "L", l: L, x1: x, y1: -0.3, x2: x - 0.18, y2: -0.52 }); // rayado suelo
  }

  for (let lvl = 0; lvl < levels; lvl++) {
    const z0 = lvl * fft;
    // Placa pisotecho (doble línea 0.2) a lo ancho.
    out.push({ t: "L", l: L, x1: 0, y1: z0, x2: W, y2: z0 });
    out.push({ t: "L", l: L, x1: 0, y1: z0 + 0.2, x2: W, y2: z0 + 0.2 });

    // Muros cortados: extremos (0 y W) — doble línea vertical (poché).
    for (const x of [0, W]) {
      out.push({ t: "L", l: L, x1: x, y1: z0 + 0.2, x2: x, y2: z0 + fft });
      out.push({ t: "L", l: L, x1: x === 0 ? 0.12 : x - 0.12, y1: z0 + 0.2, x2: x === 0 ? 0.12 : x - 0.12, y2: z0 + fft });
    }

    // Particiones interiores que cruza el corte (bordes de espacios en cutY).
    const edges = new Set<number>();
    for (const r of plan.rooms.filter((r) => r.level === lvl && r.y <= cutY && r.y + r.depth >= cutY)) {
      edges.add(Math.round(r.x * 100) / 100);
      edges.add(Math.round((r.x + r.width) * 100) / 100);
    }
    for (const x of edges) {
      if (x < 0.2 || x > W - 0.2) continue;
      out.push({ t: "L", l: L, x1: x, y1: z0 + 0.2, x2: x, y2: z0 + fft });
    }

    // Nombres de los espacios cortados.
    for (const r of plan.rooms.filter((r) => r.level === lvl && r.y <= cutY && r.y + r.depth >= cutY)) {
      out.push({ t: "T", l: L, x: r.x + r.width / 2 - r.name.length * 0.06, y: z0 + fft / 2, h: 0.18, s: r.name.toUpperCase() });
    }

    // Ventanas en muros N/S cortados (sill/alto reales del JSON).
    for (const w of plan.windows.filter((w) => w.level === lvl && (w.wall === "norte" || w.wall === "sur"))) {
      const room = plan.rooms.find(roomAt(plan, w.room, lvl));
      if (!room) continue;
      const edgeY = w.wall === "norte" ? room.y + room.depth : room.y;
      const isBuildingEdge = Math.abs(edgeY - (w.wall === "norte" ? D : 0)) < 0.35;
      if (!isBuildingEdge) continue;
      const xSide = w.wall === "norte" ? W : 0; // en el corte, el muro exterior visible de ese lado
      if (Math.abs(edgeY - (w.wall === "norte" ? D : 0)) > 0.35) continue;
      out.push({ t: "H", l: L, x: w.x - w.width / 2, y: z0 + w.sill, w: w.width, h: w.height });
      void xSide;
    }

    // Marca de nivel.
    levelMark(L, -1.2, z0, out, `+${fmt(z0)}`);
  }

  // Ejes estructurales verticales proyectados (relación planta↔corte).
  for (const ax of plan.structure?.axes ?? []) {
    if (ax.orientation !== "vertical") continue;
    out.push({ t: "L", l: "EJES", x1: ax.at, y1: -0.6, x2: ax.at, y2: totalH + 0.6 });
    out.push({ t: "T", l: "EJES", x: ax.at - 0.08, y: totalH + 0.75, h: 0.2, s: ax.id });
  }

  // Cadena de cotas verticales (fft y total) a la derecha.
  const xd = W + 1.4;
  out.push({ t: "L", l: "COTAS", x1: xd, y1: 0, x2: xd, y2: totalH });
  for (let lvl = 1; lvl <= levels; lvl++) {
    out.push({ t: "L", l: "COTAS", x1: xd - 0.1, y1: lvl * fft, x2: xd + 0.1, y2: lvl * fft });
    out.push({ t: "T", l: "COTAS", x: xd + 0.18, y: (lvl - 0.5) * fft, h: 0.16, s: fmt(fft) });
  }
  out.push({ t: "L", l: "COTAS", x1: xd + 0.7, y1: 0, x2: xd + 0.7, y2: totalH });
  out.push({ t: "T", l: "COTAS", x: xd + 0.88, y: totalH / 2, h: 0.18, s: fmt(totalH), r: 90 });

  // Título.
  out.push({ t: "T", l: "TEXTOS", x: 0, y: totalH + 1.3, h: 0.26, s: "CORTE A-A'" });
  return out;
}

function roomAt(plan: FloorPlan, name: string, level: number): (r: Room) => boolean {
  const key = name.toLowerCase().replace(/\s+/g, "");
  return (r) => r.level === level && r.name.toLowerCase().replace(/\s+/g, "") === key;
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

  // Envolvente + líneas de nivel.
  out.push({ t: "H", l: L, x: 0, y: 0, w: facadeW, h: totalH });
  for (let lvl = 1; lvl < levels; lvl++) {
    out.push({ t: "L", l: L, x1: 0, y1: lvl * fft, x2: facadeW, y2: lvl * fft });
  }
  // Zócalo base (línea de mayor peso visual — Ching).
  out.push({ t: "L", l: L, x1: -0.4, y1: 0, x2: facadeW + 0.4, y2: 0 });
  // Suelo con rayado.
  out.push({ t: "L", l: L, x1: -0.4, y1: -0.25, x2: facadeW + 0.4, y2: -0.25 });
  for (let i = 0; i < Math.ceil((facadeW + 1) / 0.3); i++) {
    const x = -0.4 + i * 0.3;
    out.push({ t: "L", l: L, x1: x, y1: -0.25, x2: x - 0.15, y2: -0.45 });
  }
  levelMark(L, -1.1, 0, out, "+0.00");
  if (levels > 1) levelMark(L, -1.1, fft, out, `+${fmt(fft)}`);

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
    const x = horizontal ? w.x : w.x;
    // Marco: rectángulo + cruz (2 paños) — convención gráfica.
    out.push({ t: "H", l: L, x: x - w.width / 2, y: z0 + w.sill, w: w.width, h: w.height });
    out.push({ t: "L", l: L, x1: x - w.width / 2, y1: z0 + w.sill + w.height / 2, x2: x + w.width / 2, y2: z0 + w.sill + w.height / 2 });
    out.push({ t: "L", l: L, x1: x, y1: z0 + w.sill, x2: x, y2: z0 + w.sill + w.height });
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
    out.push({ t: "H", l: L, x: pos - d.width / 2, y: d.level * fft, w: d.width, h: DOOR_H });
  }

  // Título de la fachada.
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
    else { see(p.x, p.y); see(p.x + p.w, p.y + p.h); }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { minX, minY, maxX, maxY };
}
