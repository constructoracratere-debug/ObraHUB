import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_FILE_BYTES,
  MAX_IFC_BYTES,
  MAX_REVIT_BYTES,
  isIfcFile,
  isRevitFile,
} from "@/lib/files";

type RouteContext = {
  params: Promise<{ folderId: string }>;
};

/**
 * GET /api/folders/[folderId]/files/prepare?name=<filename>
 *
 * Returns an upload "ticket": the exact storagePath the browser must use for
 * a TUS resumable upload (user-namespace + project + folder + timestamped
 * filename). The client then uploads the bytes straight to Supabase and
 * registers the metadata row via POST on this same route.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { folderId } = await context.params;
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data: folder } = await supabase
      .from("folders")
      .select("id, project_id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const storagePath = `${user.id}/${folder.project_id}/${folderId}/${Date.now()}-${name}`;
    return NextResponse.json({ storagePath });
  } catch (error) {
    console.error("GET prepare upload error:", error);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}

/**
 * POST /api/folders/[folderId]/files/register
 *
 * Registers the metadata row for a file whose binary was already uploaded
 * directly from the browser to Supabase Storage via the TUS resumable
 * endpoint (see lib/storage-upload.ts). This route only receives a small
 * JSON payload — never the file bytes — so Vercel's ~4.5MB body limit is
 * never an issue even for multi-hundred-MB Revit models.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { folderId } = await context.params;

    // Verify the folder exists + is owned by the user (RLS hides others).
    const { data: folder } = await supabase
      .from("folders")
      .select("id, project_id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, storagePath, mimeType, sizeBytes } = body ?? {};
    if (
      typeof name !== "string" ||
      typeof storagePath !== "string" ||
      typeof sizeBytes !== "number"
    ) {
      return NextResponse.json(
        { error: "name, storagePath y sizeBytes son obligatorios" },
        { status: 400 },
      );
    }

    // The storage path must live inside this user's namespace — prevents
    // registering rows that point at someone else's objects.
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "storagePath inválido" }, { status: 403 });
    }

    // Same size limits as the regular upload route.
    const limit = isRevitFile(name)
      ? MAX_REVIT_BYTES
      : isIfcFile(name)
        ? MAX_IFC_BYTES
        : MAX_FILE_BYTES;
    if (sizeBytes > limit) {
      const limitMb = Math.round(limit / (1024 * 1024));
      return NextResponse.json(
        { error: `El archivo "${name}" excede el límite de ${limitMb} MB` },
        { status: 413 },
      );
    }

    // Confirm the object actually exists in Storage before indexing it.
    const { data: stat, error: statError } = await supabase.storage
      .from("project-files")
      .list(storagePath.slice(0, storagePath.lastIndexOf("/")), {
        limit: 1000,
        search: storagePath.slice(storagePath.lastIndexOf("/") + 1),
      });
    if (statError || !stat || stat.length === 0) {
      return NextResponse.json(
        { error: "El archivo no se encontró en el almacenamiento — reintentá la subida" },
        { status: 400 },
      );
    }

    const { data: row, error: insertError } = await supabase
      .from("files")
      .insert({
        folder_id: folderId,
        project_id: folder.project_id,
        owner_id: user.id,
        name,
        storage_path: storagePath,
        mime_type: typeof mimeType === "string" && mimeType ? mimeType : null,
        size_bytes: sizeBytes,
      })
      .select("id, name")
      .single();

    if (insertError || !row) {
      console.error("Register file insert error:", insertError?.message);
      return NextResponse.json(
        { error: `No se pudo registrar "${name}"` },
        { status: 500 },
      );
    }

    return NextResponse.json({ uploaded: [{ id: row.id, name: row.name }] }, { status: 201 });
  } catch (error) {
    console.error("POST register file error:", error);
    return NextResponse.json({ error: "Failed to register file" }, { status: 500 });
  }
}
