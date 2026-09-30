import { getKit, setKit, type ProjectKit } from "@/lib/kit";
import { isValidProjectSlug } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ slug: string }> };

async function resolve(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id").eq("slug", slug).maybeSingle();
  return data ? { supabase, id: data.id } : null;
}

/** GET — kit activo del proyecto. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const kit = await getKit(r.supabase, r.id);
  return NextResponse.json({ kit });
}

/** PUT — define/reemplaza el kit (los archivos oficiales del flujo).
 * Si solo llega { plan }, hace merge con el kit existente (el Diseño
 * publica el modelo sin tocar archivos ni nombre). */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  let body: { name?: unknown; fileIds?: unknown; note?: unknown; plan?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Modo merge: solo llega el plan (publicación desde Diseño Arquitectónico).
  if (body.plan !== undefined && body.name === undefined && body.fileIds === undefined) {
    const existing = (await getKit(r.supabase, r.id)) ?? { name: "Kit de obra", fileIds: [] };
    const plan = (body.plan && typeof body.plan === "object" ? body.plan : undefined) as Record<string, unknown> | undefined;
    const kit: ProjectKit = { ...existing, plan };
    await setKit(r.supabase, r.id, kit);
    return NextResponse.json({ kit });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((x): x is string => typeof x === "string").slice(0, 60) : [];
  if (!name) return NextResponse.json({ error: "El kit necesita nombre" }, { status: 400 });
  const prev = await getKit(r.supabase, r.id);
  const kit: ProjectKit = {
    name, fileIds,
    note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
    plan: body.plan && typeof body.plan === "object" ? (body.plan as Record<string, unknown>) : prev?.plan,
  };
  await setKit(r.supabase, r.id, kit);
  return NextResponse.json({ kit });
}
