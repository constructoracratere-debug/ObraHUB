import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { chunkPageText, storeChunks } from "@/lib/ingest";

/**
 * POST /api/documents/upload
 *
 * Accepts a PDF (multipart/form-data) and ingests it into the KB.
 *  - Global scope: admin only.
 *  - Project scope: any authenticated user, attached to one of their projects.
 *
 * The pipeline: parse PDF → per-page text → overlapping chunks → embed → store.
 * The document row is created with status='processing' up front, then updated.
 */

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );
}

function slugify(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "documento";
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

    const form = await request.formData();
    const file = form.get("file");
    const scope = (form.get("scope") as string) ?? "project";
    const projectSlug = (form.get("projectSlug") as string) | null;
    const title = (form.get("title") as string) || (typeof file === "object" && "name" in file ? (file as File).name.replace(/\.pdf$/i, "") : "Documento");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (scope !== "global" && scope !== "project") {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "El archivo excede el límite de 25 MB" }, { status: 413 });
    }

    // Resolve project for project-scoped uploads.
    let projectId: string | null = null;
    if (scope === "project") {
      if (!projectSlug) {
        return NextResponse.json({ error: "projectSlug is required for project scope" }, { status: 400 });
      }
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", projectSlug)
        .maybeSingle();
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      projectId = project.id;
    }

    // Permission: global requires admin.
    if (scope === "global") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.is_admin) {
        return NextResponse.json({ error: "Solo administradores pueden subir a la biblioteca global" }, { status: 403 });
      }
    }

    // Parse the PDF to text (pdf-parse v2 API: PDFParse class with getText()).
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsedText: string;
    let parsedPages: number;
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const parsed = await parser.getText();
      parsedText = parsed.text;
      parsedPages = parsed.total ?? parsed.pages?.length ?? 0;
    } catch (e) {
      console.error("PDF parse error:", e);
      return NextResponse.json({ error: "No se pudo leer el PDF (¿está dañado o escaneado?)" }, { status: 422 });
    }

    const baseSlug = slugify(title);
    const admin = adminClient();

    // Create the document row with status='processing'.
    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        scope,
        project_id: projectId,
        owner_id: user.id,
        title,
        slug: baseSlug,
        source_filename: file.name,
        mime_type: file.type || "application/pdf",
        page_count: parsedPages,
        status: "processing",
      })
      .select("id")
      .single();

    if (docError || !doc) {
      // Slug collision? Append a suffix and retry once.
      const retrySlug = `${baseSlug}-${Math.floor(Math.random() * 9000) + 1000}`;
      const { data: retryDoc, error: retryError } = await admin
        .from("documents")
        .insert({
          scope,
          project_id: projectId,
          owner_id: user.id,
          title,
          slug: retrySlug,
          source_filename: file.name,
          mime_type: file.type || "application/pdf",
          page_count: parsed.numpages ?? 0,
          status: "processing",
        })
        .select("id")
        .single();
      if (retryError || !retryDoc) {
        console.error("Document insert error:", retryError?.message);
        return NextResponse.json({ error: "No se pudo crear el documento" }, { status: 500 });
      }
      await ingest(admin, retryDoc.id, parsedText, parsedPages);
      return NextResponse.json({ documentId: retryDoc.id, status: "ready" }, { status: 201 });
    }

    await ingest(admin, doc.id, parsedText, parsedPages);
    return NextResponse.json({ documentId: doc.id, status: "ready" }, { status: 201 });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Chunks + embeds the document text, then marks the document ready. */
async function ingest(
  admin: ReturnType<typeof adminClient>,
  documentId: string,
  fullText: string,
  pageCount: number,
) {
  try {
    // pdf-parse returns full concatenated text; we approximate pages by splitting
    // on form-feed (\f) which it uses as a page separator. Fall back to one page.
    const pageTexts = fullText.split("\f").map((t) => t).filter((t) => t.trim().length > 0);
    const pages = pageTexts.length > 0
      ? pageTexts.map((t, i) => ({ page: i + 1, text: t }))
      : [{ page: 1, text: fullText }];

    const chunks = pages.flatMap((p) => chunkPageText(documentId, p.page, p.text));
    await storeChunks(documentId, chunks);

    await admin
      .from("documents")
      .update({ status: "ready", page_count: pageCount || pages.length })
      .eq("id", documentId);
  } catch (e) {
    console.error("Ingestion failed for document", documentId, e);
    await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
    throw e;
  }
}
