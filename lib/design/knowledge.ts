/**
 * ✏️ Diseño IA — Base de conocimiento canónica del dibujo arquitectónico.
 *
 * FUENTES (bibliografía estándar de la carrera; datos factuales y rangos de
 * práctica profesional, citados por obra — sin reproducir texto protegido):
 *
 *  · Francis D. K. Ching — "Manual de dibujo arquitectónico" (Architectural
 *    Graphics): jerarquía de líneas, poché, simbología de puertas/ventanas,
 *    convenciones de cotas, flecha de norte, escala gráfica, cajetín.
 *  · Francis D. K. Ching — Building Construction Illustrated / Diccionario
 *    visual: espesores y despieces constructivos.
 *  · Ernst Neufert — "El arte de proyectar en arquitectura": dimensiones
 *    antropométricas y funcionales (AU), escaleras (regla 2h+p≈63 cm),
 *    triángulo de trabajo, claros libres ante aparatos.
 *  · Mauricio Plazola (ed.) — "Arquitectura Habitacional" (vols. 1/2):
 *    EL estándar dimensionamiento habitacional en Colombia/LATAM.
 *  · Julius Panero & Martin Zelnik — "Human Dimension & Interior Space":
 *    antropometría, circulaciones (55–60 cm/persona).
 *  · Joseph De Chiara et al. — Time-Saver Standards for Building Types.
 *  · Ramsey/Sleeper (AIA) — Architectural Graphic Standards: simbología.
 *  · Normativa CO: NTC 4595, NSR-10 (A.1/A.3/A.6/C.11/E.*), RETIE, RAS.
 *
 * Esta KB alimenta (1) las PERSONAS del pipeline (agents.ts) con dimensiones
 * fundadas y (2) el MOTOR GRÁFICO (dxf.ts) con las convenciones de Ching.
 */

import type { RoomType } from "./schema";

// ─── 1. Dimensional habitacional (Neufert · Plazola · Panero) ────────────────
// minSide/minArea = mínimo digno (gate falla si se incumple);
// recSide/recArea = recomendado de práctica (el arquitecto apunta aquí).

export type DimensionalStandard = {
  label: string;
  minSide: number;   // m — lado mínimo libre
  minArea: number;   // m² — área mínima neta (0 = sin gate de área)
  recSide: number;   // m — lado recomendado
  recArea: number;   // m² — área recomendada
  note?: string;     // criterio práctico citado
};

export const DIMENSIONAL_STANDARDS: Partial<Record<RoomType, DimensionalStandard>> = {
  habitacion: {
    label: "Habitación", minSide: 2.0, minArea: 6.0, recSide: 2.7, recArea: 9.0,
    note: "1 cama + circulación lateral 60 cm (Panero); Neufert ~8 m²/1 cama",
  },
  habitacion_principal: {
    label: "Habitación principal", minSide: 2.6, minArea: 9.0, recSide: 3.2, recArea: 13.0,
    note: "Cama doble 1.6 m + 2 laterales 60 cm + closet (Neufert 12–14 m²)",
  },
  bano: {
    label: "Baño", minSide: 1.0, minArea: 1.8, recSide: 1.5, recArea: 3.2,
    note: "Zona sanitario ≥0.6 m de ancho + claro frontal 0.55–0.6 m (Neufert); ducha 0.9×0.9 (mín 0.8×0.8)",
  },
  cocina: {
    label: "Cocina", minSide: 1.5, minArea: 4.0, recSide: 2.4, recArea: 7.0,
    note: "Triángulo de trabajo (fregadero−estufa−nevera) entre 3.6 y 6.6 m; counter h 0.85–0.95 (Neufert)",
  },
  sala: {
    label: "Sala", minSide: 2.5, minArea: 9.0, recSide: 3.3, recArea: 14.0,
    note: "4 personas ~17 m² (Neufert); conversación U 2.4–3.0 m",
  },
  comedor: {
    label: "Comedor", minSide: 2.4, minArea: 7.0, recSide: 3.0, recArea: 10.0,
    note: "Mesa 4: 1.2×0.8 + sillas 60 cm + servicio 45 cm (Neufert)",
  },
  estudio: {
    label: "Estudio", minSide: 2.0, minArea: 6.0, recSide: 2.6, recArea: 8.0,
  },
  lavanderia: {
    label: "Lavandería", minSide: 1.0, minArea: 2.0, recSide: 1.5, recArea: 3.5,
    note: "Lavadora 0.6 + secadora 0.6 + claro frontal 0.9",
  },
  pasillo: {
    label: "Pasillo", minSide: 0.9, minArea: 0, recSide: 1.2, recArea: 0,
    note: "Vivienda ≥0.9 m; 1 persona 55–60 cm + claro (Panero); accesible ≥0.9 (NSR-10 A.6)",
  },
  balcon: { label: "Balcón", minSide: 0.9, minArea: 1.8, recSide: 1.4, recArea: 4.0 },
  garaje: {
    label: "Garaje", minSide: 2.5, minArea: 12.5, recSide: 3.0, recArea: 15.5,
    note: "Puesto 2.4×4.8 mínimo / 2.5×5.0 recomendado (Neufert/Plazola)",
  },
};

