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
  escenarios?: APUEscenario[];
};

export type APUEscenario = {
  nombre: string;
  descripcion: string;
  costoDirecto: number;
  precioUnitarioTotal: number;
  subtotal: number;
};

export type APULineItem = {
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  source?: string;
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
2. DESGLOSE GRANULAR POR OFICIO: Cada ítem debe desglosarse en TODOS los materiales, mano de obra y equipos necesarios. Piensa como un maestro de obra:
   - INSTALACIONES ELÉCTRICAS: No solo "cable + electricista". Incluye: cable THW por calibre, conduit/tubo PVC, cajas de paso, cajas de conexión, tomacorrientes, interruptores, breakers, panel, neutro, tierra, tornillos, pegante para conduit, cinta aislante, etc.
   - CARPINTERÍA: No solo "madera + carpintero". Incluye: tabla principal, plywood, tornillos para madera, pegante, bisagras, cerraduras, lija, masilla, acabado/laca, cepillado, etc.
   - MAMPOSTERÍA: Ladrillo/bloque, mortero/cemento, arena, impermeabilizante, refuerzo (si aplica), alambre, etc.
   - PINTURA: Imprimación/sellador, masilla, cinta, lija, pintura (manos), rodillos/brochas (consumibles), andamios, etc.
   - ESTRUCTURA/CONCRETO: Cemento, arena, gravilla, acero de refuerzo por diámetro, alambre, formaleta, desmoldante, aditivos, vibrador, mezcladora, curado, etc.
   - HIDROSANITARIO: Tubo PVC por diámetro, codos, tees, reducciones, pegante PVC, llaves, accesorios, sellos, etc.
3. NUNCA agrupes materiales en una sola línea genérica. Si el trabajo requiere 8 materiales distintos, lista los 8.
4. Las cantidades de materiales/mano de obra deben ser realistas por unidad de trabajo (rendimientos estándar colombianos).
5. Aplica AIU estándar: Administración (13%), Imprevistos (3%), Utilidad (6%) = 22% total sobre el costo directo.
6. Aplica IVA del 19% sobre (costo directo + AIU).
7. Organiza los ítems en CAPÍTULOS (Preliminares, Cimentación, Estructura, Mampostería, Acabados, Instalaciones, etc.).
8. El subtotal de cada línea (qty × unitPrice) debe ser matemáticamente correcto.
9. TRACEABILIDAD DE FUENTES: Cada línea debe incluir en "source" el nombre EXACTO del ítem de la base de datos y su código. Ejemplo: "source": "Base ObraHub: Cemento gris structural (MAT-001) — ref. 2025".
10. El costoDirecto de cada ítem = suma de subtotales de materiales + mano de obra + equipos.
11. precioUnitarioTotal = costoDirecto × (1 + AIU/100).
12. subtotal = precioUnitarioTotal × cantidad.
13. Para cada ítem, genera 2-3 ESCENARIOS de precio alternativos en el campo "escenarios". Ejemplos:
    - "Económico" (usando ayudantes en lugar de oficiales, o materiales de menor costo),
    - "Premium" (materiales de primera calidad, mano de obra certificada).
    Cada escenario debe tener: nombre, descripción, costoDirecto, precioUnitarioTotal y subtotal.

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
      "materiales": [{"name":"...","unit":"...","qty":0.12,"unitPrice":45000,"subtotal":5400,"source":"Base ObraHub: Pintura vinílica interior blanco (MAT-015) — ref. 2025"}],
      "manoObra": [{"name":"...","unit":"día","qty":0.05,"unitPrice":80000,"subtotal":4000,"source":"Base ObraHub: Pintor profesional (LAB-004) — ref. 2025"}],
      "equipos": [{"name":"...","unit":"hora","qty":0.02,"unitPrice":28000,"subtotal":560,"source":"Base ObraHub: Andamio tubular (EQ-002) — ref. 2025"}],
      "costoDirecto": 9960,
      "aiu": {"administracion":13,"imprevistos":3,"utilidad":6},
      "precioUnitarioTotal": 12151,
      "subtotal": 2430240,
      "escenarios": [
        {"nombre":"Estándar","descripcion":"Cálculo principal con materiales y mano de obra estándar","costoDirecto":9960,"precioUnitarioTotal":12151,"subtotal":2430240},
        {"nombre":"Económico","descripcion":"Usando ayudantes en lugar de oficiales","costoDirecto":8500,"precioUnitarioTotal":10370,"subtotal":2074000}
      ]
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
