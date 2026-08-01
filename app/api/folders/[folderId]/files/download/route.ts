import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/files";

type RouteContext = {
  params: Promise<{ folderId: string }>;
};

/** GET /api/folders/[folderId]/files/download?id=<fileId> — redirect to signed URL. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: file } = await supabase
      .from("files")
      .select("storage_path, name")
      .eq("id", fileId)
      .maybeSingle();

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const signedUrl = await getSignedDownloadUrl(supabase, file.storage_path);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
