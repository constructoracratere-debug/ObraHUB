/**
 * CHECKLIST DE LICENCIA (curaduria, Decreto 1077/2015) + DISE\u00d1O DE ELEMENTOS
 * con acero (NSR-10 C.20/C.21). El motor dice QU\u00c9 falta para radicar:
 * lo que genera ObraHub sale verde; lo que exige tercero (suelos, firma)
 * sale pendiente con instrucci\u00f3n precisa. Determinista, citando art\u00edculo.
 */
import type { FloorPlan } from "../design/schema";
import { deadLoads, liveLoads, columnCheck } from "./loads";

export type DesignRow = { elem: string; size: string; steel: string; check: string; ref: string };

/** Dise\u00f1o de elementos (calculista b\u00e1sico, concreto 3000 psi / 60000 psi). */
export function designElements(plan: FloorPlan, qAdmT_m2 = 15): DesignRow[] {
  const d = deadLoads(plan);
  const l = liveLoads(plan);
  const cc = columnCheck(plan, d.wPerM2, l.weighted);
  const rows: DesignRow[] = [];
  // COLUMNA: Pu -> As (C.21.3.3, \u03c6=0.65 concarga); m\u00ednimo 1% Ag.
  const fc = 210, fy = 4200; // kgf/cm2
  const side = parseInt(cc.suggested) || 30;
  const Ag = side * side;
  const As = Math.max(0.01 * Ag, (cc.Pu / 0.65 - 0.85 * fc * Ag) / (fy - 0.85 * fc));
  const bars = As <= 6.5 ? `4\u00d85/8"` : As <= 12 ? `4\u00d83/4"` : `8\u00d83/4"`;
  rows.push({ elem: "Columna t\u00edpica", size: `${side}\u00d7${side} cm`, steel: `${bars} (\u03c1=${((As / Ag) * 100).toFixed(1)}%)`, check: `Pu=${Math.round(cc.Pu / 1000)} t`, ref: "NSR-10 C.21.3.3" });
  // VIGA: Mu \u2248 wL\u00b2/16 continua -> As; m\u00edn 2\u00d81/2" (C.21.3.2 \u03c1min=14/fy).
  const axes = plan.structure?.axes ?? [];
  const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at).sort((a, b) => a - b);
  const L = vs.length > 1 ? Math.max(...vs.slice(1).map((v, i) => v - vs[i])) : plan.outline.width / 2;
  const w = 1.2 * d.wPerM2 + 1.6 * l.weighted; // kgf/m
  const Mu = (w * L * L) / 16; // kgf\u00b7m
  const hbeam = 25, bw2 = 30, deff = hbeam - 5;
  const AsV = Math.max(14 / fy * bw2 * deff, (Mu * 100) / (0.9 * 0.9 * deff * fy));
  const barsV = AsV <= 5.1 ? `2\u00d81/2"` : AsV <= 7.9 ? `3\u00d85/8"` : `3\u00d83/4"`;
  rows.push({ elem: "Viga t\u00edpica", size: `${bw2}\u00d7${hbeam} cm`, steel: `${barsV} inferior`, check: `Mu=${Math.round(Mu / 100)} t\u00b7m \u00b7 L=${L.toFixed(1)} m`, ref: "NSR-10 C.21.3.2" });
  // ZAPATA: B por carga admisible (I.3 qadm del estudio de suelos).
  const Pserv = cc.Pu / 1.4; // aprox servicio
  const Breq = Math.sqrt(Pserv / qAdmT_m2); // m
  const B = Math.max(1.1, Math.ceil(Breq * 10) / 10);
  rows.push({ elem: "Zapata aislada", size: `${B.toFixed(1)}\u00d7${B.toFixed(1)}\u00d70.30 m`, steel: "malla #4 c/15 ambas dirs", check: `q\u2090\u2098=${qAdmT_m2} t/m\u00b2 \u00b7 P=${Math.round(Pserv / 1000)} t`, ref: "NSR-10 I.3 (seg\u00fan suelos)" });
  // LOSA: unidireccional e=12 (C.20.3) con acero temp.
  rows.push({ elem: "Losa maciza", size: plan.structure?.system === "acero_liviano" ? "e=10 (ligera)" : "e=12 cm", steel: "\u00d85/8\" c/25 + temp \u00d84mm c/25", check: `luces \u2264 ${L.toFixed(1)} m`, ref: "NSR-10 C.20.3" });
  return rows;
}

export type CheckItem = { area: string; item: string; status: "ok" | "pend"; note: string; ref: string };

/** Checklist completo para radicar en curadur\u00eda (1077/2015 art. 2.2.6.1.6). */
export function licenseChecklist(plan: FloorPlan): CheckItem[] {
  const items: CheckItem[] = [];
  const hasGrid = (plan.structure?.axes?.length ?? 0) >= 2;
  items.push({ area: "Modelo", item: "Ret\u00edcula estructural definida (columnas/vigas)", status: hasGrid ? "ok" : "pend", note: hasGrid ? "" : "Corre la etapa Expertos en Arquitect\u00f3nico", ref: "NSR-10 A.1" });
  items.push({ area: "Modelo", item: `Niveles (${plan.levels}) y alturas (${plan.floorToFloor} m)`, status: plan.levels >= 1 && plan.floorToFloor >= 2.3 ? "ok" : "pend", note: "Altura m\u00ednima de piso 2.30 m", ref: "NSR-10 A.2/C" });
  items.push({ area: "ObraHub", item: "Memoria de cargas NSR-10 (D, L, W, combos)", status: "ok", note: "Descargable en la herramienta", ref: "NSR-10 B.2" });
  items.push({ area: "ObraHub", item: "Memoria de c\u00e1lculo con secciones y acero", status: "ok", note: "Tabla de dise\u00f1o de elementos", ref: "NSR-10 C.20/C.21" });
  items.push({ area: "ObraHub", item: "Planos A-01\u2192A-04 (arquitectura + estructura)", status: "ok", note: "Carrusel de l\u00e1minas + PDF A2", ref: "1077/2015" });
  items.push({ area: "Terceros", item: "Estudio geot\u00e9cnico (q\u2090\u2098 real del lote)", status: "pend", note: "Contrata studio de suelos; ajusta zapatas con su q\u2090\u2098", ref: "NSR-10 T\u00edt. I" });
  items.push({ area: "Terceros", item: "Sismo: zona s\u00edsmica y espectro del municipio", status: "pend", note: "Fase 3 (OpenSeesPy) usa Aa/Av de tu ciudad", ref: "NSR-10 A.2/A.24" });
  items.push({ area: "Legal", item: "Formulario \u00fanico nacional + Tradici\u00f3n y Libertad", status: "pend", note: "En la curadur\u00eda o Ventanilla \u00danica", ref: "1077/2015 2.2.6.1.6" });
  items.push({ area: "Legal", item: "Firma de ingeniero civil MATRICULADO", status: "pend", note: "Obligatorio: el dise\u00f1o IA es base t\u00e9cnica, la responsabilidad es del profesional", ref: "Ley 400/1997" });
  return items;
}
