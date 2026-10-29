/**
 * ✏️ MOTOR DE PLOT COMPARTIDO — un cerebro, dos plumillas.
 *
 * La EMISIÓN de una lámina (rótulo OBRAHUB + contenido a escala + MEP) vive
 * AQUÍ una sola vez; el DXF (DxfBuilder) y el PDF (PdfPen) la consumen con
 * la MISMA geometría, la MISMA escala (fitSheetScale) y la MISMA tabla de
 * impresión CPNAA §4.3 (plotMm). Así el PDF imprime EXACTAMENTE lo que el
 * DXF declara — sin doble mantenimiento ni deriva entre formatos
 * (review de exportaciones: DXF y PDF deben salir del mismo modelo).
 *
 * PdfPen: PDF 1.4 vectorial SIN dependencias — páginas 700×500 mm a 1:1
 * (la escala del cajetín se comprueba con regla), tinta negra, plumillas
 * por clase de la tabla (mm reales), DASHED/CENTER reales, Helvetica
 * (WinAnsi, sin incrustar) y determinismo byte a byte.
 */

import type { FloorPlan } from "./schema";
import { plotMm, ANNOT, HATCH, PEN_BY_LAYER } from "./knowledge";
import { SHEET_AVAIL_W, SHEET_AVAIL_H, sheetContents, type Sheet } from "./sheets";
import { primsBounds, fitSheetScale, type Prim } from "./views";

/** Plumilla que sabe dibujar una lámina en mm (Y hacia arriba, origen 0,0). */
export type PlotPen = {
  line(layer: string, x1: number, y1: number, x2: number, y2: number, opts?: { thin?: boolean; dash?: boolean; cls?: string }): void;
  polyline(layer: string, pts: Array<[number, number]>, closed?: boolean, opts?: { cls?: string }): void;
  circle(layer: string, cx: number, cy: number, r: number): void;
  text(layer: string, x: number, y: number, height: number, value: string, rotationDeg?: number): void;
  solid(layer: string, x0: number, y0: number, x1: number, y1: number): void;
  /** Fija el denominador de escala de la lámina en curso (tabla §4.3). */
  setPlot(den: number): void;
};

export type RotuloFields = {
  proyecto: string; ubicacion: string; codigo: string; titulo: string;
  escala: string; fecha: string; dibujo: string; lamina: string; total: string;
};

/** Divide un texto en líneas que caben en `maxChars` sin cortar palabras.
 *  Si necesita más de `maxLines`, NO funde líneas (desbordaría el rótulo):
 *  reduce el ancho objetivo y re-envuelve — devuelve las líneas y el factor
 *  de altura que las hace caber. JAMÁS trunca (QA de plot). */
export function fitWrap(s: string, maxChars: number, maxLines = 2): { lines: string[]; hScale: number } {
  const wrap = (width: number) => {
    const words = s.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length > width && cur) { lines.push(cur); cur = w; } else cur = cand;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  let width = maxChars;
  let lines = wrap(width);
  let guard = 0;
  while (lines.length > maxLines && guard++ < 24) {
    width = Math.ceil(width * 1.18);
    lines = wrap(width);
  }
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const hScale = Math.min(1, maxChars / longest);
  return { lines, hScale };
}

/** Escala gráfica en mm de papel con tramos de metros reales (rótulo). */
function drawScaleBar(pen: PlotPen, x: number, y: number, escala: string) {
  const m = escala.match(/1:(\d+)/);
  const den = m ? Number(m[1]) : 75;
  const mmPerM = 1000 / den;
  let cx = x;
  for (const segM of [1, 1, 3]) {
    const w = segM * mmPerM;
    pen.polyline("ROTULO-TXT", [[cx, y], [cx + w, y], [cx + w, y - 2.5], [cx, y - 2.5]], true);
    if (cx === x) pen.text("ROTULO-TXT", cx - 1, y + 1, 2.2, "0");
    cx += w;
    pen.text("ROTULO-TXT", cx - 2, y + 1, 2.2, String(Math.round((cx - x) / mmPerM)));
  }
  pen.text("ROTULO-TXT", cx + 2, y - 1, 2.2, "m");
}

/** Rótulo OBRAHUB (franja vertical 185 mm) — LA MISMA para DXF y PDF.
 *  Jerarquía de plumilla ISO 5457: marco exterior = cut (el más pesado de
 *  la lámina), marco interior = cubt, divisor = profile, filas del cajetín
 *  = finas — el rótulo también LEE por pesos, no todo a 0.2 plano. */
