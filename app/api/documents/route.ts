import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteDocument,
  listGlobalDocuments,
  listProjectDocuments,
} from "@/lib/documents";

/**
 * GET /api/documents?scope=global|project&projectSlug=...
 * Lists documents. Global scope lists the shared library; project scope lists
 * documents attached to the given project (ownership enforced by RLS).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "global";
    const projectSlug = searchParams.get("projectSlug");

    if (scope === "project") {
      if (!projectSlug) {
        return NextResponse.json({ error: "projectSlug is required for project scope" }, { status: 400 });
      }
      const documents = await listProjectDocuments(supabase, projectSlug);
      return NextResponse.json({ documents });
    }

    const documents = await listGlobalDocuments(supabase);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("GET documents error:", error);
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}

/**
 * DELETE /api/documents?id=...
 * Deletes a document (cascades to chunks). Ownership/admin via RLS.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteDocument(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE documents error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
