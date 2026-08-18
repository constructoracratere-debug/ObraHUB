import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = { params: Promise<{ slug: string }> };

/** GET /api/projects/[slug]/change-orders — órdenes de cambio. */
export async function GET(_r: NextRequest, c: RouteContext) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await c.params;
    const p = await findProjectBySlug(s, slug);
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const { data, error } = await s.from("project_change_orders")
      .select("*").eq("project_id", p.id).order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e) { console.error("GET co:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

/** POST /api/projects/[slug]/change-orders — nueva OC. Body: { title, reason?, items?, scheduleDays? } */
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
    const items = Array.isArray(b?.items)
      ? (b.items as Array<Record<string, unknown>>).filter((i) => typeof i.descripcion === "string").slice(0, 50)
      : [];
    const impactTotal = items.reduce((n, i) => n + Number(i.subtotal ?? 0), 0);
    const { count } = await s.from("project_change_orders").select("id", { count: "exact", head: true }).eq("project_id", p.id);
    const code = `OC-${String(Number(count ?? 0) + 1).padStart(3, "0")}`;
    const { data: row, error } = await s.from("project_change_orders").insert({
      project_id: p.id, owner_id: user.id, code, title,
      reason: typeof b?.reason === "string" ? b.reason : "",
      impact_items: items, impact_total: impactTotal,
      schedule_days: Math.round(Number(b?.scheduleDays ?? 0)) || 0,
      status: "pendiente",
    }).select("*").single();
    if (error || !row) throw error ?? new Error("insert");
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) { console.error("POST co:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

/** PATCH /api/projects/[slug]/change-orders — cambiar estado/verificar. Body: { id, status?, note?, photo? } */
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
    if (["pendiente", "aprobada", "rechazada"].includes(b.status)) upd.status = b.status;
    if (typeof b.decision_note === "string") upd.decision_note = b.decision_note;
    
    const { error } = await s.from("project_change_orders").update(upd).eq("id", id).eq("project_id", p.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { console.error("PATCH co:", e); return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
