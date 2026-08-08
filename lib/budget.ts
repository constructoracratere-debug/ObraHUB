import OpenAI from "openai";
import type { PriceItem } from "@/lib/prices";
import { buildPriceContext } from "@/lib/prices";

/**
 * APU (Análisis de Precios Unitarios) budget generation.
 * Sends the user's construction prompt + the price database to OpenAI,
 * which returns a structured JSON budget ready for Excel export.
 */

export type APUItem = {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  materiales: APULineItem[];
  manoObra: APULineItem[];
  equipos: APULineItem[];
  costoDirecto: number;
  aiu: { administracion: number; imprevistos: number; utilidad: number };
  precioUnitarioTotal: number;
  subtotal: number;
};

export type APULineItem = {
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
};

export type APUBudget = {
  titulo: string;
  capitulos: Array<{
    nombre: string;
    items: APUItem[];
  }>;
  resumen: {
    costosDirectos: number;
    aiuTotal: number;
    valorAIU: number;
    subtotalConAIU: number;
    iva: number;
    valorIVA: number;
    total: number;
  };
};

const SYSTEM_PROMPT = `Eres un analista de costos y presupuestos de construcción en Colombia.
Tu tarea es generar un ANÁLISIS DE PRECIOS UNITARIOS (APU) profesional, detallado y listo para presentar a entidades gubernamentales y clientes.

REGLAS ESTRICTAS:
1. USA ÚNICAMENTE los precios de la BASE DE DATOS DE PRECIOS proporcionada. No inventes precios.
2. Cada ítem debe desglosarse en: MATERIALES, MANO DE OBRA y EQUIPOS con cantidades y subtotales.
3. Las cantidades de materiales/mano de obra deben ser realistas por unidad de trabajo (rendimientos estándar colombianos).
4. Aplica AIU estándar: Administración (13%), Imprevistos (3%), Utilidad (6%) = 22% total sobre el costo directo.
5. Aplica IVA del 19% sobre (costo directo + AIU).
6. Organiza los ítems en CAPÍTULOS (Preliminares, Cimentación, Estructura, Mampostería, Acabados, Instalaciones, etc.).
7. El subtotal de cada línea (qty × unitPrice) debe ser matemáticamente correcto.
8. El costoDirecto de cada ítem = suma de subtotales de materiales + mano de obra + equipos.
9. precioUnitarioTotal = costoDirecto × (1 + AIU/100).
10. subtotal = precioUnitarioTotal × cantidad.

DEVUELVE EXCLUSIVAMENTE JSON válido (sin markdown, sin texto adicional) con esta estructura:
{
  "titulo": "descripción corta del presupuesto",
  "capitulos": [{
    "nombre": "Nombre del capítulo",
    "items": [{
      "codigo": "CAP.1",
      "descripcion": "descripción del ítem",
      "unidad": "m² | m³ | ml | unidad | global",
      "cantidad": 200,
      "materiales": [{"name":"...","unit":"...","qty":0.12,"unitPrice":45000,"subtotal":5400}],
      "manoObra": [{"name":"...","unit":"día","qty":0.05,"unitPrice":80000,"subtotal":4000}],
      "equipos": [{"name":"...","unit":"hora","qty":0.02,"unitPrice":28000,"subtotal":560}],
      "costoDirecto": 9960,
      "aiu": {"administracion":13,"imprevistos":3,"utilidad":6},
      "precioUnitarioTotal": 12151,
      "subtotal": 2430240
    }]
  }],
  "resumen": {
    "costosDirectos": 9960,
    "aiuTotal": 22,
    "valorAIU": 2191,
    "subtotalConAIU": 12151,
    "iva": 19,
    "valorIVA": 2309,
    "total": 14460
  }
}`;

/**
 * Generates an APU budget from a natural language prompt.
 * @param prompt - e.g. "pintar 200m2 con pintura blanca exterior"
 * @param prices - the price items from the database
 * @returns structured APU budget JSON
 */
export async function generateBudget(
  prompt: string,
  prices: PriceItem[],
): Promise<APUBudget> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey });
  const priceContext = buildPriceContext(prices);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `PRESUPUESTO SOLICITADO:\n${prompt}\n\n${priceContext}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("El modelo no devolvió una respuesta");

  try {
    return JSON.parse(raw) as APUBudget;
  } catch {
    throw new Error("El modelo devolvió JSON inválido. Intente de nuevo.");
  }
}
