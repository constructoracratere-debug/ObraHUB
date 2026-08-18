import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
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

    // Notificación opcional por correo al responsable.
    let notify: "sent" | "skipped" | "failed" | null = null;
    const wantsNotify = body?.notify === true;
    const to = typeof body?.notifyEmail === "string" ? body.notifyEmail.trim() : "";
    if (wantsNotify && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY ?? "");
        const projectName = (await supabase.from("projects").select("name").eq("id", project.id).single()).data?.name ?? slug;
        await resend.emails.send({
          from: "ObraHub RFIs <onboarding@resend.dev>",
          to,
          subject: `📋 ${code} — ${title} (${projectName})`,
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto">
            <div style="background:#0a1120;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:16px">📋 Nuevo RFI asignado — ObraHub</h2>
            </div>
            <div style="background:#f8fafc;padding:18px;border-radius:0 0 12px 12px">
              <p style="margin:0 0 8px"><b style="color:#0f172a">${code}</b> · <b style="color:#0f172a">${title}</b></p>
              <p style="margin:0 0 8px;color:#334155">Proyecto: ${projectName}</p>
              ${dueDate ? `<p style="margin:0 0 8px;color:#b45309"><b>Vence:</b> ${dueDate}</p>` : ""}
              <p style="margin:12px 0 0;font-size:12px;color:#64748b">Gestionado en ObraHub · Powered by Cratere S.A.S.</p>
            </div></div>`,
        });
        notify = "sent";
      } catch {
        notify = "failed"; // p.ej. Resend free-tier: solo correo del dueño
      }
    } else if (wantsNotify) {
      notify = "skipped";
    }

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
    return NextResponse.json({ rfi: row, notify }, { status: 201 });
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
