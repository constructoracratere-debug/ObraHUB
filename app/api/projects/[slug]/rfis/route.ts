import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = { params: Promise<{ slug: string }> };

type RfiRow = {
  id: string; code: string; title: string; body: string; reference: string;
  assignee: string; due_date: string | null; status: string; response: string;
  created_at: string;
};

/** GET /api/projects/[slug]/rfis — all RFIs/NCs, newest first. */
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

    const { data, error } = await supabase
      .from("project_rfis")
      .select("id, code, title, body, reference, assignee, due_date, status, response, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ rfis: data ?? [] });
  } catch (error) {
    console.error("GET rfis error:", error);
    return NextResponse.json({ error: "Failed to load RFIs" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/rfis — create. Body: { title, body?, reference?, assignee?, dueDate? } */
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
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
    const dueDate = typeof body?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null;

    // Sequential code: RFI-### based on current count.
    const { count } = await supabase
      .from("project_rfis")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    const code = `RFI-${String(Number(count ?? 0) + 1).padStart(3, "0")}`;

    const { data: row, error } = await supabase
      .from("project_rfis")
      .insert({
        project_id: project.id,
        owner_id: user.id,
        code,
        title,
        body: typeof body?.body === "string" ? body.body : "",
        reference: typeof body?.reference === "string" ? body.reference : "",
        assignee: typeof body?.assignee === "string" ? body.assignee : "",
        due_date: dueDate,
        status: "abierta",
        response: "",
      })
      .select("id, code, title, body, reference, assignee, due_date, status, response, created_at")
      .single();
    if (error || !row) throw error ?? new Error("No se pudo crear el RFI");
    return NextResponse.json({ rfi: row }, { status: 201 });
  } catch (error) {
    console.error("POST rfis error:", error);
    return NextResponse.json({ error: "Failed to create RFI" }, { status: 500 });
  }
}

/** PATCH /api/projects/[slug]/rfis — update status/response. Body: { id, status?, response? } */
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (body.status === "abierta" || body.status === "respondida" || body.status === "cerrada") {
      update.status = body.status;
    }
    if (typeof body.response === "string") update.response = body.response;

    const { error } = await supabase.from("project_rfis").update(update).eq("id", id).eq("project_id", project.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH rfis error:", error);
    return NextResponse.json({ error: "Failed to update RFI" }, { status: 500 });
  }
}
