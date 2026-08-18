import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = { params: Promise<{ slug: string }> };

/** GET /api/projects/[slug]/punch — punch list (defectos de obra). */
export async function GET(_r: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const { data, error } = await s.from("project_punch_items")
      .select("*").eq("project_id", p.id).order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e) { console.error("GET punch:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

/** POST /api/projects/[slug]/punch — nuevo defecto. Body: { title, location?, drawing?, assignee?, dueDate?, note? } */
export async function POST(request: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const b = await request.json();
    const title = typeof b?.title === "string" ? b.title.trim() : "";
    if (!title) return NextResponse.json({ error: "title requerido" }, { status: 400 });
    const { count } = await s.from("project_punch_items").select("id", { count: "exact", head: true }).eq("project_id", p.id);
    const code = `PL-${String(Number(count ?? 0) + 1).padStart(3, "0")}`;
    const { data: row, error } = await s.from("project_punch_items").insert({
      project_id: p.id, owner_id: user.id, code, title,
      location: typeof b?.location === "string" ? b.location : "",
      drawing: typeof b?.drawing === "string" ? b.drawing : "",
      assignee: typeof b?.assignee === "string" ? b.assignee : "",
      due_date: typeof b?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : null,
      note: typeof b?.note === "string" ? b.note : "",
      status: "abierta",
    }).select("*").single();
    if (error || !row) throw error ?? new Error("insert");
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) { console.error("POST punch:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

/** PATCH /api/projects/[slug]/punch — cambiar estado/verificar. Body: { id, status?, note?, photo? } */
export async function PATCH(request: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const b = await request.json();
    const id = typeof b?.id === "string" ? b.id : "";
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const upd: Record<string, string> = { updated_at: new Date().toISOString() };
    if (["abierta", "verificada", "cerrada"].includes(b.status)) upd.status = b.status;
    if (typeof b.note === "string") upd.note = b.note;
    if (typeof b.photo === "string") upd.photo = b.photo;
    const { error } = await s.from("project_punch_items").update(upd).eq("id", id).eq("project_id", p.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { console.error("PATCH punch:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
