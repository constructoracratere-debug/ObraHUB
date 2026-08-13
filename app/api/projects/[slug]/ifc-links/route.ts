import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listIfcLinks, createIfcLink, deleteIfcLink } from "@/lib/ifc-links";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/** GET /api/projects/[slug]/ifc-links — list all IFC↔Task links for a project. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const links = await listIfcLinks(supabase, project.id);
    return NextResponse.json({ links });
  } catch (error) {
    console.error("GET ifc-links error:", error);
    return NextResponse.json({ error: "Failed to load IFC links" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/ifc-links — create a new IFC↔Task link. */
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

    const body = await request.json();
    const { taskId, ifcFileId, ifcGlobalIds, ifcClass, label } = body ?? {};
    if (!taskId || !Array.isArray(ifcGlobalIds) || ifcGlobalIds.length === 0) {
      return NextResponse.json(
        { error: "taskId and ifcGlobalIds[] are required" },
        { status: 400 },
      );
    }

    const link = await createIfcLink(supabase, {
      projectId: project.id,
      ownerId: user.id,
      taskId,
      ifcFileId: ifcFileId ?? null,
      ifcGlobalIds,
      ifcClass: ifcClass ?? null,
      label: label ?? null,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("POST ifc-links error:", error);
    return NextResponse.json({ error: "Failed to create IFC link" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/ifc-links?id=<linkId> — delete a link. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const linkId = new URL(request.url).searchParams.get("id");
    if (!linkId) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await deleteIfcLink(supabase, linkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE ifc-links error:", error);
    return NextResponse.json({ error: "Failed to delete IFC link" }, { status: 500 });
  }
}
