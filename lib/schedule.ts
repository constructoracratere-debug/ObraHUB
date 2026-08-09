import OpenAI from "openai";

/**
 * AI-powered construction schedule generation (Cronograma de Obra).
 * Follows Colombian professional standards (IDU / INVÍAS / CAMACOL):
 * - Task structure: Capítulos → Actividades → Subactividades
 * - Construction sequence: Preliminares → Cimentación → Estructura →
 *   Mampostería → Cubiertas → Acabados → Instalaciones → Entregas
 * - Milestones use Colombian terminology (Acta de inicio, Recepción, etc.)
 * - Durations based on Colombian productivity rates
 */

export type ScheduleTask = {
  name: string;
  description?: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string;
  progress: number; // 0-100
  dependencies: string[]; // names of tasks that must finish first
  type: "task" | "milestone" | "summary";
  duration: number; // days
};

export type Schedule = {
  title: string;
  startDate: string;
  tasks: ScheduleTask[];
};

const SYSTEM_PROMPT = `Eres un planificador de obras civil en Colombia, experto en cronogramas de construcción (formato Gantt) para presentación a curadurías, interventorías, IDU e INVÍAS.

REGLAS PARA EL CRONOGRAMA:
1. SIGUE LA SECUENCIA CONSTRUCTIVA COLOMBIANA ESTÁNDAR:
   - Preliminares (licencias, acta de inicio, trazado, cerramiento)
   - Movimientos de tierra (excavación, rellenos, compactación)
   - Cimentación (zapatas, vigas de fundación, drenajes)
   - Estructura (columnas, vigas, losas, muros estructurales)
   - Mampostería (muros divisorios, bloques, ladrillo)
   - Cubiertas (entrepisos, techo, impermeabilización)
   - Instalaciones (eléctricas, hidrosanitarias, gas)
   - Acabados (repellos, pintura, pisos, carpintería, sanitarios)
   - Exteriores (andenes, jardines, accesos)
   - Entrega (acta de entrega, recepción provisional, recepción definitiva)
2. USA HITOS (milestones) colombianos: "Acta de inicio de obra", "Entrega de cimentación", "Estructura completa", "Obra negra terminada", "Obra limpia terminada", "Recepción provisional", "Recepción definitiva".
3. LAS DURACIONES deben ser realistas según rendimientos CAMACOL para Colombia (ej: muros de bloques ~15-20 m²/día/oficial, losas ~100 m²/semana, pintura ~40-50 m²/día).
4. DEPENDENCIAS: cada tarea debe tener su predecesora lógica (finish-to-start). Las tareas paralelas solo cuando es constructivamente posible.
5. TIPOS: "summary" para capítulos (Preliminares, Cimentación, etc.), "task" para actividades, "milestone" para hitos.
6. FECHAS: usa formato YYYY-MM-DD. Calcula fechas reales considerando días calendario (sin domingos ni festivos si es posible).
7. Cada capítulo debe tener 3-8 sub-actividades detalladas.

DEVUELVE EXCLUSIVAMENTE JSON válido:
{
  "title": "Cronograma - [descripción del proyecto]",
  "startDate": "2025-01-15",
  "tasks": [
    {"name":"Preliminares","type":"summary","startDate":"...","endDate":"...","duration":10,"progress":0,"dependencies":[]},
    {"name":"Acta de inicio de obra","type":"milestone","startDate":"...","endDate":"...","duration":0,"progress":0,"dependencies":[]},
    {"name":"Trazado y replanteo","type":"task","startDate":"...","endDate":"...","duration":3,"progress":0,"dependencies":["Acta de inicio de obra"]},
    ...
  ]
}`;

/**
 * Generates a construction schedule from a prompt or budget.
 */
export async function generateSchedule(
  prompt: string,
  budgetContext?: string,
): Promise<Schedule> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey });

  let userContent = `CRONOGRAMA SOLICITADO:\n${prompt}`;
  if (budgetContext) {
    userContent += `\n\nPRESUPUESTO DE REFERENCIA (usar capítulos e ítems como base del cronograma):\n${budgetContext}`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("El modelo no devolvió una respuesta");

  try {
    return JSON.parse(raw) as Schedule;
  } catch {
    throw new Error("El modelo devolvió JSON inválido. Intente de nuevo.");
  }
}
