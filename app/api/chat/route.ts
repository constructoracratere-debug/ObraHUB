import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Vercel Hobby corta la función a 10s por defecto; gpt-4.1-mini con RAG +
// historial tarda 7-9s y en el 2º turno (más contexto) superaba el límite →
// 504 → el usuario no podía seguir preguntando. 60s es el máximo en Hobby.
export const maxDuration = 60;

import { llmComplete } from "@/lib/ai/router";

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

    let body: { message?: unknown; projectSlug?: unknown; folderSlug?: unknown; documentIds?: unknown; history?: unknown };
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
    // En seguimiento, se antepone el tema de la conversación a la consulta de
    // búsqueda: "y qué pasa si no cumple" debe recuperar páginas del TEMA
    // (concreto), no de cualquier "resistencia" (p.ej. puesta a tierra RETIE).
    const priorUserTurns = (Array.isArray(body.history)
      ? (body.history as Array<{ role?: unknown; content?: unknown }>)
      : []
    ).filter((t) => t.role === "user" && typeof t.content === "string" && t.content.trim());
    const topicHint =
      priorUserTurns.length > 0 ? String(priorUserTurns[0].content).slice(0, 120) : "";
    const { expanded, interpreted } = expandQuestion(
      topicHint ? `${topicHint} — ${question}` : question,
    );
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
      // Sin resultados en la biblioteca → respuesta INSTANTÁNEA con el marco
      // normativo registrado (sin segunda llamada a LLM: evita timeouts).
      try {
        const { data: norms } = await supabase
          .from("normative_updates")
          .select("norm_type, number, year, title")
          .eq("status", "vigente")
          .order("published_at", { ascending: false })
          .limit(6);
        const list = (norms ?? [])
          .map((n: Record<string, string>) => `• ${String(n.norm_type).toUpperCase()} ${n.number} de ${n.year}: ${n.title.slice(0, 90)}`)
          .join("\n");
        const nl = "\n";
        return NextResponse.json({
          response:
            "No encontré esa consulta en los PDF de tu Biblioteca, pero esto es lo que responde el marco normativo registrado en ObraHub:" +
            nl + nl +
            (list || "• NSR-10 (Decreto 926 de 2010) y sus modificaciones; RETIE; RAS 2017; SG-SST.") +
            nl + nl +
            "💡 Para citas exactas por página, sube el PDF de la norma a tu Biblioteca (Biblioteca → Subir documento) y vuelve a preguntar." +
            nl +
            "💡 O pregúntale al 👁️ Interventor IA, que responde con conocimiento técnico del sector.",
          pages: [],
          outsideLibrary: true,
        });
      } catch { /* sin conexión a BD */ }
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

    // Historial de conversación (últimos 6 turnos) para poder indagar en seguimiento.
    const historyTurns: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body.history)
      ? (body.history as Array<{ role?: unknown; content?: unknown }>)
          .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
          .slice(-6)
          .map((t) => ({ role: t.role === "assistant" ? "assistant" as const : "user" as const, content: String(t.content).slice(0, 700) }))
      : [];
    const isFollowUp = historyTurns.length > 0;
    // 🧠 Enrutador multi-LLM: cadena gratis (Gemini → Kimi → Qwen → Grok →
    // DeepSeek) con GPT-4.1-mini pagado de respaldo.
    const llm = await llmComplete("chat", {
      messages: [
        {
          role: "system",
          content:
            "Eres ObraHub, un asistente técnico para la construcción y normativa en Colombia. " +
            (isFollowUp
              ? "Es una CONVERSACIÓN: usa el historial previo y responde en contexto, sin repetir citas ya dadas salvo que aporten. "
              : "") +
            "Responde usando el CONTEXT proporcionado. " +
            "Si la pregunta usa jerga corta de obra (curador, panete, traba), interpreta el término técnico correcto y responde normal. " +
            "Conocimiento base siempre válido: la Ley 400 de 1997 exige SUPERVISIÓN TÉCNICA OBLIGATORIA en obras que superen los 2000 m² de área construida (menores a 2000 m² tienen esquemas simplificados, no exención total de responsabilidad). " +
            "Cita siempre los números de página (por ejemplo, 'Página 42') y, cuando haya varios documentos, nombra la fuente. " +
            `Si el CONTEXT no contiene información suficiente para responder, responde exactamente: ${NO_ANSWER_MESSAGE}` +
            kbFragment +
            memoryPrompt,
        },
        ...historyTurns,
        {
          role: "user",
          content: buildPrompt(question, context),
        },
      ],
    });

    const response = llm.content;
    if (!response) {
      return NextResponse.json(
        { error: "No response from model" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      response,
      pages: contextPages,
      provider: llm.providerLabel,
      latencyMs: llm.latencyMs,
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
