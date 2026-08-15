import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = { params: Promise<{ slug: string }> };

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

type Member = { userId: string; email: string; role: string };

async function listMembersWithEmails(projectId: string): Promise<Member[]> {
  const admin = serviceClient();
  const { data: rows } = await admin
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (!rows || rows.length === 0) return [];
  // Resolve emails via the admin API (beta scale: single page is fine).
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailBy = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? "—"]));
  return rows.map((r) => ({ userId: r.user_id as string, email: emailBy.get(r.user_id as string) ?? "(usuario)", role: r.role as string }));
}

/** GET /api/projects/[slug]/members — list project members with emails. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ members: await listMembersWithEmails(project.id) });
  } catch (error) {
    console.error("GET members error:", error);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/members — invite by email. Body: { email, role } */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Only the project owner (or an admin member) may invite.
    const { data: projRow } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", project.id)
      .single();
    const ownerId = (projRow as Record<string, any> | null)?.user_id;
    const admin = serviceClient();
    if (ownerId !== user.id) {
      const { data: me } = await admin
        .from("project_members")
        .select("role")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if ((me as Record<string, any> | null)?.role !== "admin") {
        return NextResponse.json({ error: "Solo el dueño puede invitar miembros" }, { status: 403 });
      }
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role === "viewer" || body?.role === "admin" ? body.role : "editor";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
    }

    // The invitee must already have an ObraHub account.
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = (users?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
    if (!target) {
      return NextResponse.json(
        { error: "Ese correo no tiene cuenta ObraHub — pídele registrarse primero en la app" },
        { status: 404 },
      );
    }

    const { error: insError } = await admin
      .from("project_members")
      .upsert(
        { project_id: project.id, user_id: target.id, role, invited_by: user.id },
        { onConflict: "project_id,user_id" },
      );
    if (insError) throw insError;
    return NextResponse.json({ ok: true, member: { userId: target.id, email, role } }, { status: 201 });
  } catch (error) {
    console.error("POST members error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/members?userId=<uuid> — owner, admin, or self. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const userId = new URL(request.url).searchParams.get("userId") ?? "";
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const { data: projRow } = await supabase.from("projects").select("user_id").eq("id", project.id).single();
    const admin = serviceClient();
    if (userId !== user.id && (projRow as Record<string, any> | null)?.user_id !== user.id) {
      const { data: me } = await admin
        .from("project_members")
        .select("role")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if ((me as Record<string, any> | null)?.role !== "admin") {
        return NextResponse.json({ error: "Sin permiso para quitar miembros" }, { status: 403 });
      }
    }

    const { error: delError } = await admin
      .from("project_members")
      .delete()
      .eq("project_id", project.id)
      .eq("user_id", userId);
    if (delError) throw delError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE members error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
