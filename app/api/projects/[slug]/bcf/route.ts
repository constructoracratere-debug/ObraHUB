import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = { params: Promise<{ slug: string }> };

function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

/**
 * POST /api/projects/[slug]/bcf — import a .bcf file (BCF 2.1 zip).
 * Each topic becomes an issue in the coordination panel (stored as RFI
 * kind='bcf' — same workflow table, zero new schema). Viewpoint guids are
 * kept in `reference` for the future 3D camera jump.
 */
export async function POST(request: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Máximo 25MB" }, { status: 400 });

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const markupFiles = Object.keys(zip.files).filter((n) => n.endsWith(".bcf"));
    if (markupFiles.length === 0) {
      return NextResponse.json({ error: "No es un BCF válido (sin archivos .bcf internos)" }, { status: 400 });
    }

    const { count } = await s.from("project_rfis").select("id", { count: "exact", head: true })
      .eq("project_id", p.id).eq("kind", "bcf");
    let seq = Number(count ?? 0);

    const rows: Array<Record<string, unknown>> = [];
    for (const name of markupFiles.slice(0, 200)) {
      const xml = await zip.files[name].async("text");
      const title = xmlTag(xml, "Title") || `Issue ${name}`;
      const desc = xmlTag(xml, "Description");
      const status = xmlTag(xml, "TopicStatus") || "abierta";
      const guid = xmlTag(xml, "Guid") || name;
      // Viewpoint link (si existe VisualizationInfo referenciado)
      const vpMatch = xml.match(/Viewpoint[^>]*Guid="([^"]+)"/i);
      const viewpoint = vpMatch ? vpMatch[1] : "";
      seq++;
      rows.push({
        project_id: p.id, owner_id: user.id,
        code: `BCF-${String(seq).padStart(3, "0")}`,
        title: title.slice(0, 180),
        body: desc.slice(0, 2000),
        reference: viewpoint || guid,
        assignee: "", due_date: null,
        kind: "bcf",
        status: "abierta",
        response: "",
      });
    }
    const { error } = await s.from("project_rfis").insert(rows);
    if (error) throw error;
    return NextResponse.json({ ok: true, imported: rows.length }, { status: 201 });
  } catch (e) {
    console.error("POST bcf:", e);
    return NextResponse.json({ error: "No se pudo importar el BCF" }, { status: 500 });
  }
}
