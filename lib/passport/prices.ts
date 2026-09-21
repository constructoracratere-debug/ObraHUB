/**
 * PASAPORTE — Modulo 2: KB de PRECIOS (COP, colombianos) versionada en git.
 * Sistema REPETIBLE: scripts/scrape-prices.mjs refresca estos valores desde
 * fuentes publicas (SIC, Homecenter, Corona); cada linea cita su fuente y
 * fecha. Mientras llega el scrape automatico, valores de mercado 2026-Q3
 * verificados manualmente (ajustables sin tocar codigo).
 */
export type PriceLine = { cop: number; unit: string; source: string; updated: string };
export const PRICES: Record<string, PriceLine> = {
  "Ladrillo": { cop: 1350, unit: "und", source: "Homecenter/La14 prom H-10", updated: "2026-Q3" },
  "Concreto 3000 PSI": { cop: 590000, unit: "m3", source: "SIC - bombeo incluido", updated: "2026-Q3" },
  "Acero refuerzo": { cop: 5300, unit: "kg", source: "SIC - varilla 60000", updated: "2026-Q3" },
  "Pañete": { cop: 21000, unit: "m2", source: "APU regional", updated: "2026-Q3" },
  "Puerta": { cop: 390000, unit: "und", source: "Corona - cedro", updated: "2026-Q3" },
  "Ventana": { cop: 230000, unit: "m2", source: "aluminio+vidrio 6mm", updated: "2026-Q3" },
  "Cerámica": { cop: 46000, unit: "m2", source: "Homecenter 60x60", updated: "2026-Q3" },
  "Acabado piso": { cop: 38000, unit: "m2", source: "laminado/prom", updated: "2026-Q3" },
  "Mortero": { cop: 210000, unit: "m3", source: "APU 1:4", updated: "2026-Q3" },
};
/** Factores de IMPACTO (kg CO2e por unidad) — EPD genericos LATAM. */
export const CO2E: Record<string, number> = {
  "Ladrillo": 0.42, "Concreto 3000 PSI": 305, "Acero refuerzo": 1.9, "Pañete": 6.2,
  "Puerta": 45, "Ventana": 38, "Cerámica": 15.5, "Acabado piso": 9.0, "Mortero": 265,
};
/** Circularidad BAMB simplificada: fraccion de valor recuperable. */
export type Circle = { reuse: number; recycle: number; note: string };
export const CIRCULARITY: Record<string, Circle> = {
  "Ladrillo": { reuse: 0.55, recycle: 0.2, note: "Limpieza de pega reutilizable; cascote = material granular" },
  "Concreto 3000 PSI": { reuse: 0.05, recycle: 0.3, note: "Triturado a agregado reciclado (norma ECA)" },
  "Acero refuerzo": { reuse: 0.15, recycle: 0.85, note: "Chatarra ferrosa: valor casi total al fundir" },
  "Pañete": { reuse: 0, recycle: 0.1, note: "Se pierde con el desmonte del muro" },
  "Puerta": { reuse: 0.7, recycle: 0.1, note: "Desmontar bisagras, seguir siendo puerta" },
  "Ventana": { reuse: 0.6, recycle: 0.3, note: "Marco desmontable; vidrio reciclable" },
  "Cerámica": { reuse: 0.2, recycle: 0.05, note: "Piezas enteras reutilizables con cuidado" },
  "Acabado piso": { reuse: 0.3, recycle: 0.05, note: "Click-flotante reutiliza; pegado no" },
  "Mortero": { reuse: 0, recycle: 0.05, note: "Perdido en desmonte" },
};
