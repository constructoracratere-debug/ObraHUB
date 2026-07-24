import { findFolderId, isValidProjectSlug } from "@/lib/projects";
import { isValidFolderSlug } from "@/lib/folders";
import { addMemoryToFolder, listMemoriesByFolderId } from "@/lib/memories";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ slug: string; folderSlug: string }>;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** GET /api/projects/[slug]/folders/[folderSlug]/memories — folder memories. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug, folderSlug } = await context.params;
    if (!isValidProjectSlug(slug) || !isValidFolderSlug(folderSlug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const ctx = await findFolderId(supabase, slug, folderSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const memories = await listMemoriesByFolderId(supabase, ctx.folderId);
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("GET folder memories error:", error);
    return NextResponse.json({ error: "Failed to load memories" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/folders/[folderSlug]/memories — add a memory. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug, folderSlug } = await context.params;
    if (!isValidProjectSlug(slug) || !isValidFolderSlug(folderSlug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    let body: { content?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const ctx = await findFolderId(supabase, slug, folderSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const memory = await addMemoryToFolder(supabase, ctx.folderId, body.content.trim());
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error("POST folder memories error:", error);
    return NextResponse.json({ error: "Failed to add memory" }, { status: 500 });
  }
}
