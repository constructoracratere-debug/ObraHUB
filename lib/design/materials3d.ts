/**
 * ✏️ PALETA 3D — materiales del SKILL 1 (NSR-10 Título E).
 *
 * Fuente ÚNICA de color/PBR para los DOS consumidores:
 *   1. planToIfc (ifc.ts): cada sólido lleva IFCSTYLEDITEM → el archivo
 *      descargado muestra sus materiales en CUALQUIER visor (BIMvision,
 *      usBIM, Revit, ifc.js) — "la capa del ladrillo, concreto, acero,
 *      vidrio, loseta, tierra, madera…" viaja DENTRO del IFC.
 *   2. IfcLive (ifc-live.tsx): el visor in-app pinta por nombre/tipo con
 *      la MISMA tabla + iluminación PBR — lo que ves abajo es lo que se
 *      descarga.
 *
 * Sistemas del skill (schema.StructuralSystem):
 *   · mamposteria_confinada (E.3) → muros LADRILLO + esqueleto CONCRETO
 *   · bahareque_encamisado (E.7) → muros TIERRA/MADERA encamisados
 *   (concreto/mixto/acero_liviano de skills futuros ya mapeados.)
 */

import { MATERIALS } from "./materials";

export type Mat3D = {
  /** Color base sRGB (0xRRGGBB) — también viaja al IFCSURFACESTYLE. */
  hex: number;
  roughness: number;
  metalness: number;
  /** <1 = translúcido (vidrio). */
  opacity?: number;
  /** Emisión suave (puntos MEP vivos). */
  emissive?: number;
  label: string;
};

/** Registro por NOMBRE de material (los mismos nombres de materials.ts
 *  y de las capas de WALL_ASSEMBLIES — así IFC y visor nunca divergen). */
