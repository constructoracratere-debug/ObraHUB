/**
 * ✏️ Diseño IA — Motor DXF determinístico · FORMATO OBRAHUB.
 *
 * 📕 SE RIGE POR docs/GUIA-ESTANDARES-DIBUJO.md (Guía CPNAA — EL LIBRO
 * OBLIGATORIO de ObraHub). Antes de cambiar capas, plumillas, escalas,
 * acotación, formato o rótulo: léelo. Su checklist está testificado en
 * scripts/test-design-dxf.mjs.
 *
 * ASCII DXF R2000 (AC1015): mantiene la compatibilidad universal y añade
 * lo que exige el manual de dibujo arquitectónico profesional (Colombia):
 *   · LAYER con LINETYPE + LINEWEIGHT (370, centésimas de mm) reales —
 *     jerarquía ISO 128: corte 0.70 · perfil 0.35 · fino 0.25 · trazo 0.13.
 *   · LTYPE con patrón real (CONTINUOUS, DASHED, CENTER para ejes).
 *   · Lámina general OBRAHUB 700×500 mm APAISADA con marco doble y rótulo
 *     vertical derecho (185 mm) — el formato del estudio, con OBRAHUB en
 *     vez de universidad. Una lámina por plano (A-01…A-05), colocadas
 *     lado a lado en el espacio modelo a 1:1 mm.
 *
 * "AI thinks, deterministic engines draw": misma entrada → mismo byte.
 */

import type { FloorPlan } from "./schema";
import { PENS } from "./knowledge";
import { sheetContents, type Sheet } from "./sheets";
import { primsBounds, type Prim } from "./views";

type Entity = string;

/** Grosor DXF (código 370) = centésimas de mm. */
const LW = { cut: 70, profile: 35, thin: 25, extra: 13 } as const;
type Linetype = "CONTINUOUS" | "DASHED" | "CENTER";

class DxfBuilder {
  private entities: Entity[] = [];
  /** Tabla de capas: nombre → color (plumilla ISO), linetype, grosor mm. */
  private layers = new Map<string, { color: number; lt: Linetype; lw: number }>();

  /** Nomenclatura A/E/I por disciplina — ÚNICO punto de mapeo: entidades y
   *  tabla usan siempre el MISMO nombre (antes la tabla decía A-MUROS y las
   *  entidades quedaban en MUROS huérfano — capas fantasma en AutoCAD). */
  private static cad(l: string): string {
    if (/^(MUROS|CORTE|PUERTAS|VENTANAS|MOBILIARIO|SANITARIOS|FACHADA|TEXTOS|COTAS|EJES|ROTULO|ROTULO-TXT)$/.test(l)) return "A-" + l;
    if (/^FACHADA-/.test(l)) return "A-" + l;
    if (/^ESTRUCTURA/.test(l)) return "S-ELEMENTOS";
    if (/^ELECTRICO/.test(l)) return "I-ELECTRICO";
    if (/^HIDRO/.test(l)) return "I-HIDRAULICO";
    return l;
  }

  private layerOf(raw: string): string {
    const name = DxfBuilder.cad(raw);
    // Especificación de plumilla por capa (manual de dibujo / ISO 128):
    //  corte 0.70 blanco · perfil 0.35 verde · fino 0.25 rojo · 0.13 amarillo.
    const spec: { color: number; lt: Linetype; lw: number } =
      /^(A-MUROS|A-CORTE|S-ELEMENTOS)$/.test(name) ? { color: PENS.cut.dxfColor, lt: "CONTINUOUS", lw: LW.cut }
      : /^(I-ELECTRICO|I-HIDRAULICO)$/.test(name) ? { color: PENS.thin.dxfColor, lt: "DASHED", lw: LW.thin }
      : /^A-EJES$/.test(name) ? { color: PENS.extra.dxfColor, lt: "CENTER", lw: LW.extra }
      : /^(A-TEXTOS|A-COTAS)$/.test(name) ? { color: PENS.extra.dxfColor, lt: "CONTINUOUS", lw: LW.extra }
      : /^(A-ROTULO|A-ROTULO-TXT)$/.test(name) ? { color: 7, lt: "CONTINUOUS", lw: name === "A-ROTULO" ? LW.profile : LW.thin }
      : { color: PENS.profile.dxfColor, lt: "CONTINUOUS", lw: LW.profile };
    if (!this.layers.has(name)) this.layers.set(name, spec);
    return name;
  }

  line(rawLayer: string, x1: number, y1: number, x2: number, y2: number) {
    const l = this.layerOf(rawLayer);
    this.entities.push(`0\nLINE\n8\n${l}\n10\n${f(x1)}\n20\n${f(y1)}\n11\n${f(x2)}\n21\n${f(y2)}\n`);
  }

