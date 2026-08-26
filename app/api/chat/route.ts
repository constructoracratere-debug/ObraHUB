import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NO_ANSWER_MESSAGE = "No se encontró una respuesta clara en los documentos consultados.";

/**
 * 🧠 Jerga de obra colombiana: expande consultas de 1-2 palabras a frases
 * técnicas completas para que el buscador semántico encuentre las páginas.
 * Claves SIN tildes/ñ (normalizadas).
 */
const JARGON: Record<string, string> = {
  curador: "curado del concreto protección hidráulica fraguado",
  curado: "curado del concreto protección hidráulica",
  cura: "curado del concreto protección",
  curando: "curado del concreto",
  panete: "pañete repello mortero acabado muro",
  repello: "repello pañete mortero acabado",
  cemento: "cemento dosificación concreto mortero arena",
  arena: "agregados arena gravilla concreto",
  varilla: "varilla acero de refuerzo diámetro fy4200",
  ferraje: "refuerzo acero varilla estructura",
  bahareque: "bahareque encementado mampostería madera título E.7",
  nsr: "NSR-10 sismorresistente requisitos reglamento colombiano",
  retie: "RETIE reglamento instalaciones eléctricas",
  retiq: "RETIQ reglamento transporte gas",
  ras: "RAS reglamento técnico agua potable saneamiento",
  zapata: "zapata aislada cimentación esfuerzo admisible",
  estribo: "estribo refuerzo transversal columna sismo",
  traba: "traba aparejo mampostería ladrillo",
  junta: "junta construcción dilatación concreto",
  losa: "losa entrepiso concreto espesor deflectación",
  mamposteria: "mampostería confinada reforzada NSR-10",
  formaleta: "formaleta encofrado concreto desencofrado",
  dintel: "dintel viga carga muro",
  cimentacion: "cimentación superficial profunda suelo",
  impermeabilizacion: "impermeabilización humedad muros losa",
  andamio: "andamio seguridad trabajo en altura",
  recubrimiento: "recubrimiento acero concreto protección",
  flexion: "flexión diseño viga momento",
  columna: "columna concreto reforzado dimensionamiento",
  viga: "viga concreto reforzado diseño",
  muro: "muro mampostería estructural",
  gas: "instalación gas domiciliario RETIQ",
  electrico: "instalación eléctrica circuito tomacorriente",
  hidraulico: "instalación hidráulica agua potable tubería",
  sanitario: "instalación sanitaria alcantarillado PVC",
  licencia: "licencia construcción urbanismo curaduría",
  curaduria: "curaduría urbana licencia",
  sismo: "diseño sísmico sismo-resistente NSR-10",
};

function normalizeWord(w: string): string {
  return w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Expande la pregunta con los términos técnicos de jerga detectados. */
function expandQuestion(q: string): { expanded: string; interpreted: string[] } {
  const words = q.toLowerCase().replace(/[¿?¡!.,;:()]/g, " ").split(/\s+/).filter(Boolean);
  const extras: string[] = [];
  const interpreted: string[] = [];
  for (const w of words) {
    const norm = normalizeWord(w);
    const hit = JARGON[norm];
    if (hit && !extras.includes(hit)) {
      extras.push(hit);
      interpreted.push(norm);
    }
  }
  return { expanded: extras.length ? `${q} ${extras.join(" ")}` : q, interpreted };
}

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "como",
  "con",
  "cual",
  "de",
  "del",
  "e",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "esto",
  "ha",
  "la",
  "las",
  "le",
  "lo",
  "los",
  "mas",
  "más",
  "o",
  "para",
  "por",
  "que",
  "qué",
  "se",
  "segun",
  "según",
  "si",
  "sin",
  "son",
  "su",
  "sus",
  "un",
  "una",
  "y",
]);
const SEARCH_NOISE_WORDS = new Set([
  "capitulo",
  "capítulo",
  "pagina",
  "página",
  "paginas",
  "páginas",
  "dice",
  "habla",
  "sobre",
  "cual",
  "cuál",
  "donde",
  "dónde",
]);
type NsrPage = {
  page: number;
  text: string;
};

type SearchResult = {
  page: number;
  text: string;
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function extractKeywords(message: string): string[] {
  const words = message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const keywords = words.filter(
    (word) => word.length >= 3 && !STOP_WORDS.has(word),
  );

  return [...new Set(keywords)];
}

function searchNsr(
  pages: NsrPage[],
  keywords: string[],
): SearchResult[] {

  const scored: Array<{
    page: number;
    text: string;
    score: number;
  }> = [];

  for (const page of pages) {

    const text = page.text;

    if (!text) continue;

    const textLower = text.toLowerCase();

    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of keywords) {

      const occurrences =
        countOccurrences(textLower, keyword);

      if (occurrences > 0) {
        matchedKeywords++;
        score += occurrences * 10;
      }

      const root =
        keyword.length > 6
          ? keyword.slice(0, keyword.length - 2)
          : keyword;

      if (
        root.length >= 4 &&
        textLower.includes(root)
      ) {
        score += 2;
      }
    }

    if (
      matchedKeywords === keywords.length &&
      keywords.length > 1
    ) {
      score += 50;
    }

    if (score > 0) {

      const positions = keywords
        .map((kw) => textLower.indexOf(kw))
        .filter((p) => p >= 0);

      const firstHit =
        positions.length > 0
          ? Math.min(...positions)
          : 0;

      const start =
        Math.max(0, firstHit - 700);

      const end =
        Math.min(text.length, start + 2200);

      scored.push({
        page: page.page,
        score,
        text: text.substring(start, end),
      });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.page - b.page,
  );

  return scored
    .slice(0, 10)
    .map((item) => ({
      page: item.page,
      text: item.text,
    }));
}

function countOccurrences(text: string, keyword: string): number {
  if (!keyword) {
    return 0;
  }

  let count = 0;
  let index = text.indexOf(keyword);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(keyword, index + keyword.length);
  }

  return count;
}