export const MAT3D: Record<string, Mat3D> = {
  // ── Título E · mampostería confinada ─────────────────────────────────
  [MATERIALS.ladrillo]: { hex: 0xb04a26, roughness: 0.92, metalness: 0.02, label: "Ladrillo cerámico (mampostería E.3)" },
  [MATERIALS.panete]: { hex: 0xcdc8ba, roughness: 0.9, metalness: 0.02, label: "Mortero de pañete" },
  "Repello cemento-arena + malla 3cm": { hex: 0xc9c4b5, roughness: 0.9, metalness: 0.02, label: "Repello cemento (encamisado E.7)" },
  "Repello interior 3cm": { hex: 0xd3cec1, roughness: 0.9, metalness: 0.02, label: "Repello interior" },
  // ── Título E · bahareque encamisado (E.7 — diafragma de guadua) ─────
  [MATERIALS.tierraMat]: { hex: 0x9c7a4d, roughness: 0.95, metalness: 0.0, label: "Arcilla/tierra (bahareque E.7)" },
  [MATERIALS.maderaMat]: { hex: 0x9a6a3f, roughness: 0.72, metalness: 0.0, label: "Madera aserrada" },
  [MATERIALS.guaduaMat]: { hex: 0xc8a44a, roughness: 0.6, metalness: 0.05, label: "Guadua angustifolia (G.12)" },
  "Esterilla de guadua angustifolia": { hex: 0xd0b062, roughness: 0.7, metalness: 0.03, label: "Esterilla de guadua" },
  "Esterilla de guadua + montantes 0.08": { hex: 0xd0b062, roughness: 0.7, metalness: 0.03, label: "Esterilla de guadua (división)" },
  "Relleno arcilla/barro + esterilla interior": { hex: 0x8d6a40, roughness: 0.95, metalness: 0.0, label: "Arcilla + esterilla" },
  "Encamisado exterior: mortero cemento-arena e=3cm + malla": { hex: 0xc9c4b5, roughness: 0.9, metalness: 0.02, label: "Encamisado cemento (E.7)" },
  "Encamisado interior: mortero cemento-arena e=2cm": { hex: 0xd3cec1, roughness: 0.9, metalness: 0.02, label: "Encamisado interior" },
  // ── Estructura (confinamiento) ───────────────────────────────────────
  [MATERIALS.concreto]: { hex: 0xb6b3a8, roughness: 0.88, metalness: 0.0, label: "Concreto 3000 PSI" },
  [MATERIALS.losa]: { hex: 0xc4c1b6, roughness: 0.85, metalness: 0.0, label: "Losa de concreto" },
  "Losa ligera steel deck": { hex: 0xb9bcc2, roughness: 0.7, metalness: 0.2, label: "Losa ligera steel deck" },
  [MATERIALS.acero]: { hex: 0x9fa8b0, roughness: 0.38, metalness: 0.85, label: "Acero galvanizado" },
  // ── Carpintería ──────────────────────────────────────────────────────
  [MATERIALS.vidrio]: { hex: 0xaed6e8, roughness: 0.06, metalness: 0.1, opacity: 0.32, label: "Vidrio templado 6mm" },
  [MATERIALS.hojaPuerta]: { hex: 0x8a5a2b, roughness: 0.68, metalness: 0.0, label: "Puerta de madera" },
  "Teja de barro": { hex: 0x9a4a2b, roughness: 0.85, metalness: 0.0, label: "Teja de barro" },
  "Teja fibrocemento": { hex: 0x77828c, roughness: 0.8, metalness: 0.05, label: "Teja de fibrocemento" },
  "Tablero fibrocemento 8mm": { hex: 0x8d979f, roughness: 0.8, metalness: 0.05, label: "Tablero fibrocemento" },
  // ── Instalaciones ────────────────────────────────────────────────────
  [MATERIALS.cobre]: { hex: 0xb87333, roughness: 0.3, metalness: 0.8, label: "Cobre eléctrico" },
  [MATERIALS.griferia]: { hex: 0xd9dee3, roughness: 0.35, metalness: 0.1, label: "PVC hidráulico" },
  "MEP eléctrico": { hex: 0xf6a821, roughness: 0.5, metalness: 0.2, emissive: 0x664400, label: "Punto eléctrico RETIE" },
  "MEP hidrosanitario": { hex: 0x3d9bd6, roughness: 0.45, metalness: 0.1, emissive: 0x0a2436, label: "Punto hidrosanitario RAS" },
  "Excavación en tierra (Df 1.50)": { hex: 0x6e5233, roughness: 1, metalness: 0, opacity: 0.3, label: "Excavación (tierra removida)" },
  // ── Interior (mobiliario del solver Neufert + acabados) ──────────────
  "Porcelana sanitaria": { hex: 0xf4f6f7, roughness: 0.18, metalness: 0.0, label: "Porcelana" },
  "Mueble de madera": { hex: 0xa9743e, roughness: 0.7, metalness: 0.0, label: "Madera (mobiliario)" },
  "Tela tapiz": { hex: 0x55617a, roughness: 0.95, metalness: 0.0, label: "Tela" },
  "Metal electrodoméstico": { hex: 0xb9bfc6, roughness: 0.3, metalness: 0.8, label: "Metal" },
  "Loseta": { hex: 0xd8d5cd, roughness: 0.28, metalness: 0.0, label: "Loseta / porcelanato" },
  "Piso madera": { hex: 0x9c6b38, roughness: 0.55, metalness: 0.0, label: "Piso de madera" },
  "Piso pulido": { hex: 0x6e6a63, roughness: 0.15, metalness: 0.1, label: "Pulido brillante" },
};

