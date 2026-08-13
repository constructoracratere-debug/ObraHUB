import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl, isIfcFile, isRevitFile } from "@/lib/files";

type RouteContext = {
  params: Promise<{ folderId: string }>;
};

/**
 * GET /api/folders/[folderId]/files/preview?id=<fileId>
 * Returns a JSON object with a short-lived signed URL for in-app preview.
 * The client uses this URL in an <iframe> (PDF), <img> (image), or Office embed.
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

    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: file } = await supabase
      .from("files")
      .select("storage_path, name, mime_type")
      .eq("id", fileId)
      .maybeSingle();

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // IFC and Revit models can be large and take longer to download/parse.
    // Extend the signed URL TTL to 30 minutes for those files.
    const ttl = isIfcFile(file.name) || isRevitFile(file.name) ? 1800 : 300;
    const signedUrl = await getSignedDownloadUrl(supabase, file.storage_path, ttl);
    return NextResponse.json({
      url: signedUrl,
      name: file.name,
      mimeType: file.mime_type,
    });
  } catch (error) {
    console.error("Preview URL error:", error);
    return NextResponse.json({ error: "Failed to generate preview URL" }, { status: 500 });
  }
}
