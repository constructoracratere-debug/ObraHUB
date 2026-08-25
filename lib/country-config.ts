/**
 * Country configuration — the LATAM foundation.
 *
 * DOMINAR COLOMBIA primero; MÉXICO trazado y listo para activarse cuando
 * llegue su catálogo de precios. Cada país define moneda, impuestos y el
 * modelo de cargos del APU — el generador y formatters leen de aquí,
 * nunca más hardcodeados.
 */

export type CountryCode = "colombia" | "mexico";

export type ChargesModel =
  | { kind: "aiu"; administracion: number; imprevistos: number; utilidad: number; label: string }
  | { kind: "custom"; lines: Array<{ name: string; pct: number }>; label: string };

export type CountryConfig = {
  code: CountryCode;
  name: string;
  flag: string;
  locale: string;
  currency: "COP" | "MXN";
  currencyFormatter: (n: number) => string;
  iva: number;
  charges: ChargesModel;
  priceSource: string;
  buildingCode: { name: string; ref: string };
  keyNorms: string[];
  bitacoraLegal: string;
  status: "active" | "scaffolded";
};

const fmt = (locale: string, opts: Intl.NumberFormatOptions) => (n: number) =>
  new Intl.NumberFormat(locale, { style: "currency", ...opts }).format(n);

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  colombia: {
    code: "colombia",
    name: "Colombia",
    flag: "🇨🇴",
    locale: "es-CO",
    currency: "COP",
    currencyFormatter: (n) =>
      new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n),
    iva: 19,
    charges: { kind: "aiu", administracion: 13, imprevistos: 3, utilidad: 6, label: "AIU (13+3+6)" },
    priceSource: "Base ObraHub-SISDOCES",
    buildingCode: { name: "NSR-10", ref: "Ley 400 de 1997 / Decreto 926 de 2010" },
    keyNorms: [
      "NSR-10 (Títulos A-J)",
      "RETIE (Res. 40117/2024)",
      "RAS (Res. 0330/2017)",
      "NTC-LIC (Ley 20257 bitácora de obra)",
      "Res. 037/2024 — Construcción sostenible",
      "NSR-10 Cap. E.7 — Bahareque encementado",
    ],
    bitacoraLegal: "Ley 20257 de 2020 — bitácora de obra obligatoria para licencias",
    status: "active",
  },
  mexico: {
    code: "mexico",
    name: "México",
    flag: "🇲🇽",
    locale: "es-MX",
    currency: "MXN",
    currencyFormatter: (n) =>
      new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n),
    iva: 16,
    charges: {
      kind: "custom",
      lines: [
        { name: "Financiamiento", pct: 1.5 },
        { name: "Utilidad", pct: 10 },
        { name: "Cargos adicionales / administración", pct: 5 },
      ],
      label: "Financiamiento + Utilidad + Cargos (1.5+10+5)",
    },
    priceSource: "Catálogo OPUS (pendiente cargar)",
    buildingCode: { name: "RCDF + NTC-CDMX", ref: "Gaceta Oficial CDMX 2004 y complementarias" },
    keyNorms: [
      "RCDF (Reglamento de Construcción CDMX)",
      "NTC-CDF (Normas Técnicas Complementarias)",
      "CFE — instalaciones eléctricas",
      "NOM (Normas Oficiales Mexicanas aplicables)",
    ],
    bitacoraLegal: "Bitácora de obra — reglamento interno por entidad federativa",
    status: "scaffolded",
  },
};

export function getCountry(code: string | null | undefined): CountryConfig {
  return COUNTRIES[(code === "mexico" ? "mexico" : "colombia") as CountryCode];
}

/** Prompt block per country for the APU generator. */
export function chargesPrompt(c: CountryConfig): string {
  if (c.charges.kind === "aiu") {
    const ch = c.charges;
    return `Aplica ${ch.label} = ${ch.administracion + ch.imprevistos + ch.utilidad}% sobre el costo directo (${ch.administracion}% Administración, ${ch.imprevistos}% Imprevistos, ${ch.utilidad}% Utilidad). Aplica IVA del ${c.iva}% sobre (costo directo + cargos).`;
  }
  const lines = c.charges.lines.map((l) => `${l.pct}% ${l.name}`).join(", ");
  return `Aplica los cargos del modelo mexicano (${lines}) según práctica OPUS/RCC, e IVA del ${c.iva}%.`;
}