const byKeyword: Array<[RegExp, Mat3D]> = [
  [/ladrillo|mamposter/i, MAT3D[MATERIALS.ladrillo]],
  [/guadua|bambu/i, MAT3D[MATERIALS.guaduaMat]],
  [/bahareque|tierra|arcilla|barro|esterilla/i, MAT3D[MATERIALS.tierraMat]],
  [/madera|montante|contrachap/i, MAT3D[MATERIALS.maderaMat]],
  [/concreto|losa|cemento|repello|pañete|mortero/i, MAT3D[MATERIALS.concreto]],
  [/vidrio/i, MAT3D[MATERIALS.vidrio]],
  [/acero|met[aá]lic|galvaniz|perfil/i, MAT3D[MATERIALS.acero]],
  [/cobre|el[eé]ctric|tablero|tomacorriente|interruptor|iluminaci[oó]n/i, MAT3D["MEP eléctrico"]],
  [/hidr|sanitar|lavamanos|inodoro|ducha|lavaplatos|lavadero|calentador|pvc/i, MAT3D["MEP hidrosanitario"]],
  [/porcelana|inodoro|lavamanos|sanitario/i, MAT3D["Porcelana sanitaria"]],
  [/sof[aá]|cama|silla|comedor|mesa|tapiz|alfombra/i, MAT3D["Tela tapiz"]],
  [/closet|mostrador|escritorio|tv|mueble|lavadero/i, MAT3D["Mueble de madera"]],
  [/pletina|perno|riostra|perfil i|gusset|anclaje|a325|refuerzo Ø|acero estructural/i, MAT3D[MATERIALS.acero]],
  [/excavaci|tierra removida|desplante/i, MAT3D["Excavación en tierra (Df 1.50)"]],
  [/teja|cubierta/i, MAT3D["Teja de barro"]],
];

/** Resuelve el material 3D por NOMBRE (exacto → keyword). null si el
 *  nombre NO es de nuestra paleta (para que visores de archivos ajenos
 *  conserven su color por clase). */
export function mat3dResolved(name?: string): Mat3D | null {
  if (name && MAT3D[name]) return MAT3D[name];
  if (name) {
    for (const [re, m] of byKeyword) if (re.test(name)) return m;
  }
  return null;
}

const MAT3D_DEFAULT: Mat3D = { hex: 0xc3ccd6, roughness: 0.85, metalness: 0.05, label: "Genérico" };

/** Resuelve el material 3D por NOMBRE (exacto → keyword → neutro). */
export function mat3d(name?: string): Mat3D {
  return mat3dResolved(name) ?? { ...MAT3D_DEFAULT, label: name ?? "Genérico" };
}

/** Muro DOMINANTE por sistema (Título E): lo que el muro "es" a la vista. */
export function wallMatOf(system: string, face: "ext" | "int" = "ext"): string {
  switch (system) {
    case "bahareque_encamisado":
      // El muro LEE como bahareque: guadua a la vista del diafragma.
      return face === "ext" ? MATERIALS.guaduaMat : "Esterilla de guadua + montantes 0.08";
    case "acero_liviano":
      return "Tablero fibrocemento 8mm";
    case "mamposteria_confinada":
    default:
      return MATERIALS.ladrillo; // E.3: muro de ladrillo confinado
  }
}

/** Cubierta por sistema: teja de barro (cafetera) salvo steel framing. */
export function roofMatOf(system: string): string {
  return system === "acero_liviano" ? "Teja fibrocemento" : "Teja de barro";
}

/** Piso según el acabado declarado del espacio (A-06). */
export function floorMatOf(finish?: string): string {
  if (!finish) return "Loseta";
  const s = finish.toLowerCase();
  if (/madera|tablac|parqu[eé]/.test(s)) return "Piso madera";
  if (/pulido|m[aá]rmol|brillan/.test(s)) return "Piso pulido";
  return "Loseta";
}

/** Mobiliario del solver (furniture3D names) → material. */
export function furnitureMatOf(name: string): string {
  const s = name.toLowerCase();
  if (/inodoro|lavamanos|lavaplatos/.test(s)) return "Porcelana sanitaria";
  if (/nevera|lavadora|estufa/.test(s)) return "Metal electrodoméstico";
  if (/cama|sof[aá]|silla|mesa|comedor/.test(s)) return "Tela tapiz";
  return "Mueble de madera";
}
