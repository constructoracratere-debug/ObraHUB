import { createClient as createServiceClient } from "@supabase/supabase-js";
import OpenAI from "openai";

/**
 * Ingestion pipeline: PDF → pages → chunks → embeddings → Supabase.
 *
 * Reused for both interactive uploads (project-scoped PDFs) and the one-time
 * NSR-10 seeding script. Runs server-side only (uses the service role key).
 */

export type ParsedPage = {
  page: number; // 1-based
  text: string;
};

export type Chunk = {
  documentId: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 100;

/** Splits a single page's text into overlapping chunks (~CHUNK_SIZE chars). */
export function chunkPageText(
  documentId: string,
  pageNumber: number,
  text: string,
): Chunk[] {
  const clean = text.trim();
  if (!clean) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    const slice = clean.slice(start, end);
    if (slice.trim().length > 0) {
      chunks.push({ documentId, pageNumber, chunkIndex, text: slice });
      chunkIndex += 1;
    }
    if (end >= clean.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/** Embeds an array of texts via OpenAI, batching to respect request limits. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey });
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const { data, error } = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
    });
    if (error) throw error;
    // OpenAI returns embeddings in input order.
    for (const item of data) {
      results.push(item.embedding as unknown as number[]);
    }
  }

  return results;
}

/**
 * Inserts embedded chunks for a document into Supabase.
 * Returns the number of chunks inserted.
 */
export async function storeChunks(
  documentId: string,
  chunks: Chunk[],
): Promise<number> {
  if (chunks.length === 0) return 0;

  // Embed all chunk texts in batches.
  const embeddings = await embedTexts(chunks.map((c) => c.text));

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    page_number: c.pageNumber,
    chunk_index: c.chunkIndex,
    text: c.text,
    embedding: embeddings[i],
  }));

  // Insert in batches of 200 to stay within payload limits.
  const INSERT_BATCH = 200;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw error;
  }

  return rows.length;
}
