import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

/**
 * Hybrid vector search for the knowledge base.
 *
 * Primary signal: cosine similarity over OpenAI embeddings (semantic match).
 * Secondary signal: keyword overlap re-ranking (exact code/section matches).
 *
 * Replaces the old single-document searchNsr with a multi-document, KB-aware
 * search that returns citations naming the source document.
 */

export type KBSearchResult = {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  text: string;
  similarity: number;
  score: number; // combined vector + keyword score
};

const EMBED_MODEL = "text-embedding-3-small";
const MATCH_COUNT = 12; // candidates from vector search before re-rank
const FINAL_COUNT = 8; // chunks sent to the LLM

/** Embeds a single query string for similarity search. */
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  return response.data[0].embedding as unknown as number[];
}

const STOP_WORDS = new Set([
  "a", "al", "como", "con", "cual", "de", "del", "e", "el", "en", "es", "esta",
  "este", "esto", "ha", "la", "las", "le", "lo", "los", "mas", "más", "o",
  "para", "por", "que", "qué", "se", "segun", "según", "si", "sin", "son",
  "su", "sus", "un", "una", "y", "the", "and", "for", "with", "what", "how",
]);

function extractKeywords(message: string): string[] {
  const words = message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const keywords = words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(keywords)];
}

function countOccurrences(text: string, keyword: string): number {
  if (!keyword) return 0;
  let count = 0;
  let idx = text.indexOf(keyword);
  while (idx !== -1) {
    count += 1;
    idx = text.indexOf(keyword, idx + keyword.length);
  }
  return count;
}

/**
 * Runs hybrid search across the given documents (or all readable docs if null).
 * Returns ranked KBSearchResult[] ready to be built into LLM context.
 */
export async function searchKB(
  supabase: SupabaseClient,
  question: string,
  documentIds: string[] | null,
): Promise<KBSearchResult[]> {
  // 1. Embed the question.
  const queryEmbedding = await embedQuery(question);

  // 2. Vector search via the match_document_chunks RPC (RLS-enforced).
  const { data: candidates, error } = await supabase.rpc(
    "match_document_chunks",
    {
      query_embedding: queryEmbedding,
      match_count: MATCH_COUNT,
      document_ids: documentIds,
    },
  );

  if (error) throw error;
  if (!candidates || candidates.length === 0) return [];

  // 3. Resolve document titles for citations.
  const docIds = [...new Set(candidates.map((c: { document_id: string }) => c.document_id))];
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title")
    .in("id", docIds);
  const titleMap = new Map<string, string>(
    (docs ?? []).map((d: { id: string; title: string }) => [d.id, d.title]),
  );

  // 4. Keyword re-rank: boost chunks with exact keyword overlap.
  const keywords = extractKeywords(question);

  const scored: KBSearchResult[] = candidates.map(
    (c: {
      document_id: string;
      page_number: number;
      chunk_index: number;
      text: string;
      similarity: number;
    }) => {
      const textLower = c.text.toLowerCase();
      let keywordScore = 0;
      let matched = 0;
      for (const kw of keywords) {
        const occ = countOccurrences(textLower, kw);
        if (occ > 0) {
          matched += 1;
          keywordScore += occ * 10;
        }
        const root = kw.length > 6 ? kw.slice(0, kw.length - 2) : kw;
        if (root.length >= 4 && textLower.includes(root)) {
          keywordScore += 2;
        }
      }
      if (matched === keywords.length && keywords.length > 1) {
        keywordScore += 50;
      }

      // Combined score: vector similarity (0..1) weighted heavily, keyword as a tiebreak/boost.
      const combined = c.similarity * 100 + keywordScore * 0.5;

      return {
        documentId: c.document_id,
        documentTitle: titleMap.get(c.document_id) ?? "Documento",
        pageNumber: c.page_number,
        text: c.text,
        similarity: c.similarity,
        score: combined,
      };
    },
  );

  // 5. Final ranking by combined score, take top FINAL_COUNT.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, FINAL_COUNT);
}

/** Builds the LLM context string from search results, with per-document citations. */
export function buildKBContext(results: KBSearchResult[]): string {
  const uniqueTitles = new Set(results.map((r) => r.documentTitle));
  const multiDoc = uniqueTitles.size > 1;

  return results
    .map((r) => {
      const citation = multiDoc
        ? `[${r.documentTitle}, Página ${r.pageNumber}]`
        : `[Página ${r.pageNumber}]`;
      return `${citation}\n${r.text}`;
    })
    .join("\n\n");
}

/** Builds the dynamic system-prompt fragment naming the active documents. */
export function buildKBPromptFragment(results: KBSearchResult[]): string {
  const uniqueTitles = [...new Set(results.map((r) => r.documentTitle))];
  if (uniqueTitles.length === 0) return "";
  const list = uniqueTitles.map((t) => t).join(", ");
  return `\nFuente(s) consultada(s): ${list}.`;
}
