/**
 * 🧱 PASAPORTE DE MATERIALES — Módulo 1: TAKEOFF determinístico.
 *
 * Del MISMO FloorPlan que dibuja los planos y escribe el IFC, extrae las
 * cantidades de obra: ladrillo a ladrillo, m³ de concreto por elemento, kg
 * de acero por cuantía NSR, m² de acabados. Sin LLM: números auditables,
 * repetibles byte a byte (misma filosofía del motor DXF).
 *
 * Fuentes: materials.ts (WALL_ASSEMBLIES/CONCRETE), NSR-10 E.3 (cuantía
 * mínima ~100 kg/m³ aprox. para 3000 PSI), ladrillo H-10 pandereta
 * 0.30×0.24×0.10 m con 1.5% mortero de pega por m².
 */
import type { FloorPlan } from "../design/schema";
import { WALL_ASSEMBLIES, CONCRETE, MATERIALS } from "../design/materials";

export type TakeoffLine = {
  category: "estructura" | "mamposteria" | "carpinteria" | "acabados" | "cubiertas";
  material: string;
  unit: "m3" | "m2" | "kg" | "und" | "ml";
  qty: number;
  detail: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function takeoff(plan: FloorPlan): TakeoffLine[] {
  const out: TakeoffLine[] = [];
  const asmKeys = Object.keys(WALL_ASSEMBLIES) as Array<keyof typeof WALL_ASSEMBLIES>;
  const asm = (plan.structure?.system && WALL_ASSEMBLIES[plan.structure.system as keyof typeof WALL_ASSEMBLIES]) ?? WALL_ASSEMBLIES[asmKeys[0]];
  const { width: W, depth: D } = plan.outline;
  const fft = plan.floorToFloor;
  const levels = Math.max(1, plan.levels);

  // ── MAMPOSTERÍA: muros por capas del ensamblaje (exterior + interior) ──
  const te = asm.ext.layers.reduce((s: number, l: { thickness: number }) => s + l.thickness, 0) || 0.15;
  const ti = asm.int.layers.reduce((s: number, l: { thickness: number }) => s + l.thickness, 0) || 0.10;
  // Áreas de muro: perímetro exterior × altura por nivel + particiones.
  const extArea = 2 * (W + D) * fft * levels;
  const roomsL0 = plan.rooms.filter((r) => r.level === 0);
  const interiorEdges = new Set<string>();
  for (const r of plan.rooms) {
    interiorEdges.add(`V:${r.x.toFixed(2)}:${r.y.toFixed(2)}:${(r.y + r.depth).toFixed(2)}`);
    interiorEdges.add(`H:${r.y.toFixed(2)}:${r.x.toFixed(2)}:${(r.x + r.width).toFixed(2)}`);
  }
  const intLen = plan.rooms.reduce((s, r) => s + r.width + r.depth, 0) * 0.5; // bordes compartidos ≈ mitad
  const intArea = intLen * fft * levels;
  for (const [label, area, t] of [["ext", extArea, te], ["int", intArea, ti]] as const) {
    const layers = label === "ext" ? asm.ext.layers : asm.int.layers;
    for (const layer of layers) {
      const vol = area * layer.thickness;
      if (vol <= 0) continue;
      const isLadrillo = /ladrillo|mamposter/i.test(layer.name);
      out.push({
        category: "mamposteria",
        material: layer.name,
        unit: isLadrillo ? "und" : "m3",
        qty: isLadrillo ? r2(vol / 0.0024) : r2(vol), // H-10 macizo 0.30×0.20×0.40 equiv ≈ 2.4 L útil c/pegante
        detail: `Muro ${label === "ext" ? "exterior" : "interior"}: ${r2(area)} m² × e=${r2(layer.thickness)} m (${label === "ext" ? asm.ext.label : asm.int.label})`,
      });
    }
  }
  const pga = extArea + intArea * 2; // pañete 2 caras en interiores
  out.push({ category: "mamposteria", material: "Pañete mortero 1:4", unit: "m2", qty: r2(pga), detail: "Dos caras, e=2cm (Plazola)" });

  // ── ESTRUCTURA: concreto por elemento + acero por cuantía ────────────────
  const axes = plan.structure?.axes ?? [];
  const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at);
  const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at);
  const nCol = Math.max(4, Math.max(vs.length, 2) * Math.max(hs.length, 2));
  const beamLen = (vs.reduce((s, x) => s + D - 2 * te, 0) + hs.reduce((s, y) => s + W - 2 * te, 0)) * levels;
  const vCol = nCol * CONCRETE.column.w * CONCRETE.column.d * fft * levels;
  const vBeam = beamLen * CONCRETE.beam.w * CONCRETE.beam.d;
  const vSlab = W * D * CONCRETE.slab.thickness * levels;
  const vFoot = nCol * CONCRETE.footing.pad * CONCRETE.footing.pad * CONCRETE.footing.thickness;
  for (const [mat, v, det] of [
    ["Concreto 3000 PSI — columnas", vCol, `${nCol} columnas ${CONCRETE.column.w}×${CONCRETE.column.d}×${r2(fft)} m`],
    ["Concreto 3000 PSI — vigas", vBeam, `${r2(beamLen)} ml de viga ${CONCRETE.beam.w}×${CONCRETE.beam.d}`],
    ["Concreto 3000 PSI — losas", vSlab, `${levels} losa(s) e=${CONCRETE.slab.thickness * 100}cm`],
    ["Concreto 3000 PSI — zapatas", vFoot, `${nCol} zapatas ${CONCRETE.footing.pad}×${CONCRETE.footing.pad}×${CONCRETE.footing.thickness}`],
  ] as Array<[string, number, string]>) {
    if (v > 0) out.push({ category: "estructura", material: mat, unit: "m3", qty: r2(v), detail: det });
  }
  const vTotal = vCol + vBeam + vSlab + vFoot;
  out.push({ category: "estructura", material: "Acero refuerzo 60000 PSI", unit: "kg", qty: r2(vTotal * 100), detail: `${r2(vTotal)} m³ × cuantía 100 kg/m³ (NSR-10 E.3 aprox.)` });

  // ── CARPINTERÍA: puertas, ventanas ───────────────────────────────────────
  out.push({ category: "carpinteria", material: "Puerta madera", unit: "und", qty: plan.doors.length, detail: `${plan.doors.length} puertas (hoja ${MATERIALS.hojaPuerta ?? "madera"})` });
  const winArea = plan.windows.reduce((s, w) => s + w.width * w.height, 0);
  out.push({ category: "carpinteria", material: "Ventana vidrio 6mm + PVC", unit: "m2", qty: r2(winArea), detail: `${plan.windows.length} ventanas` });

  // ── ACABADOS: pisos por espacio ──────────────────────────────────────────
  let humeda = 0, seca = 0;
  for (const r of plan.rooms) {
    const a = r.width * r.depth;
    if (/ba[nñ]o|cocina|lavander/i.test(r.name)) humeda += a; else seca += a;
  }
  out.push({ category: "acabados", material: "Cerámica pisos zonas húmedas", unit: "m2", qty: r2(humeda * 1.08), detail: "+8% desperdicio de corte" });
  out.push({ category: "acabados", material: "Acabado piso zonas secas", unit: "m2", qty: r2(seca * 1.05), detail: "+5% desperdicio" });

  return out;
}
