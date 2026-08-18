import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listActivity } from "@/lib/project-controls";

/** GET /api/projects/[slug]/activity — recent project activity feed. */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const activity = await listActivity(supabase, project.id, 40);
    return NextResponse.json({ activity });
  } catch (error) {
    console.error("GET activity error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
