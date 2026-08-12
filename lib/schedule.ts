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
1. SIGUE LA SECUENCIA CONSTRUCTIVA COLOMBIANA ESTÁNDAR. Cada capítulo debe empezar con type "summary" y luego sus actividades type "task":
   - CAPÍTULO 1 - PRELIMINARES: Acta de inicio, trazado y replanteo, cerramiento y rampas, instalación de servicios temporales (agua, energía, sanitarios),Demoliciones si aplica.
   - CAPÍTULO 2 - MOVIMIENTOS DE TIERRA: Descapote, excavación masiva, excavación zapatas, rellenos y compactación, drenajes subterráneos.
   - CAPÍTULO 3 - CIMENTACIÓN: Concreto de limpieza, fundaciones (zapatas/pilotes), vigas de fundación, muros de contención, impermeabilización cimentación.
   - CAPÍTULO 4 - ESTRUCTURA: Columnas (desencofrado, hierro, concreto), vigas, losas (entrepiso y cubierta), muros estructurales, escaleras.
   - CAPÍTULO 5 - MAMPOSTERÍA: Muros divisorios (bloque H-10, ladrillo), mojinetes, dinteles, refuerzos.
   - CAPÍTULO 6 - CUBIERTAS: Estructura de techo, impermeabilización, canales y bajantes.
   - CAPÍTULO 7 - INSTALACIONES HIDROSANITARIAS: Acueducto (red interna, tanque, bomba), alcantarillado, gas domiciliario.
   - CAPÍTULO 8 - INSTALACIONES ELÉCTRICAS: Tubería y cajas, cableado, tablero y breakers, toma e interruptores, iluminación.
   - CAPÍTULO 9 - ACABADOS: Repellos, pisos (cerámica/mármol/porcelanato), enlucidos, pintura interior/exterior, carpintería metálica (puertas, ventanas), carpintería en madera, sanitarios y grifería.
   - CAPÍTULO 10 - EXTERIORES Y ZONAS COMUNES: Andenes y rampas, zonas verdes, cerramiento perimetral, señalización.
   - CAPÍTULO 11 - ENTREGAS: Aseo y limpieza final, entrega a interventoría, recepción provisional, recepción definitiva, acta de entrega.

2. USA HITOS (milestones) colombianos EN LOS MOMENTOS CLAVE: "Acta de inicio de obra", "Cimentación completada", "Estructura completada", "Obra negra entregada", "Obra limpia entregada", "Recepción provisional", "Recepción definitiva".

3. LAS DURACIONES deben ser realistas según rendimientos CAMACOL para Colombia:
   - Excavación: 8-12 m³/día/oficial
   - Concreto zapatas: 5-8 m³/día
   - Columnas: 15-20 m² de superficie/día
   - Losas: 80-120 m²/semana
   - Muros bloque H-10: 15-20 m²/día/oficial
   - Repellos: 25-35 m²/día/oficial
   - Pisos cerámica: 25-30 m²/día/oficial
   - Pintura: 40-50 m²/día/oficial

4. DEPENDENCIAS: cada tarea debe tener su predecesora lógica (finish-to-start). Usa paralelismo solo cuando sea constructivamente posible (ej: mampostería y instalaciones pueden ir paralelas en diferentes zonas).

5. TIPOS: "summary" para capítulos, "task" para actividades, "milestone" para hitos.

6. FECHAS: usa formato YYYY-MM-DD. Empieza desde mañana. Calcula fechas reales sumando días calendario. NO cuentes domingos como días laborables (resta 1 día extra por cada semana).

7. GENERA MÍNIMO 40 TAREAS para proyectos medianos y hasta 70+ para proyectos grandes. Cada capítulo debe tener 3-8 sub-actividades detalladas con nombres específicos (ej: "Columnas Piso 1 - Hierro", "Columnas Piso 1 - Concreto y desencofrado").

8. La duración de un capítulo "summary" debe abarcar desde el inicio de su primera tarea hasta el fin de su última tarea.

DEVUELVE EXCLUSIVAMENTE JSON válido:
{
  "title": "Cronograma - [descripción del proyecto]",
  "startDate": "2025-01-15",
  "tasks": [
    {"name":"CAPÍTULO 1 - PRELIMINARES","type":"summary","startDate":"...","endDate":"...","duration":10,"progress":0,"dependencies":[]},
    {"name":"Acta de inicio de obra","type":"milestone","startDate":"...","endDate":"...","duration":0,"progress":0,"dependencies":[]},
    {"name":"Trazado y replanteo","type":"task","startDate":"...","endDate":"...","duration":3,"progress":0,"dependencies":["Acta de inicio de obra"]},
    {"name":"CAPÍTULO 2 - MOVIMIENTOS DE TIERRA","type":"summary",...},
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
    // Detailed 40-70 task schedules need headroom
    max_tokens: 8000,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("El modelo no devolvió una respuesta");

  try {
    return JSON.parse(raw) as Schedule;
  } catch {
    throw new Error("El modelo devolvió JSON inválido. Intente de nuevo.");
  }
}

const EDIT_PROMPT = `Eres un planificador de obras civil en Colombia. Recibirás un cronograma existente en formato JSON y una instrucción de modificación del usuario.

APLICA LOS CAMBIOS SOLICITADOS y devuelve el cronograma COMPLETO modificado (no solo los cambios).

REGLAS:
1. Conserva la estructura: type "summary" para capítulos, "task" para actividades, "milestone" para hitos.
2. Mantén las dependencias lógicas (finish-to-start). Si mueves una tarea, ajusta las dependientes.
3. Recalcula las fechas (formato YYYY-MM-DD) teniendo en cuenta la nueva secuencia.
4. Si añades tareas, asígnales una posición lógica en la secuencia constructiva.
5. Si eliminas tareas, ajusta las dependencias de las que dependían de ellas.
6. Conserva el formato JSON exacto: { "title", "startDate", "tasks": [{ name, type, startDate, endDate, duration, progress, dependencies }] }.

DEVUELVE EXCLUSIVAMENTE JSON válido.`;

/**
 * Edits an existing schedule based on a natural-language instruction.
 * Returns the complete modified schedule.
 */
export async function editSchedule(
  existingTasks: ScheduleTask[],
  instruction: string,
  title: string,
  startDate: string,
): Promise<Schedule> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey });

  const existingJson = JSON.stringify(
    { title, startDate, tasks: existingTasks },
    null,
    0,
  );

  const userContent = `CRONOGRAMA ACTUAL:\n${existingJson}\n\nINSTRUCCIÓN DEL USUARIO:\n${instruction}\n\nAplica los cambios y devuelve el cronograma completo modificado.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: EDIT_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8000,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("El modelo no devolvió una respuesta");

  try {
    return JSON.parse(raw) as Schedule;
  } catch {
    throw new Error("El modelo devolvió JSON inválido. Intente de nuevo.");
  }
}
