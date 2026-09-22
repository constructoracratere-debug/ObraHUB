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

/** PUT — define/reemplaza el kit (los archivos oficiales del flujo). */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  let body: { name?: unknown; fileIds?: unknown; note?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((x): x is string => typeof x === "string").slice(0, 60) : [];
  if (!name) return NextResponse.json({ error: "El kit necesita nombre" }, { status: 400 });
  const kit: ProjectKit = { name, fileIds, note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined };
  await setKit(r.supabase, r.id, kit);
  return NextResponse.json({ kit });
}
