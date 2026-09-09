/**
 * ✏️ Diseño IA — KB paramétrica de materiales y "bloques" (obra gris + MEP).
 *
 * Ensamblajes reales por sistema constructivo colombiano (espesores en m):
 * cada muro = capas de material de afuera hacia adentro. Los aparatos
 * sanitarios/eléctricos son cajas/cilindros paramétricos con dimensiones de
 * Neufert/Panero — seleccionables por nombre en el visor IFC propio.
 */

import type { StructuralSystem } from "./schema";

export type MaterialSpec = { name: string; thickness: number };

export type WallAssembly = { label: string; layers: MaterialSpec[] };

/** Ladrillo/cerámica — mampostería (default VIS). */
const LADRILLO_EXT: WallAssembly = {
  label: "Muro exterior ladrillo H-10 tableado",
  layers: [
    { name: "Pañete exterior 1:4", thickness: 0.02 },
    { name: "Ladrillo H-10 tableado", thickness: 0.15 },
    { name: "Pañete interior 1:4", thickness: 0.02 },
  ],
};
const LADRILLO_INT: WallAssembly = {
  label: "División ladrillo H-10",
  layers: [
    { name: "Pañete 1:4", thickness: 0.015 },
    { name: "Ladrillo H-10", thickness: 0.10 },
    { name: "Pañete 1:4", thickness: 0.015 },
  ],
};

export const WALL_ASSEMBLIES: Record<StructuralSystem, { ext: WallAssembly; int: WallAssembly }> = {
  concreto: { ext: LADRILLO_EXT, int: LADRILLO_INT },
  mixto: { ext: LADRILLO_EXT, int: LADRILLO_INT },
  acero_liviano: {
    ext: {
      label: "Muro exterior steel framing + tablero",
      layers: [
        { name: "Tablero fibrocemento 8mm", thickness: 0.008 },
        { name: "Fibra de vidrio 50mm + perfil C 89mm", thickness: 0.09 },
        { name: "Tablero yeso 12.7mm", thickness: 0.013 },
      ],
    },
    int: {
      label: "División steel framing",
      layers: [{ name: "Tablero yeso + perfil C 70 + aislante", thickness: 0.09 }],
    },
  },
  madera: {
    ext: {
      label: "Muro timber frame",
      layers: [
        { name: "Entablado madera 20mm", thickness: 0.02 },
        { name: "Estructura 2x4 + aislante", thickness: 0.09 },
        { name: "Tablero interior", thickness: 0.012 },
      ],
    },
    int: { label: "División madera", layers: [{ name: "Estructura 2x3 + tableros", thickness: 0.08 }] },
  },
  guadua: {
    ext: {
      label: "Muro bahareque de guadua",
      layers: [
        { name: "Pañete mortero malla", thickness: 0.02 },
        { name: "Guadua θ=10cm + esterilla", thickness: 0.10 },
        { name: "Pañete interior", thickness: 0.02 },
      ],
    },
    int: { label: "División esterilla + guadua", layers: [{ name: "Guadua + esterilla", thickness: 0.08 }] },
  },
  tierra: {
    ext: {
      label: "Bahareque encamisado (tierra)",
      layers: [
        { name: "Encamisado tierra-arena 3cm", thickness: 0.03 },
        { name: "Estructura madera/caña", thickness: 0.10 },
        { name: "Encamisado interior", thickness: 0.03 },
      ],
    },
    int: { label: "División tierra", layers: [{ name: "Estructura + tierra", thickness: 0.08 }] },
  },
};

/** Concreto estructural por sistema. */
export const CONCRETE = {
  concretePSI: "3000 PSI",
  column: { w: 0.30, d: 0.30 },          // pórtico/mampostería confinada
  columnLigero: { w: 0.10, d: 0.10 },    // acero liviano: postes metálicos
  beam: { w: 0.30, d: 0.25 },
  slab: { thickness: 0.12 },             // losa maciza; steel framing → losa ligera
  slabLigera: { thickness: 0.10 },
  footing: { pad: 1.1, thickness: 0.30, pedestal: 0.30 },
};

/** Bloques MEP — dimensiones (m) y altura de montaje (z desde piso). */
export type Block3D = { kind: string; w: number; d: number; h: number; z: number; shape: "box" | "cyl" };

export const MEP_BLOCKS: Record<string, Block3D> = {
  // Eléctrico (RETIE)
  tablero: { kind: "Tablero eléctrico", w: 0.45, d: 0.12, h: 0.60, z: 1.40, shape: "box" },
  tomacorriente: { kind: "Tomacorriente dúplex", w: 0.11, d: 0.06, h: 0.11, z: 0.40, shape: "cyl" },
  tomacorriente_especial: { kind: "Tomacorriente especial 220V", w: 0.12, d: 0.07, h: 0.12, z: 1.20, shape: "cyl" },
  interruptor: { kind: "Interruptor simple", w: 0.09, d: 0.05, h: 0.12, z: 1.10, shape: "cyl" },
  iluminacion: { kind: "Punto de iluminación", w: 0.16, d: 0.06, h: 0.16, z: -0.30, shape: "cyl" }, // z negativo = techo (relativo)
  // Hidrosanitario (RAS/Neufert)
  sanitario: { kind: "Inodoro", w: 0.38, d: 0.70, h: 0.75, z: 0, shape: "box" },
  lavamanos: { kind: "Lavamanos", w: 0.55, d: 0.42, h: 0.85, z: 0, shape: "box" },
  ducha: { kind: "Ducha + punto agua", w: 0.90, d: 0.90, h: 0.10, z: 0.02, shape: "box" },
  lavaplatos: { kind: "Lavaplatos", w: 0.60, d: 0.55, h: 0.85, z: 0, shape: "box" },
  lavadero: { kind: "Lavadero", w: 0.65, d: 0.50, h: 0.85, z: 0, shape: "box" },
  calentador: { kind: "Calentador", w: 0.45, d: 0.45, h: 0.60, z: 1.80, shape: "box" },
  punto_hidraulico: { kind: "Punto hidráulico", w: 0.10, d: 0.10, h: 0.10, z: 0.15, shape: "cyl" },
};

/** Materiales con nombre comercial para el IFC. */
export const MATERIALS = {
  concreto: "Concreto estructural 3000 PSI",
  ladrillo: "Ladrillo cerámico H-10",
  panete: "Mortero de pañete 1:4",
  acero: "Perfil metálico galvanizado",
  maderaMat: "Madera aserrada tratada",
  guaduaMat: "Guadua angustifolia tratada",
  tierraMat: "Tierra estabilizada (bahareque)",
  losa: "Losa de concreto 3000 PSI e=12cm",
  vidrio: "Vidrio templado 6mm",
  hojaPuerta: "Puerta madera contrachapada",
  griferia: "PVC hidráulico / grifería",
  cobre: "Cobre THW 12AWG + canalización PVC",
};
