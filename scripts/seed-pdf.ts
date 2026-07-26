/**
 * Ingests any PDF into the KB as a global document.
 *
 * Usage:
 *   npx tsx scripts/seed-pdf.ts "<path-to-pdf>" "<title>" "<slug>"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENAI_API_KEY.
 * Idempotent: re-running with the same slug replaces that document's chunks.
 */
import fs from "node:fs/promises";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { chunkPageText, storeChunks } from "../lib/ingest";

async function main() {
  const [pdfPath, title, slugArg, countryArg] = process.argv.slice(2);
  if (!pdfPath || !title) {
    console.error("Usage: npx tsx scripts/seed-pdf.ts <pdfPath> <title> [slug] [country]");
    process.exit(1);
  }
  const country = countryArg === "mexico" ? "mexico" : "colombia";

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

  const slug = (slugArg || title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "documento";

  const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Resolve owner (admin user).
  const { data: users } = await admin.auth.admin.listUsers();
  const owner = users?.users?.find(
    (u) => u.email?.toLowerCase() === "constructoracratere@gmail.com",
  );
  if (!owner) {
    console.error("Admin user not found.");
    process.exit(1);
  }

  // Parse the PDF (pdf-parse v2 API: PDFParse class with getText()).
  console.log(`Reading PDF: ${pdfPath}`);
  const buffer = await fs.readFile(pdfPath);
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const parsed = await parser.getText();
  const totalPages = parsed.total ?? parsed.pages?.length ?? 0;
  console.log(`Parsed ${totalPages} pages, ${parsed.text.length} chars.`);

  // Create or reuse the document row.
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("scope", "global")
    .eq("country", country)
    .eq("slug", slug)
    .maybeSingle();

  let documentId: string;
  if (existing) {
    documentId = existing.id;
    console.log(`Existing document found (${slug} / ${country}), replacing chunks...`);
    await admin.from("document_chunks").delete().eq("document_id", documentId);
  } else {
    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        scope: "global",
        country,
        project_id: null,
        owner_id: owner.id,
        title,
        slug,
        source_filename: pdfPath.split(/[\\/]/).pop() ?? title,
        mime_type: "application/pdf",
        page_count: totalPages,
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

  // Split on form-feed (pdf-parse page separator).
  const pageTexts = parsed.text.split("\f").filter((t) => t.trim().length > 0);
  const pages = pageTexts.length > 0
    ? pageTexts.map((t, i) => ({ page: i + 1, text: t }))
    : [{ page: 1, text: parsed.text }];

  const chunks = pages.flatMap((p) => chunkPageText(documentId, p.page, p.text));
  console.log(`Created ${chunks.length} chunks. Embedding + storing (this may take a minute)...`);

  await storeChunks(documentId, chunks);

  await admin
    .from("documents")
    .update({ status: "ready", page_count: totalPages || pages.length })
    .eq("id", documentId);

  console.log(`✓ Done. "${title}" ingested as ${slug} (document ${documentId}, ${chunks.length} chunks).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