function buildContext(results: SearchResult[]): string {
  return results
    .map((result) => `[Página ${result.page}]\n${result.text}`)
    .join("\n\n");
}

function buildPrompt(question: string, context: string): string {
  return `CONTEXT:
${context}

QUESTION:
${question}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let body: { message?: unknown; projectSlug?: unknown; folderSlug?: unknown; documentIds?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { message } = body;
    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const question = message.trim();

    // Resolve the document scope to search. Defaults to all global documents.
    const documentIds: string[] | null = Array.isArray(body.documentIds)
      ? (body.documentIds as string[]).filter((d) => typeof d === "string" && d.length > 0)
      : null;
    const searchDocumentIds = documentIds && documentIds.length > 0 ? documentIds : null;

    // Vector search across the selected documents (RLS-enforced).
    // Consultas cortas de jerga se expanden para que el buscador encuentre páginas.
    const { expanded, interpreted } = expandQuestion(question);
    const { searchKB, buildKBContext, buildKBPromptFragment } = await import("@/lib/search");
    let results;
    try {
      results = await searchKB(supabase, expanded, searchDocumentIds);
    } catch (searchErr) {
      console.error("KB search error:", searchErr);
      return NextResponse.json({ error: "Error en la búsqueda de documentos" }, { status: 500 });
    }

    const contextPages = results.map((r) => r.pageNumber);

    if (results.length === 0) {
      // Sin resultados en la biblioteca → experto normativo con marco vigente
      // (mantiene el flujo de conversación en vez de un "no encontré" seco).
      try {
        const { data: norms } = await supabase
          .from("normative_updates")
          .select("norm_type, number, year, title, summary")
          .eq("status", "vigente")
          .order("published_at", { ascending: false })
          .limit(8);
        const normsBlock = (norms ?? [])
          .map((n: Record<string, string>) => `- ${String(n.norm_type).toUpperCase()} ${n.number} de ${n.year}: ${n.title.slice(0, 110)}`)
          .join("\n");
        const openai = getOpenAIClient();
        const expert = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "Eres un interventor maestro colombiano (35 años de obra). La pregunta NO se encontró en la biblioteca PDF del usuario, así que responde con tu conocimiento técnico de la construcción colombiana (NSR-10, RETIE, RAS, SST). " +
                "NUNCA inventes números de página ni artículos exactos si no estás seguro — referencia por título (ej. 'NSR-10, Título C'). " +
                (normsBlock ? `Normativa vigente registrada en ObraHub:\n${normsBlock}\n` : "") +
                "Responde en español técnico, máximo 250 palabras. Si la palabra es jerga (curador→curado de concreto, panete→repello), interpreta y responde de una. Termina sugiriendo: 'Para citas exactas por página, sube el PDF de la norma a tu Biblioteca.'",
            },
            { role: "user", content: question },
          ],
        });
        const answer = expert.choices[0]?.message?.content?.trim();
        if (answer) {
          return NextResponse.json({ response: answer, pages: [], outsideLibrary: true });
        }
      } catch { /* fallback silencioso al mensaje por defecto */ }
      return NextResponse.json({ response: NO_ANSWER_MESSAGE, pages: [] });
    }

    const context = buildKBContext(results);
    const kbFragment = buildKBPromptFragment(results);

    // Load memory for the active context and inject into the prompt.
    // Prefer folder memory when a folder is active; fall back to project memory.
    let memoryPrompt = "";
    const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug : "";
    const folderSlug = typeof body.folderSlug === "string" ? body.folderSlug : "";

    if (projectSlug) {
      const { data: projectRow } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", projectSlug)
        .maybeSingle();

      if (projectRow) {
        const { buildMemoryPrompt } = await import("@/lib/memories");

        if (folderSlug) {
          // Folder-scoped memory: resolve the folder within this project.
          const { data: folderRow } = await supabase
            .from("folders")
            .select("id")
            .eq("project_id", projectRow.id)
            .eq("slug", folderSlug)
            .maybeSingle();
          if (folderRow) {
            const { listMemoriesByFolderId } = await import("@/lib/memories");
            const memories = await listMemoriesByFolderId(supabase, folderRow.id);
            memoryPrompt = buildMemoryPrompt(memories);
          }
        } else {
          // Project-level memory (no folder).
          const { listMemories } = await import("@/lib/memories");
          const memories = await listMemories(supabase, projectRow.id);
          memoryPrompt = buildMemoryPrompt(memories);
        }
      }
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres ObraHub, un asistente técnico para la construcción y normativa en Colombia. " +
            "Responde usando el CONTEXT proporcionado. " +
            "Si la pregunta usa jerga corta de obra (curador, panete, traba), interpreta el término técnico correcto y responde normal. " +
            "Cita siempre los números de página (por ejemplo, 'Página 42') y, cuando haya varios documentos, nombra la fuente. " +
            `Si el CONTEXT no contiene información suficiente para responder, responde exactamente: ${NO_ANSWER_MESSAGE}` +
            kbFragment +
            memoryPrompt,
        },
        {
          role: "user",
          content: buildPrompt(question, context),
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return NextResponse.json(
        { error: "No response from model" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      response,
      pages: contextPages,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured") {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 },
      );
    }

    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API error:", error.message);
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 },
      );
    }

    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
