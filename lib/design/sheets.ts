/**
 * MOTOR DE LAMINAS — composicion profesional multi-hoja.
 * Regla anti-solape: cada dibujo se coloca a partir de SUS PROPIOS bounds
 * reales (primsBounds) + separacion fija — jamas offsets a ojo. Una lamina
 * por dibujo (A-01 planta, A-02 cortes, A-03 fachadas, A-04 estructura),
 * cada una con marco doble, cajetin y escala grafica: si no cabe, SON DOS
 * LAMINAS, no un amontonamiento.
 */
import type { FloorPlan } from "../design/schema";
import { sectionPrimitives, facadePrimitives, plantaPrimitives, areaTablePrimitives, primsBounds, type Prim } from "./views";
import { structuralPlanPrimitives } from "../structural/plan";

export type Sheet = { code: string; title: string; prims: Prim[] };

const GAP = 2.4; // separacion entre dibujos (m de papel @1:75)

function shift(prims: Prim[], dx: number, dy: number): Prim[] {
  return prims.map((p) =>
    p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
    : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
    : { ...p, x: p.x + dx, y: p.y + dy },
  );
}

/** Marco doble + cajetin estandar para el CONTENIDO dado (bounds reales). */
function dress(code: string, title: string, content: Prim[], planName: string): Prim[] {
  const b = primsBounds(content);
  const m1 = 0.8, m2 = 1.4;
  const x0 = b.minX - m2, y0 = b.minY - m2, x1 = b.maxX + m2, y1 = b.maxY + m2;
  const out: Prim[] = [...content];
  out.push({ t: "H", l: "TEXTOS", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  out.push({ t: "H", l: "TEXTOS", x: x0 + (m2 - m1), y: y0 + (m2 - m1), w: x1 - x0 - 2 * (m2 - m1), h: y1 - y0 - 2 * (m2 - m1) });
  // Cajetin: esquina inferior derecha, DENTRO del marco interior.
  const cw = 9.5, ch = 2.6;
  const cx0 = x1 - m2 + (m2 - m1) - cw, cy0 = y0 + (m2 - m1);
  const rows: Array<[number, string]> = [
    [0.68, planName.toUpperCase().slice(0, 42)],
    [0.48, "UBICACION: " + ""],
    [0.48, "ESC 1:75 \u00b7 METROS \u00b7 UNIDADES S.I."],
    [0.48, `${code} \u2014 ${title}`],
    [0.48, "OBRAHUB \u00b7 CRATERE S.A.S."],
  ];
  out.push({ t: "H", l: "TEXTOS", x: cx0, y: cy0, w: cw, h: ch });
  let yy = cy0 + ch;
  for (const [rh, label] of rows) {
    yy -= rh;
    out.push({ t: "L", l: "TEXTOS", x1: cx0, y1: yy, x2: cx0 + cw, y2: yy, thin: true });
    out.push({ t: "T", l: "TEXTOS", x: cx0 + 0.25, y: yy + rh / 2 - 0.09, h: 0.2, s: label });
  }
  return out;
}

export function buildSheets(plan: FloorPlan): Sheet[] {
  const name = plan.name;
  const sheets: Sheet[] = [];

  // A-01 — PLANTA + CUADRO DE AREAS (colocacion por bounds: nunca solapa)
  {
    const planta = plantaPrimitives(plan);
    const pb = primsBounds(planta);
    const tabla = shift(areaTablePrimitives(plan), pb.maxX + GAP, pb.minY);
    sheets.push({ code: "A-01", title: "PLANTA ARQUITECTONICA + CUADRO DE AREAS", prims: dress("A-01", "PLANTA ARQUITECTONICA + CUADRO DE AREAS", [...planta, ...tabla], name) });
  }
  // A-02 — CORTES A-A' y B-B' lado a lado por bounds
  {
    const ca = sectionPrimitives(plan);
    const ab = primsBounds(ca);
    const cb = shift(sectionPrimitives(plan, { transverse: true }), ab.maxX + GAP, 0);
    sheets.push({ code: "A-02", title: "CORTES A-A' Y B-B'", prims: dress("A-02", "CORTES A-A' Y B-B'", [...ca, ...cb], name) });
  }
  // A-03 — FACHADAS: fila por bounds; si excede formato, segunda fila.
  {
    const sides = ["sur", "oeste", "este", "norte"] as const;
    const row: Prim[] = [];
    let cursor = 0;
    const placed: Array<{ w: number; prims: Prim[] }> = [];
    for (const s of sides) {
      const f = facadePrimitives(plan, s);
      const b = primsBounds(f);
      const w = b.maxX - b.minX;
      placed.push({ w, prims: shift(f, cursor - b.minX, -b.minY) });
      cursor += w + GAP;
    }
    const totalW = cursor - GAP;
    const maxH = Math.max(...placed.map((p) => primsBounds(p.prims).maxY));
    // Dos filas de 2 si es muy ancha (proporcion de lamina ~1.5:1)
    if (totalW > maxH * 1.9) {
      const top = [...placed[0].prims, ...placed[1].prims];
      const tb = primsBounds(top);
      const bot = [...shift(placed[2].prims, 0, tb.minY - maxH - GAP), ...shift(placed[3].prims, placed[2].w + GAP, tb.minY - maxH - GAP)];
      sheets.push({ code: "A-03", title: "FACHADAS", prims: dress("A-03", "FACHADAS", [...top, ...bot], name) });
    } else {
      sheets.push({ code: "A-03", title: "FACHADAS", prims: dress("A-03", "FACHADAS", placed.flatMap((p) => p.prims), name) });
    }
  }
  // A-04 — PLANO ESTRUCTURAL (nuevo, limpio y profesional)
  {
    const sp = structuralPlanPrimitives(plan);
    sheets.push({ code: "A-04", title: "PLANO ESTRUCTURAL — RETICULA, COLUMNAS Y CIMENTACION", prims: dress("A-04", "PLANO ESTRUCTURAL — RETICULA, COLUMNAS Y CIMENTACION", sp, name) });
  }
  return sheets;
}
