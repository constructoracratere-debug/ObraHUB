/**
 * DISEÑO ESTRUCTURAL ASISTIDO POR IA — Motor 1: CARGAS y COMBINACIONES.
 * Determinista y auditable: cada valor cita su articulo NSR-10 (Colombia,
 * Reglamento Colombiano de Construccion Sismo Resistente) o Neufert/Plazola.
 * Entrada: FloorPlan (el mismo modelo del Diseno Arquitectonico — Revit-like).
 */
import type { FloorPlan } from "../design/schema";

export type LoadLine = { item: string; value: number; unit: string; ref: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pesos unitarios NSR-10 A.9 (kgf/m3) + acabados tipicos (Plazola). */
const UNIT_W = {
  concreto: 2400, mamposteria: 1800, tierra: 1600,
  losaLigera: 1750, tejaFibrocemento: 25, // por m2
};
/** Sobrecargas de uso NSR-10 A.8.3.1 (kgf/m2). */
const LIVE: Array<[RegExp, number, string]> = [
  [/ba[nñ]o|bano/i, 170, "A.8.3.1 viviendas"],
  [/alcoba|habita|dormitorio|recamara|sala|comedor|estar|estudio/i, 180, "A.8.3.1 habitaciones/estancias"],
  [/cocina|lavander|terraza|balcon/i, 300, "A.8.3.1 cocinas/terrazas"],
  [/garaje|parqueadero|estacionamiento/i, 250, "A.8.3.1 garajes"],
  [/./, 180, "A.8.3.1 residencial (defecto)"],
];

/** Cargas muertas por nivel desde el MODELO (losa + acabados + muros). */
export function deadLoads(plan: FloorPlan): { lines: LoadLine[]; totalKgf: number; wPerM2: number } {
  const levels = Math.max(1, plan.levels);
  const { width: W, depth: D } = plan.outline;
  const area = W * D;
  const lines: LoadLine[] = [];
  // Losa: 12 cm concreto (o 10 ligera) + acabado piso 50 kgf/m2 + pañetes.
  const esLigera = plan.structure?.system === "acero_liviano";
  const hLosa = esLigera ? 0.1 : 0.12;
  const qLosa = hLosa * (esLigera ? UNIT_W.losaLigera : UNIT_W.concreto);
  const qAcabado = 50; // enchape+afinado tipico
  const qPliker = 30; // cielo + instalaciones colgantes
  const qTecho = esLigera ? 25 : 0;
  const qTotal = qLosa + qAcabado + qPliker + qTecho;
  lines.push({ item: `Losa e=${hLosa * 100} cm (${esLigera ? "ligera" : "concreto 2400"})`, value: r2(qLosa), unit: "kgf/m2", ref: "NSR-10 A.9.1 + Plazola" });
  lines.push({ item: "Acabados (enchape + afinado)", value: qAcabado, unit: "kgf/m2", ref: "Plazola acabados tipicos" });
  lines.push({ item: "Cielo rasos + instalaciones", value: qPliker, unit: "kgf/m2", ref: "practica" });
  if (qTecho) lines.push({ item: "Cubierta teja fibrocemento", value: qTecho, unit: "kgf/m2", ref: "fabricante" });
  // Muros por m2 de piso: perimetro x altura x espesor x 1800 con vanos 0.8.
  const perim = 2 * (W + D);
  const qMuros = (perim / area) * plan.floorToFloor * 0.12 * UNIT_W.mamposteria * (1 - 0.18);
  lines.push({ item: "Mamposteria perimetral (aligerada por vanos)", value: r2(qMuros), unit: "kgf/m2", ref: "NSR-10 A.9.1 mamposteria 1800" });
  const wPerM2 = r2(qTotal + qMuros);
  lines.push({ item: "TOTAL carga muerta por nivel", value: wPerM2, unit: "kgf/m2", ref: "sumatoria" });
  return { lines, totalKgf: r2(wPerM2 * area * levels), wPerM2 };
}

/** Sobrecarga ponderada por uso de los espacios (NSR-10 A.8.3.1). */
export function liveLoads(plan: FloorPlan): { lines: LoadLine[]; weighted: number } {
  const byRoom = new Map<string, { area: number; q: number; ref: string }>();
  for (const r of plan.rooms) {
    const hit = LIVE.find(([re]) => re.test(r.name)) ?? LIVE[LIVE.length - 1];
    const k = `${hit[1]} kgf/m2 — ${hit[2]}`;
    const e = byRoom.get(k) ?? { area: 0, q: hit[1], ref: hit[2] };
    e.area += r.width * r.depth;
    byRoom.set(k, e);
  }
  const lines: LoadLine[] = [];
  let num = 0, tot = 0;
  for (const [k, v] of byRoom) {
    lines.push({ item: `${v.area.toFixed(1)} m2 — ${k}`, value: v.q, unit: "kgf/m2", ref: `NSR-10 ${v.ref}` });
    num += v.q * v.area; tot += v.area;
  }
  const weighted = tot > 0 ? r2(num / tot) : 180;
  lines.push({ item: "Ponderada por areas", value: weighted, unit: "kgf/m2", ref: "sumatoria" });
  return { lines, weighted };
}

/** Peso sismico W (NSR-10 A.27): D + 25% L en almacen... residencial: D+L efectiva.
 *  Para vivienda tomamos D + 0.25*L (practica conservadora NSR). */
export function seismicWeight(plan: FloorPlan, dead: number, live: number): { W: number; perM2: number } {
  const area = plan.outline.width * plan.outline.depth * Math.max(1, plan.levels);
  const perM2 = r2(dead + 0.25 * live);
  return { W: r2(perM2 * area), perM2 };
}

/** Combinaciones NSR-10 Titulo B (concreto): resistencia requerida U. */
export function combos(dead: number, live: number, Ey: number): LoadLine[] {
  const f = (n: number) => r2(n);
  return [
    { item: "1.4·D", value: f(1.4 * dead), unit: "kgf/m2", ref: "NSR-10 B.2.3" },
    { item: "1.2·D + 1.6·L", value: f(1.2 * dead + 1.6 * live), unit: "kgf/m2", ref: "NSR-10 B.2.3" },
    { item: "1.2·D + 1.0·L + 1.0·E", value: f(1.2 * dead + live + Ey), unit: "kgf/m2", ref: "NSR-10 B.2.4 sismo" },
    { item: "0.9·D − 1.0·E", value: f(0.9 * dead - Ey), unit: "kgf/m2", ref: "NSR-10 B.2.4 sismo" },
  ];
}

/** Predimension de columna por area tributaria (NSR-10 C.21.3.3 minimo 1%). */
export function columnCheck(plan: FloorPlan, dead: number, live: number): { areaReq: number; suggested: string; Pu: number } {
  const axes = plan.structure?.axes ?? [];
  const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at).sort((a, b) => a - b);
  const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at).sort((a, b) => a - b);
  const spanX = vs.length > 1 ? Math.max(...vs.slice(1).map((v, i) => v - vs[i])) : plan.outline.width / 2;
  const spanY = hs.length > 1 ? Math.max(...hs.slice(1).map((v, i) => v - hs[i])) : plan.outline.depth / 2;
  const nLevels = Math.max(1, plan.levels);
  const Pu = r2((1.4 * dead + 1.6 * live) * spanX * spanY * nLevels); // kgf
  const fc = 210; // kgf/cm2 concreto 3000 psi
  const areaReq = r2(Pu / (0.85 * 0.65 * fc)); // cm2 (esbeltez se verifica aparte)
  const side = Math.max(30, Math.ceil(Math.sqrt(areaReq) / 5) * 5);
  return { areaReq, suggested: `${side}×${side} cm`, Pu };
}
