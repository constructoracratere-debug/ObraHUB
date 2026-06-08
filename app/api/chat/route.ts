import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const NSR_PAGES_PATH = path.join(process.cwd(), "Documents", "NSR10_pages.json");
const NO_ANSWER_MESSAGE = "No se encontró una respuesta clara en la NSR-10.";

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
let pagesCache: NsrPage[] | null = null;

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

async function loadNsrPages(): Promise<NsrPage[]> {
  if (pagesCache) {
    return pagesCache;
  }

  const raw = await fs.readFile(NSR_PAGES_PATH, "utf-8");
  pagesCache = JSON.parse(raw) as NsrPage[];
  return pagesCache;
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
    let body: { message?: unknown };
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
    const keywords = extractKeywords(question);
    const pages = await loadNsrPages();
    
    const results = searchNsr(pages, keywords);
    
    const contextPages = results.map((result) => result.page);

    if (results.length === 0) {
      return NextResponse.json({ response: NO_ANSWER_MESSAGE, pages: [] });
    }

    const context = buildContext(results);

console.log("CONTEXTO ENVIADO:");
console.log(context.substring(0, 1000));
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres ObraHub, un asistente técnico para la normativa colombiana NSR-10. " +
            "Responde ÚNICAMENTE usando el CONTEXT proporcionado. " +
            "Cita siempre los números de página (por ejemplo, 'Página 42'). " +
            `Si el CONTEXT no contiene información suficiente para responder, responde exactamente: ${NO_ANSWER_MESSAGE}`,
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
