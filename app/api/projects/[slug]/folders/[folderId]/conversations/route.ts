import {
  appendConversationMessageInFolder,
  findFolderId,
  getConversationsInFolder,
  isValidProjectSlug,
} from "@/lib/projects";
import { isValidFolderSlug } from "@/lib/folders";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ slug: string; folderId: string }>;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** GET /api/projects/[slug]/folders/[folderSlug]/conversations — folder chat history. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug, folderId: folderSlug } = await context.params;
    if (!isValidProjectSlug(slug) || !isValidFolderSlug(folderSlug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const messages = await getConversationsInFolder(supabase, slug, folderSlug);
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "Folder not found") {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    console.error("GET folder conversations error:", error);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/folders/[folderSlug]/conversations — append a message. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug, folderId: folderSlug } = await context.params;
    if (!isValidProjectSlug(slug) || !isValidFolderSlug(folderSlug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    let body: { role?: unknown; content?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { role, content } = body;
    if (role !== "user" && role !== "assistant") {
      return NextResponse.json(
        { error: "role must be 'user' or 'assistant'" },
        { status: 400 },
      );
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const message = await appendConversationMessageInFolder(supabase, slug, folderSlug, {
      role,
      content: content.trim(),
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Folder not found") {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    console.error("POST folder conversations error:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// findFolderId is exported by lib/projects.ts but unused here; re-exported for
// callers that want the raw id (e.g. the memories route resolves it itself).
export { findFolderId };
