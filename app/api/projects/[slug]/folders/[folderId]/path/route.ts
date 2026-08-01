import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFolderPath } from "@/lib/folders";

type RouteContext = {
  params: Promise<{ slug: string; folderId: string }>;
};

/**
 * GET /api/projects/[slug]/folders/[folderId]/path
 * Returns the ancestor chain (root → ... → folder) for breadcrumb rendering.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { folderId } = await context.params;
    const path = await getFolderPath(supabase, folderId);
    return NextResponse.json({ path });
  } catch (error) {
    console.error("GET folder path error:", error);
    return NextResponse.json({ error: "Failed to load path" }, { status: 500 });
  }
}
