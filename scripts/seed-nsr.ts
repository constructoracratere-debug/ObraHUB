/**
 * One-time seeding script: ingests the existing NSR-10 corpus into the KB
 * as a global document, so existing behavior is preserved but answers now
 * go through vector search.
 *
 * Usage:
 *   npx tsx scripts/seed-nsr.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENAI_API_KEY
 * in the environment. Costs ~$0.03 in embeddings for the full NSR-10.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { chunkPageText, storeChunks } from "../lib/ingest";

type NsrPage = { page: number; text: string };

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  // Resolve the ObraHub owner user id (the admin) to attach the doc to.
  const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: users } = await admin.auth.admin.listUsers();
  const owner = users?.users?.find(
    (u) => u.email?.toLowerCase() === "constructoracratere@gmail.com",
  );
  if (!owner) {
    console.error("Admin user not found. Sign up first.");
    process.exit(1);
  }

  // Load the existing NSR-10 pages JSON.
  const nsrPath = path.join(process.cwd(), "Documents", "NSR10_pages.json");
  console.log("Reading NSR-10 pages from", nsrPath);
  const raw = await fs.readFile(nsrPath, "utf-8");
  const pages = JSON.parse(raw) as NsrPage[];
  console.log(`Loaded ${pages.length} pages.`);

  // Create (or reuse) the global document row.
  const slug = "nsr-10";
  const title = "NSR-10";
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("scope", "global")
    .eq("slug", slug)
    .maybeSingle();

  let documentId: string;
  if (existing) {
    documentId = existing.id;
    console.log("Existing NSR-10 document found, replacing chunks...");
    await admin.from("document_chunks").delete().eq("document_id", documentId);
  } else {
    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        scope: "global",
        project_id: null,
        owner_id: owner.id,
        title,
        slug,
        source_filename: "NSR10.pdf",
        mime_type: "application/pdf",
        page_count: pages.length,
        status: "processing",
      })
      .select("id")
      .single();
    if (error || !doc) {
      console.error("Failed to create document:", error?.message);
      process.exit(1);
    }
    documentId = doc.id;
  }

  // Chunk all pages.
  const chunks = pages.flatMap((p) =>
    chunkPageText(documentId, p.page, p.text),
  );
  console.log(`Created ${chunks.length} chunks. Embedding and storing...`);

  await storeChunks(documentId, chunks);

  await admin
    .from("documents")
    .update({ status: "ready", page_count: pages.length })
    .eq("id", documentId);

  console.log(`Done. NSR-10 ingested as document ${documentId} (${chunks.length} chunks).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