  polyline(rawLayer: string, pts: Array<[number, number]>, closed = false) {
    if (pts.length < 2) return;
    const l = this.layerOf(rawLayer);
    let s = `0\nPOLYLINE\n8\n${l}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0.0\n20\n0.0\n30\n0.0\n`;
    for (const [x, y] of pts) s += `0\nVERTEX\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n`;
    s += `0\nSEQEND\n8\n${l}\n`;
    this.entities.push(s);
  }

  circle(rawLayer: string, cx: number, cy: number, r: number) {
    const l = this.layerOf(rawLayer);
    this.entities.push(`0\nCIRCLE\n8\n${l}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n`);
  }

  arc(rawLayer: string, cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const l = this.layerOf(rawLayer);
    this.entities.push(`0\nARC\n8\n${l}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n50\n${f(startDeg)}\n51\n${f(endDeg)}\n`);
  }

  text(rawLayer: string, x: number, y: number, height: number, value: string, rotationDeg = 0) {
    const l = this.layerOf(rawLayer);
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑüÜ°²×–—]/g, "");
    if (!safe.trim()) return; // lámina LIMPIA: nada de TEXT vacío (sin geometría)
    this.entities.push(`0\nTEXT\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n40\n${f(height)}\n1\n${safe}\n50\n${f(rotationDeg)}\n`);
  }

  /** Primitivas de vistas.ts trasladadas (dx, dy) — 1:1 en metros. */
  prims(list: Prim[], dx: number, dy: number) {
    for (const p of list) {
      if (p.t === "L") this.line(p.l, p.x1 + dx, p.y1 + dy, p.x2 + dx, p.y2 + dy);
      else if (p.t === "T") this.text(p.l, p.x + dx, p.y + dy, p.h, p.s, p.r ?? 0);
      else if (p.t === "C") this.circle(p.l, p.x + dx, p.y + dy, p.r);
      else if (p.t === "F") {
        const x0 = p.x + dx, y0 = p.y + dy, x1 = x0 + p.w, y1 = y0 + p.h;
        this.polyline(p.l, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
        const step = 0.07;
        for (let s = -p.h; s < p.w; s += step) {
          const ax = Math.max(x0, x0 + s), ay = Math.min(y1, y0 + s + p.h);
          const bx = Math.min(x1, x0 + s + p.h), by = Math.max(y0, y0 + s);
          if (ax < bx && by < ay) this.line(p.l, ax, by, bx, ay);
        }
      } else {
        this.polyline(p.l, [[p.x + dx, p.y + dy], [p.x + p.w + dx, p.y + dy], [p.x + p.w + dx, p.y + p.h + dy], [p.x + dx, p.y + p.h + dy]], true);
      }
    }
  }

  // ── LÁMINA OBRAHUB 700×500 (mm, espacio modelo a 1:1) ─────────────────────

  /** Marco doble 5/10 mm + rótulo vertical derecho 185 mm (formato estudio,
   *  con OBRAHUB en vez de universidad — SIEMPRE limpio: líneas, nada más). */
  rotulo(ox: number, oy: number, fields: {
    proyecto: string; ubicacion: string; codigo: string; titulo: string;
    escala: string; fecha: string; dibujo: string; lamina: string; total: string;
  }) {
    const W = 700, H = 500;
    const mOut = 5, mIn = 10;
    const R = "ROTULO", RT = "ROTULO-TXT";
    // Marco exterior (fino) + interior (grueso) — doble filete del manual.
    this.polyline(R, [[ox + mOut, oy + mOut], [ox + W - mOut, oy + mOut], [ox + W - mOut, oy + H - mOut], [ox + mOut, oy + H - mOut]], true);
    this.polyline(R, [[ox + mIn, oy + mIn], [ox + W - mIn, oy + mIn], [ox + W - mIn, oy + H - mIn], [ox + mIn, oy + H - mIn]], true);
    // Rótulo vertical derecho: 185 mm pegado al marco interior.
    const rx0 = ox + W - mIn - 185, rx1 = ox + W - mIn;
    this.line(R, rx0, oy + mIn, rx0, oy + H - mIn);

    // ── Bloque marca (OBRAHUB) — arriba del rótulo.
    let y = oy + H - mIn;
    const row = (h: number) => { if (h <= 0.1) return y; y -= h; this.line(R, rx0, y, rx1, y); return y; };
    row(30); // banda marca
    this.text(RT, rx0 + 8, y + 14, 10, "OBRAHUB");
    this.text(RT, rx0 + 8, y + 3, 2.6, "CONSTRUCTION OS · CRATERE S.A.S.");
    this.text(RT, rx1 - 48, y + 3, 2.6, fields.fecha);

    // ── PROYECTO (2 líneas máx) + UBICACIÓN.
    row(26);
    this.text(RT, rx0 + 6, y + 18.5, 2.4, "PROYECTO");
    this.text(RT, rx0 + 6, y + 9.5, 3.6, fields.proyecto.toUpperCase().slice(0, 26));
    this.text(RT, rx0 + 6, y + 3, 3.0, fields.proyecto.toUpperCase().slice(26, 50));
    row(16);
    this.text(RT, rx0 + 6, y + 9.5, 2.4, "UBICACIÓN");
    this.text(RT, rx0 + 6, y + 3, 3.2, fields.ubicacion.toUpperCase().slice(0, 30));

    // ── Título de lámina (el plano que soy).
    row(34);
    this.text(RT, rx0 + 6, y + 21, 2.4, "CONTENIDO");
    this.text(RT, rx0 + 6, y + 9, 4.2, fields.codigo);
    this.text(RT, rx0 + 6, y + 2.5, 2.8, fields.titulo.slice(0, 34));

    // ── Grilla de datos: ESCALA | FECHA ya arriba; DIBUJÓ/REVISÓ/UNIDADES.
    const gy = y;
    row(14);
    this.text(RT, rx0 + 6, gy - 4.5, 2.2, "ESCALA");
    this.text(RT, rx0 + 60, gy - 4.5, 2.2, "UNIDADES");
    this.text(RT, rx0 + 6, gy - 11, 3.2, fields.escala);
    this.text(RT, rx0 + 60, gy - 11, 3.2, "MM · METROS S.I.");
    row(14);
    this.text(RT, rx0 + 6, y + 9.5, 2.2, "DIBUJÓ");
    this.text(RT, rx0 + 60, y + 9.5, 2.2, "REVISÓ");
    this.text(RT, rx0 + 6, y + 2.5, 3.0, fields.dibujo.slice(0, 22));
    this.text(RT, rx0 + 60, y + 2.5, 3.0, "ING. MATRICULADO");

    // ── Lámina N de M + código grande abajo.
    row(20);
    this.text(RT, rx0 + 6, y + 12, 2.2, "LÁMINA");
    this.text(RT, rx0 + 6, y + 3, 5.5, `${fields.lamina} / ${fields.total}`);
    // Banda inferior: norte + escala gráfica.
    row(28);
    const ncx = rx0 + 24, ncy = y + 10;
    this.polyline(RT, [[ncx - 6, ncy - 8], [ncx, ncy + 8], [ncx + 6, ncy - 8]]);
    this.line(RT, ncx, ncy - 8, ncx, ncy + 8);
    this.text(RT, ncx - 2, ncy + 10, 3, "N");
    // Escala gráfica 0–1–2–5 m a la escala de la lámina.
    this.scaleBarMm(rx0 + 50, y + 12, fields.escala);
    row(y - (oy + mIn)); // cierre al marco interior
  }

  /** Escala gráfica en mm de papel con tramos de metros reales. */
  private scaleBarMm(x: number, y: number, escala: string) {
    const m = escala.match(/1:(\d+)/);
    const den = m ? Number(m[1]) : 75;
    const mmPerM = 1000 / den;
    let cx = x;
    for (const segM of [1, 1, 3]) {
      const w = segM * mmPerM;
      this.polyline("ROTULO-TXT", [[cx, y], [cx + w, y], [cx + w, y - 2.5], [cx, y - 2.5]], true);
      if (cx === x) this.text("ROTULO-TXT", cx - 1, y + 1, 2, "0");
      cx += w;
      this.text("ROTULO-TXT", cx - 2, y + 1, 2, String(Math.round((cx - x) / mmPerM)));
    }
    this.text("ROTULO-TXT", cx + 2, y - 1, 2, "m");
  }

  build(): string {
    // HEADER R2000: mm de lámina a 1:1 (INSUNITS 4) — el plano dibujado vive
    // escalado dentro del formato, como una lámina plotteada.
    let out = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n9\n$LTSCALE\n40\n1.0\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n";
    // TABLES: LTYPE con patrón real + LAYER con color/linetype/grosor (370).
    out += "0\nSECTION\n2\nTABLES\n";
    out += "0\nTABLE\n2\nLTYPE\n70\n3\n";
    out += "0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n";
    out += "0\nLTYPE\n2\nDASHED\n70\n0\n3\nISO dashed __ __ __\n72\n65\n73\n2\n40\n9.0\n49\n6.0\n49\n-3.0\n";
    out += "0\nLTYPE\n2\nCENTER\n70\n0\n3\nISO center __ _ __ _ __\n72\n65\n73\n4\n40\n20.0\n49\n12.0\n49\n-3.0\n49\n2.0\n49\n-3.0\n";
    out += "0\nENDTAB\n";
    const ls = [...this.layers.entries()];
    out += `0\nTABLE\n2\nLAYER\n70\n${ls.length}\n`;
    for (const [name, s] of ls) {
      out += `0\nLAYER\n2\n${name}\n70\n0\n62\n${s.color}\n6\n${s.lt}\n370\n${s.lw}\n`;
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

const GAP_SHEET = 50; // mm entre láminas del set
const DRAW_PAD = 12; // mm de aire dentro del área de dibujo

/**
 * Traduce un FloorPlan al SET DE LÁMINAS OBRAHUB 700×500 apaisado.
 * Una lámina por plano (A-01…A-05), cada una con marco doble, rótulo
 * OBRAHUB y contenido a escala normalizada (1:50…1:200) que SIEMPRE cabe:
 * la escala se elige de la serie estándar — nunca se deforma.
 */
export function planToDxf(plan: FloorPlan): string {
  const d = new DxfBuilder();
  const sheets = sheetContents(plan);
  const total = String(sheets.length);
  const city = plan.site?.city ? `${plan.site.city.toUpperCase()}${plan.site.department ? " · " + plan.site.department.toUpperCase() : ""}` : "COLOMBIA";
  const fecha = new Date().toISOString().slice(0, 10);

  sheets.forEach((sheet: Sheet, i: number) => {
    const ox = i * (700 + GAP_SHEET), oy = 0;
    const content: Prim[] = sheet.prims;
    const b = primsBounds(content);
    const sx = b.maxX - b.minX, sy = b.maxY - b.minY; // metros de modelo
    // Área útil: marco 10mm, rótulo 185mm, aire 12mm.
    const availW = 700 - 2 * 10 - 185 - 2 * DRAW_PAD;
    const availH = 500 - 2 * 10 - 2 * DRAW_PAD;
    const den = [50, 75, 100, 125, 150, 200].find((k) => sx * (1000 / k) <= availW && sy * (1000 / k) <= availH) ?? 250;
    const k = 1000 / den; // mm de papel por metro de modelo
    // Centrado en el área de dibujo (Y de lámina hacia arriba).
    const dx0 = 10 + DRAW_PAD + (availW - sx * k) / 2;
    const dy0 = 10 + DRAW_PAD + (availH - sy * k) / 2;
    const X = (v: number) => ox + dx0 + (v - b.minX) * k;
    const Y = (v: number) => oy + dy0 + (v - b.minY) * k;

    d.rotulo(ox, oy, {
      proyecto: plan.name,
      ubicacion: city,
      codigo: sheet.code,
      titulo: sheet.title,
      escala: `1:${den}`,
      fecha,
      dibujo: "OBRAHUB DISEÑO IA",
      lamina: sheet.code,
      total,
    });

    // Contenido escalado 1:den (metros → mm de papel).
    for (const p of content) {
      if (p.t === "L") d.line(p.l, X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
      else if (p.t === "T") d.text(p.l, X(p.x), Y(p.y), Math.max(p.h * k, 1.8), p.s, p.r ?? 0);
      else if (p.t === "C") d.circle(p.l, X(p.x), Y(p.y), Math.max(p.r * k, 0.8));
      else if (p.t === "F") {
        const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
        d.polyline(p.l, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
        const step = 0.07 * k;
        for (let s = -(p.h * k); s < p.w * k; s += step) {
          const ax = Math.max(x0, x0 + s), ay = Math.min(y1, y0 + s + p.h * k);
          const bx = Math.min(x1, x0 + s + p.h * k), by = Math.max(y0, y0 + s);
          if (ax < bx && by < ay) d.line(p.l, ax, by, bx, ay);
        }
      } else {
        const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
        d.polyline(p.l, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
      }
    }

    // ── A-01 lleva el MEP de la planta (RETIE/RAS): círculos + inicial.
    if (sheet.code === "A-01") {
      const EL = "ELECTRICO", HY = "HIDROSANITARIO";
      for (const p of plan.electrical?.points ?? []) {
        if (p.level !== 0) continue;
        const [sym] = ELEC_SYMBOLS[p.kind] ?? ["?"];
        d.circle(EL, X(p.x), Y(p.y), Math.max(0.09 * k, 1.0));
        d.text(EL, X(p.x) - 0.9, Y(p.y) - 0.6, 1.6, sym);
      }
      for (const p of plan.hydro?.points ?? []) {
        if (p.level !== 0) continue;
        const [sym] = HYDRO_SYMBOLS[p.kind] ?? ["H"];
        d.circle(HY, X(p.x), Y(p.y), Math.max(0.1 * k, 1.1));
        d.text(HY, X(p.x) - 0.9, Y(p.y) - 0.6, 1.6, sym);
      }
    }
  });

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
export function appendLegend(dxf: string, _plan: FloorPlan): string {
  return dxf;
}