// ─── Claros libres y elementos (Neufert/Panero/RETIE/RAS) ────────────────────

export const CLEARANCES = {
  doorMain: { min: 0.9, rec: 1.0 },      // accesible NSR-10 A.6 ≥0.9
  doorInterior: { min: 0.7, rec: 0.75 },
  doorBath: { min: 0.6, rec: 0.65 },
  corridorHousing: { min: 0.9, rec: 1.2 },
  stairWidth: { min: 0.9, rec: 1.1 },    // vivienda
  // Regla de Blondel/Neufert: 2h + p ≈ 60–66 cm (63 óptimo); h 16–18, p 28–30
  stairRule: { huella: [0.28, 0.30], contrahuella: [0.16, 0.18], formula: "2h+p=63cm" },
  lavaboFrontal: { min: 0.55, rec: 0.65 },
  sanitarioFrontal: { min: 0.5, rec: 0.6 },
  ducha: { min: [0.8, 0.8], rec: [0.9, 0.9] },
  kitchenTriangle: { minSum: 3.6, maxSum: 6.6 },
  counterHeight: [0.85, 0.95],
  // Iluminación/ventilación natural (práctica habitacional CO — verificar NTC 4595)
  windowToFloorRatio: { min: 1 / 10, note: "área de ventana ≥ 1/10 del piso; baño con ducto ≥1/30 o ventilación mecánica" },
} as const;

// ─── Convenciones gráficas (Ching — Architectural Graphics) ─────────────────
// Peso de línea por capa (mm a escala 1:50 sobre papel; el motor los traduce
// a jerarquía visual — en DXF R12 el grosor se percibe por color/entidad).

export const LINE_HIERARCHY: Record<string, { weight: "thick" | "medium" | "thin"; colorNote: string }> = {
  MUROS: { weight: "thick", colorNote: "líneas de corte — las más gruesas del plano (Ching §líneas)" },
  PUERTAS: { weight: "medium", colorNote: "hoja + arco de giro" },
  VENTANAS: { weight: "medium", colorNote: "triple línea dentro del muro" },
  EJES: { weight: "thin", colorNote: "trazo-punto, más allá del edificio" },
  ELECTRICO: { weight: "thin", colorNote: "símbolos normalizados" },
  HIDROSANITARIO: { weight: "thin", colorNote: "símbolos normalizados" },
  TEXTOS: { weight: "thin", colorNote: "mayúsculas en títulos; alturas 2.5/3.5 mm @1:50" },
  COTAS: { weight: "thin", colorNote: "línea de cota fina + ticks oblicuos 45°" },
};

/** Poché de muros cortados: rayado a 45° (Ching) — espaciado en metros. */
export const POCHÉ = { angleDeg: 45, spacing: 0.09, maxSegments: 1400 };

/** Flecha de norte (siempre presente, esquina superior), tamaño en m. */
export const NORTH_ARROW = { size: 1.1 };

/** Escala gráfica: barras alternadas 0–1–2–5 m (legible a cualquier zoom). */
export const SCALE_BAR = { segments: [1, 1, 3], unitLabel: "m" };

/** Cajetín (title block) — campos estándar de lámina arquitectónica. */
export const TITLE_BLOCK_FIELDS = ["PROYECTO", "PLANO", "ESCALA", "FECHA", "DIBUJÓ", "LÁMINA"] as const;

// ─── Compresión para prompts (lo que las personas reciben) ───────────────────

/** Tabla dimensional compacta para inyectar al system prompt del arquitecto. */
export function dimensionalTableForPrompt(): string {
  const rows = Object.entries(DIMENSIONAL_STANDARDS).map(([type, d]) => {
    const area = d.minArea > 0 ? ` área≥${d.minArea} m² (rec ${d.recArea})` : "";
    return `${type}: lado≥${d.minSide} m (rec ${d.recSide})${area} — ${d.label}`;
  });
  const cl = CLEARANCES;
  return [
    "TABLA DIMENSIONAL (Neufert/Plazola/Panero — cítala al decidir):",
    ...rows.map((r) => `· ${r}`),
    `· Puertas: principal ≥${cl.doorMain.min} m, interior ≥${cl.doorInterior.min}, baño ≥${cl.doorBath.min}`,
    `· Escalera (Blondel): ${cl.stairRule.formula}, huella ${cl.stairRule.huella[0]}–${cl.stairRule.huella[1]} m, contrahuella ${cl.stairRule.contrahuella[0]}–${cl.stairRule.contrahuella[1]} m, ancho ≥${cl.stairWidth.min} m`,
    `· Baño: claro frontal sanitario ≥${cl.sanitarioFrontal.min} m, lavabo ≥${cl.lavaboFrontal.min} m, ducha ≥${cl.ducha.min.join("×")}`,
    `· Cocina: triángulo de trabajo ${cl.kitchenTriangle.minSum}–${cl.kitchenTriangle.maxSum} m; ventana ≥ 1/10 del área del piso (NTC 4595 — verificar)`,
  ].join("\n");
}
