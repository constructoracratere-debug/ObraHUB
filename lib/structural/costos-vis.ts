/**
 * 💰 COSTOS DE CONTEXTO — VIS/vivienda rural en mampostería confinada.
 *
 * Fuentes: SISBEN, MINVIVIENDA (Decreto 2060/2007), SICEMACO,
 * proyectos aprobados en curaduría (contexto de mercado 2024-2026).
 * Determinista; el APU de cada proyecto se calcula en lib/passport/.
 */

export const COSTO_M2_MAMPOSTERIA = {
  /** Costo directo por m² construido (obra gris + acabados sencillos). */
  min: 1_450_000,     // VIS rural básico
  medio: 1_850_000,   // VIS estándar con acabados comerciales
  alto: 2_400_000,    // No-VIS con mejores acabados
  unidad: "COP/m² construido",
  fuente: "MINVIVIENDA + SICEMACO + proyectos curaduría 2024-2026",
} as const;

export const COSTO_PARTIDAS = [
  { partida: "Preliminares", pct: 3, nota: "Replanteo, cerramiento, temporales" },
  { partida: "Cimentación", pct: 12, nota: "Zapatas + pedestales + vigas corrida + placa" },
  { partida: "Estructura (muros+columnas+cadencias)", pct: 28, nota: "Ladrillo H-10, mortero, acero, concreto col." },
  { partida: "Cubierta", pct: 8, nota: "Cerchas + teja + impermeabilización" },
  { partida: "Instalaciones", pct: 10, nota: "RETIE eléctrica + RAS hidrosanitaria" },
  { partida: "Acabados", pct: 22, nota: "Pañete + pisos + pintura + carpintería" },
  { partida: "Aparatos + equipamiento", pct: 7, nota: "Sanitarios + grifería + cocineta" },
  { partida: "A.I.U. (administración+imprevistos+utilidad)", pct: 10, nota: "Estándar constructora" },
] as const;
