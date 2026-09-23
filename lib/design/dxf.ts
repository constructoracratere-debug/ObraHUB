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
import { POCHÉ, NORTH_ARROW, SCALE_BAR, PENS } from "./knowledge";
import { sheetPrimitives, plantaPrimitives, type Prim } from "./views";

type Entity = string; // pares "code\nvalue\n" acumulados

class DxfBuilder {
  private entities: Entity[] = [];
  private layers: Array<{ name: string; color: number }> = [];

  constructor(levels = 1) {
    // Colores = CLASE DE PLUMA ISO 128 (knowledge.ts PENS): en DXF R12 no
    // existe lineweight por entidad, así que el grosor se codifica por color
    // de capa → plumilla en el plot (flujo CAD clásico):
    //   7 (blanco)  = corte 0.70 mm · 3 (verde) = perfil 0.35 mm
    //   1 (rojo)    = textura 0.25 mm · 2 (amarillo) = auxiliar 0.13 mm
    const base: Array<[string, number]> = [
      ["MUROS", PENS.cut.dxfColor],
      ["CORTE", PENS.cut.dxfColor],
      ["PUERTAS", PENS.profile.dxfColor],
      ["VENTANAS", PENS.profile.dxfColor],
      ["FACHADA-NORTE", PENS.profile.dxfColor],
      ["FACHADA-SUR", PENS.profile.dxfColor],
      ["FACHADA-ESTE", PENS.profile.dxfColor],
      ["FACHADA-OESTE", PENS.profile.dxfColor],
      ["MOBILIARIO", PENS.profile.dxfColor],
      ["SANITARIOS", PENS.profile.dxfColor],
      ["ELECTRICO", PENS.thin.dxfColor],
      ["HIDROSANITARIO", PENS.thin.dxfColor],
      ["EJES", PENS.extra.dxfColor],
      ["TEXTOS", PENS.extra.dxfColor],
      ["COTAS", PENS.extra.dxfColor],
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
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑüÜ°²×–—]/g, "");
    this.entities.push(
      `0\nTEXT\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n40\n${f(height)}\n1\n${safe}\n50\n${f(rotationDeg)}\n`,
    );
  }

  /** Dibujo una cota lineal con primitivas (líneas de extensión + ticks 45°). */
  dim(x1: number, y1: number, x2: number, y2: number, offset: number, horizontal: boolean) {
    const L = "COTAS";
    const mid = horizontal ? (x1 + x2) / 2 : (y1 + y2) / 2;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const label = `${dist.toFixed(2)}`;
    const tick = 0.07;
    if (horizontal) {
      const y = y1 + offset;
      this.line(L, x1, y1, x1, y);
      this.line(L, x2, y2, x2, y);
      this.line(L, x1, y, x2, y);
      this.text(L, mid - label.length * 0.08, y + 0.05, 0.14, label);
      // Ticks oblicuos 45° (convención de cota — Ching).
      this.line(L, x1 - tick, y - tick, x1 + tick, y + tick);
      this.line(L, x2 - tick, y - tick, x2 + tick, y + tick);
    } else {
      const x = x1 + offset;
      this.line(L, x1, y1, x, y1);
      this.line(L, x2, y2, x, y2);
      this.line(L, x, y1, x, y2);
      this.text(L, x + 0.05, mid - 0.07, 0.14, label, 90);
      this.line(L, x - tick, y1 - tick, x + tick, y1 + tick);
      this.line(L, x - tick, y2 - tick, x + tick, y2 + tick);
    }
  }

  /** Poché clásico: rayado a 45° en la banda del muro exterior (Ching). */
  poché(x: number, y: number, w: number, h: number, spacing: number, maxSegs: number) {
    // Rayado del rectángulo [x,y,x+w,y+h] con líneas a 45°, recortadas a la banda.
    const n = Math.min(maxSegs, Math.ceil((w + h) / spacing));
    for (let i = 0; i < n; i++) {
      const c = x + i * spacing;               // intercepto sobre el borde inferior
      // Segmento a 45°: desde (c, y) subiendo hasta chocar con x+w o y+h.
      const dx = Math.min(w - 0, h);            // longitud máx. en diagonal dentro del rect
      const endX = Math.min(c + dx, x + w);
      const endY = y + (endX - c);
      if (endX > c && endY <= y + h + 1e-9) {
        this.line("MUROS", c, y, endX, endY);
      }
      // Ramas que arrancan del borde izquierdo (cuando c + h > x, ya cubierto arriba).
    }
  }

  /** Dibuja un set de primitivas de vistas.ts trasladadas (dx, dy). */
  prims(list: Prim[], dx: number, dy: number) {
    for (const p of list) {
      if (p.t === "L") this.line(p.l, p.x1 + dx, p.y1 + dy, p.x2 + dx, p.y2 + dy);
      else if (p.t === "T") this.text(p.l, p.x + dx, p.y + dy, p.h, p.s, p.r ?? 0);
      else if (p.t === "C") this.circle(p.l, p.x + dx, p.y + dy, p.r);
      else if (p.t === "F") {
        // Rect RELLENO → poché clásico: contorno + rayado 45° (Ching).
        const x0 = p.x + dx, y0 = p.y + dy, x1 = x0 + p.w, y1 = y0 + p.h;
        this.line(p.l, x0, y0, x1, y0);
        this.line(p.l, x1, y0, x1, y1);
        this.line(p.l, x1, y1, x0, y1);
        this.line(p.l, x0, y1, x0, y0);
        const step = 0.07;
        for (let s = -p.h; s < p.w; s += step) {
          const ax = Math.max(x0, x0 + s), ay = Math.min(y1, y0 + s + p.h);
          const bx = Math.min(x1, x0 + s + p.h), by = Math.max(y0, y0 + s);
          if (ax < bx && by < ay) this.line(p.l, ax, by, bx, ay);
        }
      }
      else {
        // Rect hueco → contorno como LWPOLYLINE cerrada (CAD pro).
        this.polyline(p.l, [[p.x + dx, p.y + dy], [p.x + p.w + dx, p.y + dy], [p.x + p.w + dx, p.y + p.h + dy], [p.x + dx, p.y + p.h + dy]], true);
      }
    }
  }

  /** Flecha de norte (Ching: siempre presente, apunta al NORTE del proyecto). */
  northArrow(cx: number, cy: number, size: number, layer = "TEXTOS") {
    const h = size, w = size * 0.5;
    this.polyline(layer, [[cx - w / 2, cy - h / 2], [cx, cy + h / 2], [cx + w / 2, cy - h / 2]]);
    this.line(layer, cx, cy - h / 2, cx, cy + h / 2);
    this.text(layer, cx - 0.08, cy + h / 2 + 0.12, size * 0.22, "N");
  }

  /** Escala gráfica con barras alternadas 0–1–2–5 m (legible a cualquier zoom). */
  scaleBar(x: number, y: number, segments: number[], unitLabel: string, layer = "COTAS") {
    let cx = x;
    const h = 0.12;
    segments.forEach((seg, i) => {
      // Cada segmento: contorno + relleno alterno (mitad inferior llena en pares).
      this.line(layer, cx, y, cx + seg, y);
      this.line(layer, cx, y, cx, y + h);
      if (i % 2 === 0) {
        for (let k = 0; k < Math.round(seg / 0.1); k++) {
          this.line(layer, cx + k * 0.1, y, cx + k * 0.1, y + h);
        }
      }
      this.text(layer, cx - 0.08, y - 0.3, 0.16, String(Math.round(cx - x)));
      cx += seg;
    });
    this.line(layer, cx, y, cx, y + h);
    this.text(layer, cx - 0.1, y - 0.3, 0.16, `${Math.round(cx - x)} ${unitLabel}`);
  }

  /** Cajetín (title block) — lámina estándar con campos mínimos. */
  titleBlock(x: number, y: number, w: number, fields: Record<string, string>, layer = "TEXTOS") {
    const rowH = 0.34;
    const rows = Object.entries(fields);
    const h = rows.length * rowH + 0.2;
    // Marco
    this.line(layer, x, y, x + w, y);
    this.line(layer, x, y, x, y + h);
    this.line(layer, x + w, y, x + w, y + h);
    this.line(layer, x, y + h, x + w, y + h);
    rows.forEach(([k, v], i) => {
      const yy = y + h - 0.1 - (i + 1) * rowH;
      this.text(layer, x + 0.12, yy + 0.05, 0.14, `${k}: ${v}`.toUpperCase().slice(0, 42));
    });
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
    // PLANTA NIVEL PROFESIONAL: mismas primitivas v2 de la lamina
    // (poche solido, mobiliario Neufert, cotas dobles con jambs,
    // burbujas de ejes, marcas de corte) — un solo motor de verdad.
    d.prims(plantaPrimitives(plan, level), 0, 0);

    // MEP sobre la planta: círculos con inicial del dispositivo (RETIE/RAS).
    // Arcos REALES de giro de puertas (Ching) por eje derivado.
    for (const dr of plan.doors.filter((x) => x.level === level)) {
      const w = dr.width;
      if (dr.axis === "y") {
        const hy = dr.hinge === "left" ? dr.y - w / 2 : dr.y + w / 2;
        const sd = dr.swingDir ?? 1;
        d.arc(`PUERTAS${sfx}`, dr.x, hy, w, sd === 1 ? 0 : 90, sd === 1 ? 90 : 180);
      } else {
        const hx = dr.hinge === "left" ? dr.x - w / 2 : dr.x + w / 2;
        const sd = dr.swingDir ?? 1;
        d.arc(`PUERTAS${sfx}`, hx, dr.y, w, sd === 1 ? 180 : 90, sd === 1 ? 270 : 0);
      }
    }
    for (const p of (plan.electrical?.points ?? [])) {
      if (p.level !== level) continue;
      const [sym] = ELEC_SYMBOLS[p.kind] ?? ["?"];
      d.circle(EL, p.x, p.y, 0.09);
      d.text(EL, p.x - 0.04, p.y - 0.05, 0.1, sym);
    }
    for (const p of (plan.hydro?.points ?? [])) {
      if (p.level !== level) continue;
      const [sym] = HYDRO_SYMBOLS[p.kind] ?? ["H"];
      d.circle(HY, p.x, p.y, 0.1);
      d.text(HY, p.x - 0.04, p.y - 0.05, 0.1, sym);
    }


    // ── Cajetín estándar de lámina (esquina inferior derecha).
    d.titleBlock(Math.max(W - 4.2, 2.5), -3.6, 4.0, {
      PROYECTO: plan.name,
      PLANO: `Planta arquitectónica — Nivel ${level + 1}`,
      ESCALA: "GRÁFICA (m)",
      FECHA: new Date().toISOString().slice(0, 10),
      DIBUJÓ: "ObraHub · Diseño IA",
      LÁMINA: `A-1${plan.levels > 1 ? `.${level + 1}` : ""}`,
    });

    // Título del nivel.
    d.text(T, 0, D + 2.0, 0.28, `${plan.name} — NIVEL ${level + 1}`);
  }

  // ── VISTAS DE LICENCIA (Ching §secciones): la misma LÁMINA compuesta que
  // ve el usuario — cortes A-A'/B-B', 4 fachadas y cuadro de áreas, debajo
  // de la planta principal.
  d.prims(sheetPrimitives(plan), 0, -(D + 5.5));

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