export function drawRotulo(pen: PlotPen, ox: number, oy: number, fields: RotuloFields) {
  const W = 700, H = 500;
  const mOut = 5, mIn = 10;
  const R = "ROTULO", RT = "ROTULO-TXT";
  pen.polyline(R, [[ox + mOut, oy + mOut], [ox + W - mOut, oy + mOut], [ox + W - mOut, oy + H - mOut], [ox + mOut, oy + H - mOut]], true, { cls: "cut" });
  pen.polyline(R, [[ox + mIn, oy + mIn], [ox + W - mIn, oy + mIn], [ox + W - mIn, oy + H - mIn], [ox + mIn, oy + H - mIn]], true, { cls: "cubt" });
  const rx0 = ox + W - mIn - 185, rx1 = ox + W - mIn;
  pen.line(R, rx0, oy + mIn, rx0, oy + H - mIn, { cls: "profile" });

  let y = oy + H - mIn;
  const row = (h: number) => { if (h <= 0.1) return y; y -= h; pen.line(R, rx0, y, rx1, y, { thin: true }); return y; };
  row(30);
  pen.text(RT, rx0 + 8, y + 14, 10, "OBRAHUB");
  pen.text(RT, rx0 + 8, y + 3, 2.6, "CONSTRUCTION OS · CRATERE S.A.S.");
  pen.text(RT, rx1 - 48, y + 3, 2.6, fields.fecha);

  row(26);
  pen.text(RT, rx0 + 6, y + 18.5, 2.5, "PROYECTO");
  const pj = fitWrap(fields.proyecto.toUpperCase(), 68, 2);
  pj.lines.slice(0, 2).forEach((ln, i) =>
    pen.text(RT, rx0 + 6, y + 9.5 - i * (4.6 * pj.hScale), 3.6 * pj.hScale, ln));
  row(16);
  pen.text(RT, rx0 + 6, y + 9.5, 2.5, "UBICACIÓN");
  const ub = fitWrap(fields.ubicacion.toUpperCase(), 77, 2);
  ub.lines.slice(0, 2).forEach((ln, i) =>
    pen.text(RT, rx0 + 6, y + 6.2 - i * (4 * ub.hScale), 3.2 * ub.hScale, ln));

  row(34);
  pen.text(RT, rx0 + 6, y + 21, 2.5, "CONTENIDO");
  pen.text(RT, rx0 + 6, y + 9, 4.2, fields.codigo);
  const tt = fitWrap(fields.titulo, 88, 3);
  tt.lines.slice(0, 3).forEach((ln, i) =>
    pen.text(RT, rx0 + 6, y + 3.5 - i * (3.6 * tt.hScale), 2.8 * tt.hScale, ln));

  const gy = y;
  row(14);
  pen.text(RT, rx0 + 6, gy - 4.5, 2.5, "ESCALA");
  pen.text(RT, rx0 + 60, gy - 4.5, 2.5, "UNIDADES");
  pen.text(RT, rx0 + 6, gy - 11, 3.2, fields.escala);
  pen.text(RT, rx0 + 60, gy - 11, 3.2, "MM · METROS S.I.");
  row(14);
  pen.text(RT, rx0 + 6, y + 9.5, 2.5, "DIBUJÓ");
  pen.text(RT, rx0 + 60, y + 9.5, 2.5, "REVISÓ");
  const db = fitWrap(fields.dibujo.toUpperCase(), 25, 2);
  db.lines.slice(0, 2).forEach((ln, i) =>
    pen.text(RT, rx0 + 6, y + 4.6 - i * (3.4 * db.hScale), 3.0 * db.hScale, ln));
  pen.text(RT, rx0 + 60, y + 2.5, 2.6, "PENDIENTE DE REVISIÓN");

  row(20);
  pen.text(RT, rx0 + 6, y + 12, 2.5, "LÁMINA");
  pen.text(RT, rx0 + 6, y + 3, 5.5, `${fields.lamina} / ${fields.total}`);
  row(28);
  const ncx = rx0 + 24, ncy = y + 10;
  pen.polyline(RT, [[ncx - 6, ncy - 8], [ncx, ncy + 8], [ncx + 6, ncy - 8]]);
  pen.line(RT, ncx, ncy - 8, ncx, ncy + 8);
  pen.text(RT, ncx - 2, ncy + 10, 3, "N");
  drawScaleBar(pen, rx0 + 50, y + 12, fields.escala);
  row(y - (oy + mIn));
}

/** EMISIÓN de una lámina completa (formato + rótulo + contenido + MEP) —
 *  el corazón compartido entre DXF y PDF. Misma escala, mismos textos,
 *  mismas colisiones resueltas: lo que sale, sale igual en ambos. */
