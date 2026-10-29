/**
 * ✏️ Diseño IA — Motor DXF determinístico · FORMATO OBRAHUB.
 *
 * 📕 SE RIGE POR docs/GUIA-ESTANDARES-DIBUJO.md (Guía CPNAA — EL LIBRO
 * OBLIGATORIO de ObraHub). Antes de cambiar capas, plumillas, escalas,
 * acotación, formato o rótulo: léelo. Su checklist está testificado en
 * scripts/test-design-dxf.mjs.
 *
 * ASCII DXF R2007 (AC1021, UTF-8 nativo): compatibilidad universal y añade
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
import { plotMm } from "./knowledge";
import { sheetContents, type Sheet } from "./sheets";
import { emitSheet } from "./plot";
import { ELEC_SYMBOLS, HYDRO_SYMBOLS, mepSymbols, plantaPrimitives, primsBounds } from "./views";

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
   *  tabla CPNAA §4.3, la misma de SVG/PDF. Sin escala: default plantilla.
   *  `clsOverride` cambia la FILA sin cambiar de capa (el achurado del
   *  poché vive en A-MUROS pero imprime con la fila achu). */
  private lw370(layer: string, clsOverride?: string): number {
    const spec = this.layers.get(layer);
    if (!spec || this.plotDen === 0) return -1; // BYLAYER
    return Math.round(plotMm(clsOverride ?? spec.cls, this.plotDen) * 100);
  }

  /** Nomenclatura A/E/I por disciplina — ÚNICO punto de mapeo: entidades y
   *  tabla usan siempre el MISMO nombre. Capas GLOBALES por categoría, SIN
   *  sufijo de nivel (review #11): apagar A-MUROS apaga TODO muro de TODOS
   *  los niveles — así se controla el dibujo en CAD. Estructura separada
   *  por tipo (S-COLUMNAS/VIGAS/LOSAS/CIMENTACION). */
  private static cad(l: string): string {
    const m = l.match(/^ESTRUCTURA-(COLUMNAS|VIGAS|LOSAS|CIMENTACION)$/);
    if (m) return "S-" + m[1];
    if (/^FACHADA/.test(l)) return "A-FACHADA";
    if (/^(MUROS|CORTE|PUERTAS|VENTANAS|MOBILIARIO|SANITARIOS|TEXTOS|COTAS|EJES|ROTULO|ROTULO-TXT|ACABADOS)$/.test(l)) return "A-" + l;
    if (/^ESTRUCTURA/.test(l)) return "S-ELEMENTOS";
    if (/^ELECTRICO/.test(l)) return "I-ELECTRICO";
    if (/^HIDRO/.test(l)) return "I-HIDRAULICO";
    return l;
  }

  private layerOf(raw: string): string {
    const name = DxfBuilder.cad(raw);
    // Especificación por capa (guía §1): COLOR ACAD de identidad en pantalla
    // + linetype + grosor default + CLASE de plot (tabla CPNAA §4.3 → 370
    // real por entidad — el color NO controla la plumilla, el plot es B/N).
    const spec: { color: number; lt: Linetype; lw: number; cls: string } =
      /^(A-MUROS|A-CORTE)$/.test(name) ? { color: 7, lt: "CONTINUOUS", lw: LW.cut, cls: "cut" }
      : /^(S-COLUMNAS|S-VIGAS|S-LOSAS|S-CIMENTACION|S-ELEMENTOS)$/.test(name) ? { color: 8, lt: "CONTINUOUS", lw: LW.cut, cls: "cut" }
      : /^I-ELECTRICO$/.test(name) ? { color: 2, lt: "DASHED", lw: LW.thin, cls: "elec" }
      : /^I-HIDRAULICO$/.test(name) ? { color: 4, lt: "DASHED", lw: LW.thin, cls: "hid" }
      : /^A-EJES$/.test(name) ? { color: 1, lt: "CENTER", lw: LW.extra, cls: "ejes" }
      : /^(A-TEXTOS|A-COTAS)$/.test(name) ? { color: name === "A-COTAS" ? 3 : 7, lt: "CONTINUOUS", lw: LW.extra, cls: "text" }
      : /^A-ACABADOS$/.test(name) ? { color: 9, lt: "CONTINUOUS", lw: LW.extra, cls: "text" }
      : /^(A-ROTULO|A-ROTULO-TXT)$/.test(name) ? { color: 7, lt: "CONTINUOUS", lw: name.startsWith("A-ROTULO-TXT") ? LW.thin : LW.profile, cls: "text" }
      : /^A-FACHADA$/.test(name) ? { color: 7, lt: "CONTINUOUS", lw: LW.profile, cls: "cubt" }
      : /^A-PUERTAS$/.test(name) ? { color: 6, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" }
      : /^A-VENTANAS$/.test(name) ? { color: 5, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" }
      : /^A-MOBILIARIO$/.test(name) ? { color: 9, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" }
      : /^A-SANITARIOS$/.test(name) ? { color: 4, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" }
      : { color: 7, lt: "CONTINUOUS", lw: LW.profile, cls: "profile" };
    if (!this.layers.has(name)) this.layers.set(name, spec);
    return name;
  }

  line(rawLayer: string, x1: number, y1: number, x2: number, y2: number, opts: { thin?: boolean; dash?: boolean; cls?: string } = {}) {
    const l = this.layerOf(rawLayer);
    const spec = this.layers.get(l);
    let lw = this.lw370(l, opts.cls);
    if (lw > 0 && opts.thin) lw = Math.round(lw * 0.72); // un paso abajo (≈ serie)
    // prims con dash = línea discontinua: ejes conservan CENTER (punto-raya
    // de la guía), el resto (proyecciones, cuerdas de puertas) → DASHED.
    const lt = opts.dash ? (spec?.cls === "ejes" ? "CENTER" : "DASHED") : null;
    this.entities.push(`0\nLINE\n8\n${l}${lt ? `\n6\n${lt}` : ""}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(x1)}\n20\n${f(y1)}\n11\n${f(x2)}\n21\n${f(y2)}\n`);
  }

  /** LWPOLYLINE (moderna, R13+): un solo registro con vértices 10/20 — los
   *  visores web y CAD actuales la renderizan SIEMPRE (la POLYLINE clásica
   *  con VERTEX/SEQEND se pierde en algunos viewers: "el DXF llega sin
   *  muros" era eso). Grosor 370 por entidad como toda línea. */
  polyline(rawLayer: string, pts: Array<[number, number]>, closed = false, opts: { cls?: string } = {}) {
    if (pts.length < 2) return;
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l, opts.cls);
    // Subclass markers (100) obligatorios en AC1021: ezdxf/AutoCAD los
    // exigen para LWPOLYLINE ("missing AcDbPolyline subclass" sin ellos).
    let s = `0\nLWPOLYLINE\n100\nAcDbEntity\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n100\nAcDbPolyline\n90\n${pts.length}\n70\n${closed ? 1 : 0}\n`;
    for (const [x, y] of pts) s += `10\n${f(x)}\n20\n${f(y)}\n`;
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

  /** Símbolo RELLENO (manija de puerta, marca de corte, zapata): SOLID —
   *  relleno verdadero, sin achurado. El poché de muros es aparte (hatch).
   *  Lleva 370 como cualquier entidad (la política de grosor es una sola). */
  solid(rawLayer: string, x0: number, y0: number, x1: number, y1: number) {
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    // Orden de vértices SOLID: 1→2→4→3 (patrón Z) para orientar el relleno.
    this.entities.push(
      `0\nSOLID\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n10\n${f(x0)}\n20\n${f(y0)}\n30\n0.0\n` +
      `11\n${f(x1)}\n21\n${f(y0)}\n31\n0.0\n` +
      `12\n${f(x0)}\n22\n${f(y1)}\n32\n0.0\n` +
      `13\n${f(x1)}\n23\n${f(y1)}\n33\n0.0\n`,
    );
  }

  text(rawLayer: string, x: number, y: number, height: number, value: string, rotationDeg = 0) {
    const l = this.layerOf(rawLayer);
    const lw = this.lw370(l);
    // WinAnsi ampliado: Ø/ø y fracciones ½¼¾ viven en TODA lámina de
    // instalaciones (diámetros Ø1/2", Ø3"... ) — sin ellos el cuadro pierde
    // su unidad delante del revisor.
    const safe = value.replace(/[\n\r]/g, " ").replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑüÜ°²×–—Øø½¼¾]/g, "");
    if (!safe.trim()) return; // lámina LIMPIA: nada de TEXT vacío (sin geometría)
    this.entities.push(`0\nTEXT\n8\n${l}${lw > 0 ? `\n370\n${lw}` : ""}\n7\nOBRAHUB\n10\n${f(x)}\n20\n${f(y)}\n40\n${f(height)}\n1\n${safe}\n50\n${f(rotationDeg)}\n`);
  }

  // Rótulo + emisión de lámina: viven en plot.ts (motor COMPARTIDO con el
  // PDF — un cerebro, dos plumillas; el PDF imprime lo que el DXF declara).

  build(): string {
    // HEADER R2007 (AC1021): mm de lámina a 1:1 (INSUNITS 4) y GROSORES
    // VISIBLES al abrir ($LWDISPLAY 1 — sin esto AutoCAD muestra todo
    // hairline y el archivo "no tiene plumillas" aunque los 370 existan).
    // Desde R2007 el DXF es UTF-8 NATIVO — los acentos (Á, É, Ñ) viajan
    // bien; en R2000 (cp1252) salían como "BOGOTÃ…" en AutoCAD.
    let out = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$INSUNITS\n70\n4\n9\n$LWDISPLAY\n290\n1\n9\n$LTSCALE\n40\n1.0\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n";
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
    out += "0\nENDTAB\n";
    // STYLE explícito y portable (review #11): fuente txt.shx (mapeada por
    // AutoCAD/BricsCAD/LibreCAD incluso si falta el archivo), altura fija 0
    // (cada TEXT lleva su 40 real) — los textos sobreviven a cualquier CAD.
    out += "0\nTABLE\n2\nSTYLE\n70\n1\n0\nSTYLE\n2\nOBRAHUB\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n2.5\n3\ntxt.shx\n";
    out += "0\nENDTAB\n0\nENDSEC\n";
    // ENTITIES
    out += "0\nSECTION\n2\nENTITIES\n";
    for (const e of this.entities) out += e;
    out += "0\nENDSEC\n0\nEOF\n";
    // SIN envoltura ISO-10303-21: esa es sintaxis STEP/IFC — el DXF ASCII son
    // solo pares etiqueta-valor (ezdxf la rechaza como group code inválido).
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
 * PAQUETE ARQUITECTÓNICO PURO (A-00…A-07) + bloque MODELO 1:1 en metros:
 * el primer paquete del dibujante no mezcla estructura — las láminas S-*
 * viajan en su propio archivo (planToDxfStructural).
 *
 * DETERMINISMO PURO: misma entrada → mismo byte, cualquier día. La fecha
 * del rótulo NO se toma del reloj aquí — la pasa quien llama (fecha de
 * producción del archivo) vía opts.fecha; sin ella, la celda queda vacía.
 */
export function planToDxf(plan: FloorPlan, opts: { fecha?: string } = {}): string {
  const arch = sheetContents(plan).filter((s) => s.pkg !== "S" && s.pkg !== "I");
  return emitSheets(plan, arch, opts, true);
}

/** PAQUETE ESTRUCTURAL (S-00…S-05) — sólo cuando la retícula del ingeniero
 *  existe (plan.structure.axes). Devuelve null si aún no hay estructura:
 *  el primer paquete es PURAMENTE arquitectónico. */
export function planToDxfStructural(plan: FloorPlan, opts: { fecha?: string } = {}): string | null {
  const struct = sheetContents(plan).filter((s) => s.pkg === "S");
  return struct.length ? emitSheets(plan, struct, opts) : null;
}

/** PAQUETE DE INSTALACIONES (I-01/I-02) — sólo cuando los expertos dejaron
 *  puntos (plan.electrical / plan.hydro). Devuelve null si aún no hay MEP:
 *  el paquete A viaja puro y las redes nacen con su etapa. */
export function planToDxfInstalaciones(plan: FloorPlan, opts: { fecha?: string } = {}): string | null {
  const inst = sheetContents(plan).filter((s) => s.pkg === "I");
  return inst.length ? emitSheets(plan, inst, opts) : null;
}

/** Un archivo DXF POR LÁMINA (review #11): abrir o imprimir una lámina sola
 *  no reduce el set completo a una hoja — cada archivo es el formato
 *  OBRAHUB 700×500 en origen, listo para plot 1:1. */
export function planToDxfSheets(plan: FloorPlan, opts: { fecha?: string } = {}): Array<{ code: string; dxf: string }> {
  return sheetContents(plan).map((sheet) => ({ code: sheet.code, dxf: emitSheets(plan, [sheet], opts) }));
}

/** BLOQUE MODELO 1:1 (metros) — el "DXF dual": arriba viajan las LÁMINAS
 *  (mm de papel, plot 1:1); debajo el MISMO plano en unidades REALES para
 *  que otro arquitecto lo REFERENCIE (xref) o mida directo en CAD, sin
 *  convertir escalas. Geometría + anotación de modelo: sin rótulo ni poché
 *  macizo (los muros viajan como contorno). Grosores BYLAYER — el modelo no
 *  es plot, es referencia. Sólo en el set completo: las láminas sueltas y
 *  el PDF son impresión pura. */
function emitModel1to1(d: DxfBuilder, plan: FloorPlan): void {
  d.setPlot(0); // 370 BYLAYER en el modelo
  const nLevels = typeof plan.levels === "number" && plan.levels > 0 ? plan.levels : 1;
  let oy = -40; // aire bajo la última lámina
  for (let lvl = 0; lvl < nLevels; lvl++) {
    const prims = plantaPrimitives(plan, lvl);
    const b = primsBounds(prims);
    const sy = b.maxY - b.minY;
    d.text("TEXTOS", 0, oy + 2.6, 0.5, `NIVEL ${lvl + 1} — MODELO 1:1 (METROS, REFERENCIA CAD)`);
    // El plano en unidades reales: su parte ALTA queda en oy y crece hacia
    // ABAJO (alejándose de las láminas, que viven en y≥0).
    const X = (v: number) => v - b.minX;
    const Y = (v: number) => oy - (b.maxY - v);
    for (const p of prims) {
      if (p.t === "L") d.line(p.l, X(p.x1), Y(p.y1), X(p.x2), Y(p.y2), { thin: p.thin, dash: p.dash });
      else if (p.t === "T") d.text(p.l, X(p.x), Y(p.y), p.h, p.s, p.r ?? 0);
      else if (p.t === "C") d.circle(p.l, X(p.x), Y(p.y), p.r);
      // F (poché/zócalo/símbolo relleno) → CONTORNO: en el modelo se
      // referencia el borde del muro, no su relleno de impresión.
      else d.polyline(p.l, [[X(p.x), Y(p.y)], [X(p.x + p.w), Y(p.y)], [X(p.x + p.w), Y(p.y + p.h)], [X(p.x), Y(p.y + p.h)]], true);
    }
    // Instalaciones del nivel (mismo solver que la lámina) a escala real.
    for (const s of mepSymbols(plan, lvl)) {
      const l = s.disc === "E" ? "ELECTRICO" : "HIDROSANITARIO";
      d.circle(l, X(s.x), Y(s.y), s.r);
      d.text(l, X(s.x) - (s.letter.length * s.r * 0.35), Y(s.y) - s.r * 0.3, s.r * 0.8, s.letter);
    }
    oy -= sy + 9;
  }
}

function emitSheets(plan: FloorPlan, sheets: Sheet[], opts: { fecha?: string }, withModel = false): string {
  const d = new DxfBuilder();
  const total = String(sheets.length);
  const city = plan.site?.city ? `${plan.site.city.toUpperCase()}${plan.site.department ? " · " + plan.site.department.toUpperCase() : ""}` : "COLOMBIA";
  const fecha = opts.fecha ?? "";
  // La EMISIÓN vive en plot.ts (motor compartido con el PDF): misma escala,
  // mismo rótulo, mismas colisiones — el DXF y el PDF salen del mismo cerebro.
  sheets.forEach((sheet, i) => {
    emitSheet(d, plan, sheet, { ox: i * (700 + GAP_SHEET), total, fecha, city });
  });
  if (withModel) emitModel1to1(d, plan);
  return d.build();
}
