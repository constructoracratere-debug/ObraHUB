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
import { PENS, plotMm } from "./knowledge";
import { sheetContents, type Sheet } from "./sheets";
import { primsBounds, ELEC_SYMBOLS, HYDRO_SYMBOLS, type Prim } from "./views";

// Símbolos MEP: fuente única en views.ts (plano y leyenda comparten tabla).
export { ELEC_SYMBOLS, HYDRO_SYMBOLS };

type Entity = string;

/** Grosor DXF (código 370) = centésimas de mm. */
const LW = { cut: 70, profile: 35, thin: 25, extra: 13 } as const;
type Linetype = "CONTINUOUS" | "DASHED" | "CENTER";

class DxfBuilder {
  private entities: Entity[] = [];
  /** Tabla de capas: nombre → color (plumilla ISO), linetype, grosor mm,
   *  clase de plot (tabla CPNAA §4.3). */
  private layers = new Map<string, { color: number; lt: Linetype; lw: number; cls: string }>();
  /** Escala de la lámina en curso (denominador): activa el 370 por entidad
   *  con los mm REALES de la tabla de impresión CPNAA. 0 = solo plantilla. */
  private plotDen = 0;

  /** Fija la escala de plot para las entidades que siguen (por lámina). */
  setPlot(den: number) {
    this.plotDen = den;
  }

  /** 370 (centésimas de mm) de una capa a la escala de la lámina en curso —
   *  tabla CPNAA §4.3, la misma de SVG/PDF. Sin escala: default plantilla. */
  private lw370(layer: string): number {
    const spec = this.layers.get(layer);
    if (!spec || this.plotDen === 0) return -1; // BYLAYER
    return Math.round(plotMm(spec.cls, this.plotDen) * 100);
  }

  /** Nomenclatura A/E/I por disciplina — ÚNICO punto de mapeo: entidades y
   *  tabla usan siempre el MISMO nombre (antes la tabla decía A-MUROS y las
   *  entidades quedaban en MUROS huérfano — capas fantasma en AutoCAD).
   *  Conserva el sufijo de nivel (-N2, -N3…) tras normalizar la disciplina:
   *  así cada piso puede apagarse por capa en CAD (iso 13567 grupo
   *  secundario). */
  private static cad(l: string): string {
    const m = l.match(/^(.*?)(-N\d+)$/);
    const base = m?.[1] ?? l;
    const sfx = m?.[2] ?? "";
    if (/^(MUROS|MUROS-ACHU|CORTE|PUERTAS|VENTANAS|MOBILIARIO|SANITARIOS|FACHADA|TEXTOS|COTAS|EJES|ROTULO|ROTULO-TXT)$/.test(base)) return "A-" + base + sfx;
    if (/^FACHADA-/.test(base)) return "A-" + base + sfx;
    if (/^ESTRUCTURA/.test(base)) return "S-ELEMENTOS" + sfx;
    if (/^ELECTRICO/.test(base)) return "I-ELECTRICO" + sfx;
    if (/^HIDRO/.test(base)) return "I-HIDRAULICO" + sfx;
    return l;
  }

