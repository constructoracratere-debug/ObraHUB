import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ACCEPTED_EXTENSIONS,
  FILE_BUCKET,
  MAX_FILE_BYTES,
  deleteFileRecord,
  listFiles,
} from "@/lib/files";

type RouteContext = {
  params: Promise<{ folderId: string }>;
};

function hasAcceptedExt(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** GET /api/folders/[folderId]/files — list files in a folder. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { folderId } = await context.params;
    const files = await listFiles(supabase, folderId);
    return NextResponse.json({ files });
  } catch (error) {
    console.error("GET folder files error:", error);
    return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
  }
}

/** POST /api/folders/[folderId]/files — upload files (multipart). */
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

    const form = await request.formData();
    const entries = form.getAll("files").filter((e): e is File => e instanceof File);
    if (entries.length === 0) {
      return NextResponse.json({ error: "files is required" }, { status: 400 });
    }

    const uploaded: { id: string; name: string }[] = [];

    for (const file of entries) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `El archivo "${file.name}" excede el límite de 50 MB` },
          { status: 413 },
        );
      }
      if (!hasAcceptedExt(file.name)) {
        return NextResponse.json(
          { error: `Tipo de archivo no soportado: "${file.name}"` },
          { status: 400 },
        );
      }

      const storagePath = `${user.id}/${folder.project_id}/${folderId}/${Date.now()}-${file.name}`;
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase
        .storage
        .from(FILE_BUCKET)
        .upload(storagePath, arrayBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError.message);
        return NextResponse.json({ error: `No se pudo subir "${file.name}"` }, { status: 500 });
      }

      const { data: row, error: insertError } = await supabase
        .from("files")
        .insert({
          folder_id: folderId,
          project_id: folder.project_id,
          owner_id: user.id,
          name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id, name")
        .single();

      if (insertError || !row) {
        await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
        console.error("File metadata insert error:", insertError?.message);
        return NextResponse.json({ error: `No se pudo registrar "${file.name}"` }, { status: 500 });
      }

      uploaded.push({ id: row.id, name: row.name });
    }

    return NextResponse.json({ uploaded }, { status: 201 });
  } catch (error) {
    console.error("POST folder files error:", error);
    return NextResponse.json({ error: "Failed to upload files" }, { status: 500 });
  }
}

/** DELETE /api/folders/[folderId]/files?id=<fileId> — delete a file. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { folderId } = await context.params;
    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const record = await deleteFileRecord(supabase, fileId);
    if (!record) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await supabase.storage.from(FILE_BUCKET).remove([record.storagePath]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE folder files error:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
