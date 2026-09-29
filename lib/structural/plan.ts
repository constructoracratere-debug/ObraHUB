/**
 * PLANO ESTRUCTURAL (A-04) — lenguaje de calculista:
 *  - Ret\u00edcula con burbujas A,B,C / 1,2,3 y l\u00ednea dash-dot.
 *  - Columnas 30x30 MACIZAS en intersecciones (NSR-10 C.21).
 *  - Vigas en doble l\u00ednea (0.30x0.25) entre ejes.
 *  - Zapatas 1.10x1.10 DISCONTINUAS bajo columnas (cimentacion).
 *  - Muros como l\u00edneas de carga (simple, finas) + flechas de carga a eje.
 *  - Cotas entre ejes + total + bloque de notas con cargas y sistema.
 * Determinista: mismo plano \u2192 mismo dibujo.
 */
import type { FloorPlan } from "../design/schema";
import type { Prim } from "../design/views";
import { deadLoads, liveLoads, columnCheck } from "./loads";

export function structuralPlanPrimitives(plan: FloorPlan): Prim[] {
  const out: Prim[] = [];
  const S = "ESTRUCTURA";
  const { width: W, depth: D } = plan.outline;
  const axes = plan.structure?.axes ?? [];
  const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at).sort((a, b) => a - b);
  const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at).sort((a, b) => a - b);
  const vX = vs.length ? vs : [W * 0.33, W * 0.66];
  const hY = hs.length ? hs : [D * 0.5];

  // Silueta del edificio (referencia) en linea fina.
  out.push({ t: "H", l: S, x: 0, y: 0, w: W, h: D });

  // Ret\u00edcula dash-dot con burbujas.
  const bubble = (x: number, y: number, id: string) => {
    out.push({ t: "C", l: "EJES", x, y, r: 0.3 });
    out.push({ t: "T", l: "EJES", x: x - 0.1, y: y + 0.1, h: 0.22, s: id });
  };
  vX.forEach((x, i) => {
    out.push({ t: "L", l: "EJES", x1: x, y1: -1.4, x2: x, y2: D + 1.4, dash: true, thin: true });
    bubble(x, D + 1.75, String.fromCharCode(65 + i)); // A, B, C...
  });
  hY.forEach((y, i) => {
    out.push({ t: "L", l: "EJES", x1: -1.4, y1: y, x2: W + 1.4, y2: y, dash: true, thin: true });
    bubble(-1.75, y, String(i + 1)); // 1, 2, 3...
  });

  // Columnas macizas 30x30 en intersecciones.
  const col = 0.3;
  for (const x of vX) for (const y of hY) {
    out.push({ t: "F", l: S, x: x - col / 2, y: y - col / 2, w: col, h: col });
    // Zapata discontinua 1.10x1.10 debajo.
    out.push({ t: "H", l: "COTAS", x: x - 0.55, y: y - 0.55, w: 1.1, h: 1.1 });
    out.push({ t: "L", l: "COTAS", x1: x - 0.55, y1: y - 0.55, x2: x + 0.55, y2: y + 0.55, dash: true, thin: true });
    out.push({ t: "L", l: "COTAS", x1: x + 0.55, y1: y - 0.55, x2: x - 0.55, y2: y + 0.55, dash: true, thin: true });
  }

  // Vigas 0.30x0.25 en doble linea entre ejes.
  const vb = 0.25;
  for (const y of hY) for (let i = 0; i < vX.length - 1; i++) {
    const x0 = vX[i], x1 = vX[i + 1];
    out.push({ t: "L", l: S, x1: x0, y1: y - vb / 2, x2: x1, y2: y - vb / 2 });
    out.push({ t: "L", l: S, x1: x0, y1: y + vb / 2, x2: x1, y2: y + vb / 2 });
  }
  for (const x of vX) for (let i = 0; i < hY.length - 1; i++) {
    const y0 = hY[i], y1 = hY[i + 1];
    out.push({ t: "L", l: S, x1: x - vb / 2, y1: y0, x2: x - vb / 2, y2: y1 });
    out.push({ t: "L", l: S, x1: x + vb / 2, y1: y0, x2: x + vb / 2, y2: y1 });
  }

  // Muros = lineas de carga hacia el eje mas cercano (flecha corta).
  for (const r of plan.rooms.filter((r) => r.level === 0)) {
    out.push({ t: "H", l: "MUROS", x: r.x, y: r.y, w: r.width, h: r.depth });
  }

  // Cotas entre ejes + total (cadena inferior).
  const xsChain = [0, ...vX, W];
  out.push({ t: "L", l: "COTAS", x1: 0, y1: -0.7, x2: W, y2: -0.7 });
  for (const x of xsChain) {
    out.push({ t: "L", l: "COTAS", x1: x - 0.07, y1: -0.77, x2: x + 0.07, y2: -0.63 });
    out.push({ t: "L", l: "COTAS", x1: x, y1: -0.7, x2: x, y2: -0.45, thin: true });
  }
  for (let i = 0; i < xsChain.length - 1; i++) {
    const seg = xsChain[i + 1] - xsChain[i];
    if (seg > 0.3) out.push({ t: "T", l: "COTAS", x: (xsChain[i] + xsChain[i + 1]) / 2 - 0.16, y: -0.98, h: 0.16, s: seg.toFixed(2) });
  }

  // Bloque de NOTAS con las cifras del calculista (siempre visible).
  const dl = deadLoads(plan);
  const ll = liveLoads(plan);
  const cc = columnCheck(plan, dl.wPerM2, ll.weighted);
  const notes = [
    "NOTAS ESTRUCTURALES",
    `Sistema: ${plan.structure?.system ?? "mamposteria confinada"} \u00b7 ${plan.levels} nivel(es) \u00b7 NSR-10`,
    `D = ${dl.wPerM2} kgf/m2 \u00b7 L = ${ll.weighted} kgf/m2 (A.8/A.9)`,
    `Columna tipica ${cc.suggested} (Pu ${Math.round(cc.Pu / 1000)} t) \u00b7 Viga 0.30x0.25`,
    "Zapata aislada 1.10x1.10x0.30 \u00b7 Concreto 3000 psi \u00b7 Acero 60000 psi",
    "Coordenar con planos arquitectonicos A-01. Revision: ingeniero matriculado.",
  ];
  const nx = W + 1.2, ny0 = D;
  notes.forEach((n, i) => {
    out.push({ t: "T", l: "TEXTOS", x: nx, y: ny0 - i * 0.4, h: i === 0 ? 0.2 : 0.16, s: n });
  });

  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 2.4, h: 0.26, s: "PLANO ESTRUCTURAL \u2014 RETICULA Y CIMENTACION" });
  out.push({ t: "T", l: "TEXTOS", x: 0, y: D + 2.05, h: 0.16, s: "ESC 1:75" });
  return out;
}
