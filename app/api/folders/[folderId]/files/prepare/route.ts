import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ folderId: string }>;
};

/**
 * GET /api/folders/[folderId]/files/prepare?name=<filename>
 *
 * Returns an upload "ticket": the exact storagePath the browser must use for
 * a TUS resumable upload (user-namespace + project + folder + timestamped
 * filename). The client then uploads the bytes straight to Supabase Storage
 * and registers the metadata row via POST /files/register.
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

    // Verify the folder exists + is owned by the user (RLS hides others).
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