  private layerOf(raw: string): string {
    const name = DxfBuilder.cad(raw);
    // Especificación por capa: color (plantilla ISO 128) + linetype + grosor
    // default + CLASE de plot (tabla CPNAA §4.3 → 370 real por entidad).
    // El sufijo de nivel no cambia la clase: se compara la base.
    const base = name.replace(/-N\d+$/, "");
    const spec: { color: number; lt: Linetype; lw: number; cls: string } =
      /^(A-MUROS|A-CORTE|S-ELEMENTOS)$/.test(base) ? { color: PENS.cut.dxfColor, lt: "CONTINUOUS", lw: LW.cut, cls: "cut" }
      : /^A-MUROS-ACHU$/.test(base) ? { color: 8, lt: "CONTINUOUS", lw: LW.thin, cls: "achu" }
      : /^I-ELECTRICO$/.test(base) ? { color: PENS.thin.dxfColor, lt: "DASHED", lw: LW.thin, cls: "elec" }
      : /^I-HIDRAULICO$/.test(base) ? { color: PENS.extra.dxfColor, lt: "DASHED", lw: LW.thin, cls: "hid" }
      : /^A-EJES$/.test(base) ? { color: PENS.extra.dxfColor, lt: "CENTER", lw: LW.extra, cls: "ejes" }
      : /^(A-TEXTOS|A-COTAS)$/.test(base) ? { color: PENS.extra.dxfColor, lt: "CONTINUOUS", lw: LW.extra, cls: "text" }
      : /^(A-ROTULO|A-ROTULO-TXT)$/.test(base) ? { color: 7, lt: "CONTINUOUS", lw: name.startsWith("A-ROTULO-TXT") ? LW.thin : LW.profile, cls: "text" }
      : /^A-FACHADA/.test(base) ? { color: PENS.profile.dxfColor, lt: "CONTINUOUS", lw: LW.profile, cls: "cubt" }
      : { color: PENS.profile.dxfColor, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" };
    if (!this.layers.has(name)) this.layers.set(name, spec);
    return name;
  }

  line(rawLayer: string, x1: number, y1: number, x2: number, y2: number, opts: { thin?: boolean; dash?: boolean } = {}) {
    const l = this.layerOf(rawLayer);
    const spec = this.layers.get(l);
    let lw = this.lw370(l);
    if (lw > 0 && opts.thin) lw = Math.round(lw * 0.72); // un paso abajo (≈ serie)
    // prims con dash = línea discontinua: ejes conservan CENTER (punto-raya
    // de la guía), el resto (proyecciones, cuerdas de puertas) → DASHED.
    const lt = opts.dash ? (spec?.cls === "ejes" ? "CENTER" : "DASHED") : null;
    this.entities.push(`0\nLINE\n8\n${l}${lt ? `\n6\n${lt}` : ""}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(x1)}\n20\n${f(y1)}\n11\n${f(x2)}\n21\n${f(y2)}\n`);
  }

  polyline(rawLayer: string, pts: Array<[number, number]>, closed = false) {
    if (pts.length < 2) return;
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    let s = `0\nPOLYLINE\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0.0\n20\n0.0\n30\n0.0\n`;
    for (const [x, y] of pts) s += `0\nVERTEX\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n`;
    s += `0\nSEQEND\n8\n${l}\n`;
    this.entities.push(s);
  }

  circle(rawLayer: string, cx: number, cy: number, r: number) {
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    this.entities.push(`0\nCIRCLE\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n`);
  }

  arc(rawLayer: string, cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    this.entities.push(`0\nARC\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(cx)}\n20\n${f(cy)}\n40\n${f(r)}\n50\n${f(startDeg)}\n51\n${f(endDeg)}\n`);
  }

  text(rawLayer: string, x: number, y: number, height: number, value: string, rotationDeg = 0) {
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑüÜ°²×–—]/g, "");
    if (!safe.trim()) return; // lámina LIMPIA: nada de TEXT vacío (sin geometría)
    this.entities.push(`0\nTEXT\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(x)}\n20\n${f(y)}\n40\n${f(height)}\n1\n${safe}\n50\n${f(rotationDeg)}\n`);
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
 * Una lámina por plano (A-01…A-05; A-01.2… por nivel), cada una con marco
 * doble, rótulo OBRAHUB y contenido a escala normalizada (1:50…1:200) que
 * SIEMPRE cabe: la escala se elige de la serie estándar — nunca se deforma.
 *
 * DETERMINISMO PURO: misma entrada → mismo byte, cualquier día. La fecha
 * del rótulo NO se toma del reloj aquí — la pasa quien llama (fecha de
 * producción del archivo) vía opts.fecha; sin ella, la celda queda vacía.
 */
export function planToDxf(plan: FloorPlan, opts: { fecha?: string } = {}): string {
  const d = new DxfBuilder();
  const sheets = sheetContents(plan);
  const total = String(sheets.length);
  const city = plan.site?.city ? `${plan.site.city.toUpperCase()}${plan.site.department ? " · " + plan.site.department.toUpperCase() : ""}` : "COLOMBIA";
  const fecha = opts.fecha ?? "";

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
    // Capas por nivel en las láminas de planta (A-01*): MUROS-N2 →
    // A-MUROS-N2 — cada piso es apagable en CAD (iso 13567). Las capas de
    // anotación y el resto de láminas quedan compartidas.
    const lvl = sheet.level ?? 0;
    const sfxL = plan.levels > 1 && sheet.level != null ? `-N${lvl + 1}` : "";
    const lay = (l: string) => (/^(MUROS|MUROS-ACHU|PUERTAS|VENTANAS|MOBILIARIO|SANITARIOS|ELECTRICO|HIDROSANITARIO)$/.test(l) ? l + sfxL : l);
    // Escala REAL de esta lámina → 370 por entidad con la tabla CPNAA §4.3.
    d.setPlot(den);

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

    // Contenido escalado 1:den (metros → mm de papel). Los flags de
    // primitiva (thin/dash) PASAN IGUAL que en el SVG/PDF — misma línea,
    // mismo formato.
    for (const p of content) {
      const pl = lay(p.l);
      if (p.t === "L") d.line(pl, X(p.x1), Y(p.y1), X(p.x2), Y(p.y2), { thin: p.thin, dash: p.dash });
      else if (p.t === "T") d.text(pl, X(p.x), Y(p.y), Math.max(p.h * k, 1.8), p.s, p.r ?? 0);
      else if (p.t === "C") d.circle(pl, X(p.x), Y(p.y), Math.max(p.r * k, 0.8));
      else if (p.t === "F") {
        const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
        d.polyline(pl, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
        // Achurado del poché en su PROPIA capa-ROW de la tabla CPNAA
        // (A-MURO-ACHU: 0.30 mm @1:50 — más fino que el corte 0.60).
        const hatchL = lay(p.l === "MUROS" ? "MUROS-ACHU" : p.l);
        const step = 0.07 * k;
        for (let s = -(p.h * k); s < p.w * k; s += step) {
          const ax = Math.max(x0, x0 + s), ay = Math.min(y1, y0 + s + p.h * k);
          const bx = Math.min(x1, x0 + s + p.h * k), by = Math.max(y0, y0 + s);
          if (ax < bx && by < ay) d.line(hatchL, ax, by, bx, ay);
        }
      } else {
        const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
        d.polyline(pl, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
      }
    }

    // ── Las láminas de planta (A-01*) llevan el MEP de SU nivel
    //    (RETIE/RAS): círculos + inicial.
    if (sheet.code.startsWith("A-01")) {
      const EL = lay("ELECTRICO"), HY = lay("HIDROSANITARIO");
      for (const p of plan.electrical?.points ?? []) {
        if (p.level !== lvl) continue;
        const [sym] = ELEC_SYMBOLS[p.kind] ?? ["?"];
        d.circle(EL, X(p.x), Y(p.y), Math.max(0.09 * k, 1.0));
        d.text(EL, X(p.x) - 0.9, Y(p.y) - 0.6, 1.6, sym);
      }
      for (const p of plan.hydro?.points ?? []) {
        if (p.level !== lvl) continue;
        const [sym] = HYDRO_SYMBOLS[p.kind] ?? ["H"];
        d.circle(HY, X(p.x), Y(p.y), Math.max(0.1 * k, 1.1));
        d.text(HY, X(p.x) - 0.9, Y(p.y) - 0.6, 1.6, sym);
      }
    }
  });

  return d.build();
}
