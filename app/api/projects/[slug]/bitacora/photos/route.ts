import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";

/**
 * POST /api/projects/[slug]/bitacora/photos — multipart evidence photos for a
 * bitácora day. Stored under <userId>/bitacora/<date>/ in project-files;
 * returns the storage paths to attach when saving the entry.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const form = await request.formData();
    const date = typeof form.get("date") === "string" ? String(form.get("date")).replace(/[^0-9-]/g, "") : "";
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "files requeridas" }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: "Máximo 10 fotos por tanda" }, { status: 400 });

    const paths: string[] = [];
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: `${file.name} supera 8 MB` }, { status: 400 });
      }
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/bitacora/${date || "sd"}/${Date.now()}-${paths.length}.${ext}`;
      const { error } = await supabase.storage
        .from("project-files")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) throw error;
      paths.push(path);
    }
    return NextResponse.json({ paths }, { status: 201 });
  } catch (error) {
    console.error("POST bitacora photos error:", error);
    return NextResponse.json({ error: "No se pudieron subir las fotos" }, { status: 500 });
  }
}