export function emitSheet(
  pen: PlotPen,
  plan: FloorPlan,
  sheet: Sheet,
  opts: { ox: number; oy?: number; total: string; fecha: string; city: string },
) {
  const ox = opts.ox, oy = opts.oy ?? 0;
  const content: Prim[] = sheet.prims;
  const b = primsBounds(content);
  const sx = b.maxX - b.minX, sy = b.maxY - b.minY; // metros de modelo
  const availW = SHEET_AVAIL_W, availH = SHEET_AVAIL_H;
  const den = fitSheetScale(content, availW, availH);
  const k = 1000 / den; // mm de papel por metro de modelo
  const dx0 = 10 + 12 + (availW - sx * k) / 2;
  const dy0 = 10 + 12 + (availH - sy * k) / 2;
  const X = (v: number) => ox + dx0 + (v - b.minX) * k;
  const Y = (v: number) => oy + dy0 + (v - b.minY) * k;
  const lvl = sheet.level ?? 0;
  pen.setPlot(den);

  drawRotulo(pen, ox, oy, {
    proyecto: plan.name,
    ubicacion: opts.city,
    codigo: sheet.code,
    titulo: sheet.title,
    escala: `1:${den}`,
    fecha: opts.fecha,
    dibujo: "OBRAHUB DISEÑO IA",
    lamina: sheet.code,
    total: opts.total,
  });

  for (const p of content) {
    if (p.t === "L") pen.line(p.l, X(p.x1), Y(p.y1), X(p.x2), Y(p.y2), { thin: p.thin, dash: p.dash });
    else if (p.t === "T") pen.text(p.l, X(p.x), Y(p.y), Math.max(p.h * k, ANNOT.minTextMm), p.s, p.r ?? 0);
    else if (p.t === "C") pen.circle(p.l, X(p.x), Y(p.y), Math.max(p.r * k, 0.8));
    else if (p.t === "F") {
      const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
      if (p.l === "MUROS" && Math.min(p.w, p.h) * k >= HATCH.solidBelowMm) {
        pen.polyline(p.l, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
        const step = HATCH.spacingMm;
        for (let s = -(p.h * k); s < p.w * k; s += step) {
          const ax = Math.max(x0, x0 + s), ay = Math.min(y1, y0 + s + p.h * k);
          const bx = Math.min(x1, x0 + s + p.h * k), by = Math.max(y0, y0 + s);
          if (ax < bx && by < ay) pen.line(p.l, ax, by, bx, ay, { cls: "achu" });
        }
      } else {
        pen.solid(p.l, x0, y0, x1, y1);
      }
    } else {
      const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
      pen.polyline(p.l, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
    }
  }
  // Los SÍMBOLOS MEP ya NO viajan en A-01: el paquete arquitectónico sale
  // PURO a curaduría y las instalaciones viven en sus láminas I-01/I-02
  // (mep.ts las dibuja con mepSymbols — mismo solver anti-amontonamiento).
}

// ── Plumilla PDF ─────────────────────────────────────────────────────────────

const PT = 72 / 25.4; // mm → puntos PDF
const KAPPA = 0.5522847495;

/** Grosor de impresión (mm) por clase de la tabla CPNAA §4.3 — la MISMA
 *  fuente del código 370 del DXF (plotMm), para paridad exacta de plumilla. */
function penMm(layer: string, den: number, clsOverride?: string): number {
  const cls = clsOverride ?? PEN_BY_LAYER[layer] ?? "profile";
  return den > 0 ? plotMm(cls, den) : 0.2;
}

class PdfPen implements PlotPen {
  private ops: string[] = [];
  private den = 0;
  readonly pages: string[] = [];

  setPlot(den: number) { this.den = den; }

  private lw(layer: string, thin: boolean | undefined, cls?: string): string {
    let w = penMm(layer, this.den, cls);
    if (thin) w *= 0.72;
    return `${fmt(w * PT)} w`;
  }

  /** Patrón de línea: ejes = CENTER (punto-raya), proyecciones = DASHED. */
  private dashPat(layer: string, dash: boolean | undefined): string {
    if (!dash) return "[] 0 d";
    const cls = PEN_BY_LAYER[layer] ?? "profile";
    const mm = cls === "ejes" ? [12, 3, 2, 3] : [6, 3];
    return `[${mm.map((v) => fmt(v * PT)).join(" ")}] 0 d`;
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number, opts: { thin?: boolean; dash?: boolean; cls?: string } = {}) {
    this.ops.push(
      `${this.dashPat(layer, opts.dash)} ${this.lw(layer, opts.thin, opts.cls)} 0 G ` +
      `${fmt(x1 * PT)} ${fmt(y1 * PT)} m ${fmt(x2 * PT)} ${fmt(y2 * PT)} l S`,
    );
  }

  polyline(layer: string, pts: Array<[number, number]>, closed = false, opts: { cls?: string } = {}) {
    if (pts.length < 2) return;
    let s = `${this.lw(layer, false, opts.cls)} 0 G ${fmt(pts[0][0] * PT)} ${fmt(pts[0][1] * PT)} m `;
    for (let i = 1; i < pts.length; i++) s += `${fmt(pts[i][0] * PT)} ${fmt(pts[i][1] * PT)} l `;
    this.ops.push(s + (closed ? "h S" : "S"));
  }

  circle(layer: string, cx: number, cy: number, r: number) {
    const x = cx * PT, y = cy * PT, rp = r * PT;
    const o = rp * KAPPA;
    this.ops.push(
      `${this.lw(layer, false)} 0 G ${fmt(x + rp)} ${fmt(y)} m ` +
      `${fmt(x + rp)} ${fmt(y + o)} ${fmt(x + o)} ${fmt(y + rp)} ${fmt(x)} ${fmt(y + rp)} c ` +
      `${fmt(x - o)} ${fmt(y + rp)} ${fmt(x - rp)} ${fmt(y + o)} ${fmt(x - rp)} ${fmt(y)} c ` +
      `${fmt(x - rp)} ${fmt(y - o)} ${fmt(x - o)} ${fmt(y - rp)} ${fmt(x)} ${fmt(y - rp)} c ` +
      `${fmt(x + o)} ${fmt(y - rp)} ${fmt(x + rp)} ${fmt(y - o)} ${fmt(x + rp)} ${fmt(y)} c S`,
    );
  }

  text(layer: string, x: number, y: number, height: number, value: string, rotationDeg = 0) {
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\xFF]/g, "").replace(/([()\\])/g, "\\$1");
    if (!safe.trim()) return;
    const size = fmt(height * PT);
    const tm = Math.abs(rotationDeg - 90) < 1
      ? `0 ${size} -${size} 0`   // 90°: columna (matriz de rotación)
      : `${size} 0 0 ${size}`;
    this.ops.push(`BT ${tm} ${fmt(x * PT)} ${fmt(y * PT)} Tm /F1 1 Tf (${safe}) Tj ET`);
  }

  solid(layer: string, x0: number, y0: number, x1: number, y1: number) {
    this.ops.push(`0 g ${fmt(x0 * PT)} ${fmt(y0 * PT)} ${fmt((x1 - x0) * PT)} ${fmt((y1 - y0) * PT)} re f`);
  }

  endPage() {
    this.pages.push(this.ops.join("\n"));
    this.ops = [];
  }
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** PDF del SET COMPLETO: una página 700×500 mm por lámina, a 1:1 — el plot
 *  que el cajetón declara (misma escala/texto/plumilla que el DXF, del
 *  mismo motor emitSheet). Determinista (la fecha la pasa quien llama). */
export function planToPdf(plan: FloorPlan, sheets: Sheet[], opts: { fecha?: string } = {}): string {
  const pen = new PdfPen();
  const fecha = opts.fecha ?? "";
  const total = String(sheets.length);
  const city = plan.site?.city ? `${plan.site.city.toUpperCase()}${plan.site.department ? " · " + plan.site.department.toUpperCase() : ""}` : "COLOMBIA";
  for (const sheet of sheets) {
    emitSheet(pen, plan, sheet, { ox: 0, oy: 0, total, fecha, city });
    pen.endPage();
  }
  return buildPdf(pen.pages);
}

/** PDF del set de láminas del plan (A-00…A-06) — listo para Blob/descarga. */
export function planToPdfSet(plan: FloorPlan, opts: { fecha?: string } = {}): string {
  return planToPdf(plan, sheetContents(plan), opts);
}

/** Bytes latin1 del PDF (TextEncoder lo rompería: WinAnsi es 1 byte/char). */
export function pdfBytes(pdf: string): Uint8Array {
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Ensambla el árbol de objetos PDF con xref correcto (latin1, sin comprimir
 *  — determinista e inspeccionable). */
function buildPdf(pages: string[]): string {
  const W = fmt(700 * PT), H = fmt(500 * PT);
  const objs: string[] = [];
  // 1: catalog · 2: pages · 3: font · luego pares (page, contents).
  const kids: string[] = [];
  const firstPageObj = 4;
  pages.forEach((_, i) => kids.push(`${firstPageObj + i * 2} 0 R`));
  objs.push(`<</Type/Catalog/Pages 2 0 R>>`);
  objs.push(`<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pages.length}>>`);
  objs.push(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`);
  pages.forEach((stream, i) => {
    const pageObj = firstPageObj + i * 2, contentObj = pageObj + 1;
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 3 0 R>>>>/Contents ${contentObj} 0 R>>`);
    objs.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return out;
}
