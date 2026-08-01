import { createFolder, deleteFolderById, listFolders } from "@/lib/folders";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/projects/[slug]/folders?parentId=<uuid|null>
 * Lists folders. Without parentId → root-level folders. With parentId → children.
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

    const { slug } = await context.params;
    const parentId = new URL(request.url).searchParams.get("parentId");

    const folders = await listFolders(supabase, slug, parentId);
    return NextResponse.json({ folders });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    console.error("GET folders error:", error);
    return NextResponse.json({ error: "Failed to load folders" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/folders — create a folder (optionally nested). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;

    let body: { name?: unknown; parentId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const parentId =
      typeof body.parentId === "string" && body.parentId.length > 0
        ? body.parentId
        : null;

    const folder = await createFolder(supabase, slug, body.name, parentId);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Project not found" || error.message === "Folder name is required")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST folders error:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/folders?id=<folderId> — delete a folder by ID. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;
    const folderId = new URL(request.url).searchParams.get("id");
    if (!folderId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify the folder belongs to this project (ownership via RLS).
    await deleteFolderById(supabase, folderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE folders error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
