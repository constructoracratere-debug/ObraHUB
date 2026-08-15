import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { createFolder, listFolders } from "@/lib/folders";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * POST /api/projects/[slug]/folders/ensure — body { path: "A/B/C" }
 *
 * Idempotently creates every missing folder along the path and returns the
 * leaf folder's id. Used by the ZIP project importer: an already-worked
 * project's folder tree is recreated without conflicts (existing folders
 * with the same name are reused, never duplicated).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    let body: { path?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const raw = typeof body.path === "string" ? body.path : "";
    // Normalize separators and strip junk segments (zip artifacts).
    const segments = raw
      .split(/[\\/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== "." && s !== ".." && !s.startsWith("__MACOSX") && !/^\./.test(s));
    if (segments.length === 0) {
      // Root-level file → reuse an existing root or create "Importados".
      const roots = await listFolders(supabase, slug, null);
      const existing = (roots as Array<{ id: string; name: string }>).find((f) => f.name === "Importados");
      if (existing) return NextResponse.json({ folderId: existing.id });
      const created = await createFolder(supabase, slug, "Importados", null);
      return NextResponse.json({ folderId: (created as { id: string }).id }, { status: 201 });
    }

    let parentId: string | null = null;
    let current: { id: string } | null = null;
    for (const segment of segments.slice(0, 12)) {
      const children = await listFolders(supabase, slug, parentId);
      const found = (children as Array<{ id: string; name: string }>).find(
        (f) => f.name.toLowerCase() === segment.toLowerCase(),
      );
      if (found) {
        current = { id: found.id };
      } else {
        current = (await createFolder(supabase, slug, segment, parentId)) as { id: string };
      }
      parentId = current.id;
    }
    return NextResponse.json({ folderId: current?.id ?? null });
  } catch (error) {
    console.error("POST folders/ensure error:", error);
    return NextResponse.json({ error: "Failed to ensure folder path" }, { status: 500 });
  }
}
