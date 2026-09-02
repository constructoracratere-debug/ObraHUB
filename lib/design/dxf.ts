/**
 * ✏️ Diseño IA — Motor DXF determinístico.
 *
 * ASCII DXF R12 (AC1009): el dialecto más universalmente legible (AutoCAD,
 * LibreCAD, Blender, dxf-viewer…). "AI thinks, deterministic engines draw":
 * misma entrada → mismo byte de salida. Cero decisiones del LLM aquí.
 *
 * Capas semánticas: MUROS, PUERTAS, VENTANAS, EJES, ELECTRICO, HIDROSANITARIO,
 * TEXTOS, COTAS. La estructura de un plan de la Fase 1 del roadmap: lo que
 * Procore no tiene y ObraHub sí.
 */

import { roomArea, type FloorPlan, type Room } from "./schema";

type Entity = string; // pares "code\nvalue\n" acumulados

class DxfBuilder {
  private entities: Entity[] = [];
  private layers: Array<{ name: string; color: number }> = [];

  constructor(levels = 1) {
    const base: Array<[string, number]> = [
      ["MUROS", 7],          // blanco/negro
      ["PUERTAS", 3],        // verde
      ["VENTANAS", 4],       // cian
      ["EJES", 1],           // rojo
      ["ELECTRICO", 2],      // amarillo
      ["HIDROSANITARIO", 5], // azul
      ["TEXTOS", 8],         // gris
      ["COTAS", 6],          // magenta
    ];
    this.layers = [];
    for (const [name, color] of base) {
      this.layers.push({ name, color });
      // Variantes por nivel (MUROS-1, MUROS-2…) para proyectos multipiso.
      for (let n = 2; n <= Math.max(1, levels); n++) {
        this.layers.push({ name: `${name}-${n}`, color });
      }
    }
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.entities.push(
      `0\nLINE\n8\n${layer}\n10\n${f(x1)}\n20\n${f(y1)}\n11\n${f(x2)}\n21\n${f(y2)}\n`,
    );
  }

  polyline(layer: string, pts: Array<[number, number]>, closed = false) {
    if (pts.length < 2) return;
    let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0.0\n20\n0.0\n30\n0.0\n`;
    for (const [x, y] of pts) {
      s += `0\nVERTEX\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n`;
    }
    s += `0\nSEQEND\n8\n${layer}\n`;
    this.entities.push(s);
  }

  circle(layer: string, cx: number, cy: number, r: number) {
    this.entities.push(`0\nCIRCLE\n8\n${layer}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n`);
  }

  arc(layer: string, cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    this.entities.push(
      `0\nARC\n8\n${layer}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n50\n${f(startDeg)}\n51\n${f(endDeg)}\n`,
    );
  }

  text(layer: string, x: number, y: number, height: number, value: string, rotationDeg = 0) {
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑ°²]/g, "");
    this.entities.push(
      `0\nTEXT\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n40\n${f(height)}\n1\n${safe}\n50\n${f(rotationDeg)}\n`,
    );
  }

  /** Dibujo una cota lineal con primitivas (líneas de extensión + texto). */
  dim(x1: number, y1: number, x2: number, y2: number, offset: number, horizontal: boolean) {
    const L = "COTAS";
    const mid = horizontal ? (x1 + x2) / 2 : (y1 + y2) / 2;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const label = `${dist.toFixed(2)}`;
    if (horizontal) {
      const y = y1 + offset;
      this.line(L, x1, y1, x1, y, );
      this.line(L, x2, y2, x2, y);
      this.line(L, x1, y, x2, y);
      this.text(L, mid - label.length * 0.08, y + 0.05, 0.14, label);
    } else {
      const x = x1 + offset;
      this.line(L, x1, y1, x, y1);
      this.line(L, x2, y2, x, y2);
      this.line(L, x, y1, x, y2);
      this.text(L, x + 0.05, mid - 0.07, 0.14, label, 90);
    }
  }

  build(): string {
    // HEADER
    let out = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n";
    // TABLES (layers)
    out += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n" + this.layers.length + "\n";
    for (const l of this.layers) {
      out += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n`;
    }
    out += "0\nENDTAB\n0\nENDSEC\n";
    // ENTITIES
    out += "0\nSECTION\n2\nENTITIES\n";
    for (const e of this.entities) out += e;
    out += "0\nENDSEC\n0\nEOF\n";
    return out;
  }
}

