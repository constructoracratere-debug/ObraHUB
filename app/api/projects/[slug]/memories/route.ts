import {
  addMemory,
  deleteMemory,
  listMemories,
} from "@/lib/memories";
import { isValidProjectSlug } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/** Resolves a project's id for the current user by slug. Returns null if missing/not owned. */
async function resolveProjectId(
  slug: string,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return { supabase, id: data.id };
}

/** GET /api/projects/[slug]/memories — list memories for a project. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;
    if (!isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "Invalid project slug" }, { status: 400 });
    }

    const resolved = await resolveProjectId(slug);
    if (!resolved) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const memories = await listMemories(resolved.supabase, resolved.id);
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("GET memories error:", error);
    return NextResponse.json({ error: "Failed to load memories" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/memories — add a memory to a project. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;
    if (!isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "Invalid project slug" }, { status: 400 });
    }

    const resolved = await resolveProjectId(slug);
    if (!resolved) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

    const memory = await addMemory(
      resolved.supabase,
      resolved.id,
      body.content.trim(),
    );
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error("POST memories error:", error);
    return NextResponse.json({ error: "Failed to add memory" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/memories?id=... — delete a memory. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;
    if (!isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "Invalid project slug" }, { status: 400 });
    }

    const resolved = await resolveProjectId(slug);
    if (!resolved) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const memoryId = new URL(request.url).searchParams.get("id");
    if (!memoryId) {
      return NextResponse.json({ error: "memory id is required" }, { status: 400 });
    }

    await deleteMemory(resolved.supabase, memoryId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE memories error:", error);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