/** Formato numérico estable (determinismo byte a byte). */
function f(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function roomRect(r: Room) {
  return { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.depth };
}

/**
 * Traduce un FloorPlan a DXF. Cada nivel lleva su juego de entidades con
 * prefijo de capa `-N` (nivel), p.ej. `MUROS-1`.
 */
export function planToDxf(plan: FloorPlan): string {
  const d = new DxfBuilder(plan.levels);
  const { width: W, depth: D } = plan.outline;
  const te = plan.wallThickness.exterior;

  for (let level = 0; level < Math.max(1, plan.levels); level++) {
    const sfx = plan.levels > 1 ? `-${level + 1}` : "";
    const rooms = plan.rooms.filter((r) => r.level === level);
    if (rooms.length === 0) continue;

    const M = `MUROS${sfx}`;
    const P = `PUERTAS${sfx}`;
    const V = `VENTANAS${sfx}`;
    const EJ = `EJES${sfx}`;
    const EL = `ELECTRICO${sfx}`;
    const HY = `HIDROSANITARIO${sfx}`;
    const T = `TEXTOS${sfx}`;

    // ── Muro exterior: doble línea (interior + exterior) con offset te.
    // Solo si algún espacio toca el perímetro — el outline define la cara EXTERIOR.
    d.polyline(M, [[0, 0], [W, 0], [W, D], [0, D]], true);         // cara exterior
    d.polyline(M, [[te, te], [W - te, te], [W - te, D - te], [te, D - te]], true); // cara interior

    // ── Divisiones interiores: cada espacio con su rectángulo (caras limpias).
    for (const r of rooms) {
      const { x1, y1, x2, y2 } = roomRect(r);
      d.polyline(M, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], true);
    }

    // ── Puertas: vano (borrar muro no es posible en R12 barato → dibujamos el
    // vano como líneas de umbral + arco de giro).
    for (const door of plan.doors.filter((x) => x.level === level)) {
      const cx = door.x;
      const cy = door.y;
      const w = door.width;
      // Línea del vano (marco).
      d.line(P, cx - w / 2, cy, cx + w / 2, cy);
      // Hoja + arco de giro 90°.
      const dir = door.swing === "in" ? 1 : -1;
      const hx = door.hinge === "left" ? cx - w / 2 : cx + w / 2;
      d.line(P, hx, cy, hx, cy + w * dir);
      d.arc(P, hx, cy, w, 0, 90 * dir);
    }

    // ── Ventanas: triple línea sobre el muro exterior de su espacio.
    for (const win of plan.windows.filter((x) => x.level === level)) {
      const r = rooms.find((rr) => rr.name.toLowerCase().replace(/\s+/g, "") === win.room.toLowerCase().replace(/\s+/g, ""));
      if (!r) continue;
      const { x1, y1, x2, y2 } = roomRect(r);
      const half = win.width / 2;
      if (win.wall === "norte" || win.wall === "sur") {
        const yy = win.wall === "norte" ? y2 : y1;
        d.line(V, win.x - half, yy, win.x + half, yy);
        d.line(V, win.x - half, yy - 0.04, win.x + half, yy - 0.04);
        d.line(V, win.x - half, yy + 0.04, win.x + half, yy + 0.04);
      } else {
        const xx = win.wall === "este" ? x2 : x1;
        d.line(V, xx, win.x - half, xx, win.x + half);
        d.line(V, xx - 0.04, win.x - half, xx - 0.04, win.x + half);
        d.line(V, xx + 0.04, win.x - half, xx + 0.04, win.x + half);
      }
    }

    // ── Retícula estructural: ejes con tick y etiqueta (A, B… / 1, 2…).
    for (const ax of plan.structure?.axes ?? []) {
      if (ax.orientation === "vertical") {
        d.line(EJ, ax.at, -1.2, ax.at, D + 1.2);
        d.text(EJ, ax.at - 0.1, D + 1.3, 0.2, ax.id);
      } else {
        d.line(EJ, -1.2, ax.at, W + 1.2, ax.at);
        d.text(EJ, -1.5, ax.at - 0.1, 0.2, ax.id);
      }
    }

    // ── Eléctrico: círculo + inicial del dispositivo.
    for (const p of plan.electrical?.points ?? []) {
      if (p.level !== level) continue;
      const [sym] = ELEC_SYMBOLS[p.kind] ?? ["?"];
      d.circle(EL, p.x, p.y, 0.09);
      d.text(EL, p.x - 0.04, p.y - 0.05, 0.1, sym);
    }

    // ── Hidrosanitario: círculo + inicial del aparato.
    for (const p of plan.hydro?.points ?? []) {
      if (p.level !== level) continue;
      const [sym] = HYDRO_SYMBOLS[p.kind] ?? ["H"];
      d.circle(HY, p.x, p.y, 0.1);
      d.text(HY, p.x - 0.04, p.y - 0.05, 0.1, sym);
    }

    // ── Textos: nombre + área de cada espacio.
    for (const r of rooms) {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.depth / 2;
      d.text(T, cx - r.name.length * 0.055, cy + 0.06, 0.14, r.name.toUpperCase());
      d.text(T, cx - 0.35, cy - 0.2, 0.12, `${roomArea(r).toFixed(2)} m2`);
    }

    // ── Cotas generales del nivel.
    d.dim(0, 0, W, 0, -0.8, true);   // ancho total (abajo)
    d.dim(0, 0, 0, D, -0.8, false);  // fondo total (izquierda)

    // Título del nivel.
    d.text(T, 0, D + 2.0, 0.28, `${plan.name} — NIVEL ${level + 1}`);
  }

  return d.build();
}

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

/** Leyenda de símbolos como texto DXF (bloque al pie). */
export function appendLegend(dxf: string, plan: FloorPlan): string {
  // La leyenda se incorpora en planToDxf vía textos; reservado para crecer.
  return dxf;
}
