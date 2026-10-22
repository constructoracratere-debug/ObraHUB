import { clearDesignSession, getDesignSession, setDesignSession, type DesignSessionPayload } from "@/lib/design-session";
import { isValidProjectSlug } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ slug: string }> };

async function resolve(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id").eq("slug", slug).maybeSingle();
  return data ? { supabase, id: data.id } : null;
}

/** GET — sesión de diseño en la nube del proyecto (null si nunca guardó). */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const session = await getDesignSession(r.supabase, r.id);
  return NextResponse.json({ session });
}

/** PUT — autoguardado en la nube (debounced en el cliente). La sesión viaja
 *  COMPLETA: plan + etapa + memos + revisiones. Validación de fondo aquí
 *  (forma); la estricta (versión del plan) la hace el cliente al restaurar. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const plan = body.plan;
  const savedAt = body.savedAt;
  if (!plan || typeof plan !== "object") return NextResponse.json({ error: "La sesión necesita plan" }, { status: 400 });
  if (typeof savedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(savedAt)) {
    return NextResponse.json({ error: "savedAt ISO requerido" }, { status: 400 });
  }
  // Techo de tamaño defensivo: la sesión es texto (sin imágenes de
  // referencia, que viven aparte) — 2 MB sobra y evita memories gigantes.
  if (JSON.stringify(body).length > 2_000_000) {
    return NextResponse.json({ error: "Sesión demasiado grande" }, { status: 413 });
  }
  const session: DesignSessionPayload = {
    plan: plan as Record<string, unknown>,
    stage: typeof body.stage === "number" ? Math.max(0, Math.min(5, Math.round(body.stage))) : 5,
    siteMemo: body.siteMemo ?? null,
    constructorMemo: body.constructorMemo ?? null,
    civilMemo: body.civilMemo ?? null,
    equipment: Array.isArray(body.equipment) ? body.equipment : [],
    revisions: Array.isArray(body.revisions) ? body.revisions : [],
    savedAt,
  };
  await setDesignSession(r.supabase, r.id, session);
  return NextResponse.json({ session });
}

/** DELETE — "Nuevo dibujo": la nube olvida la sesión descartada. */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isValidProjectSlug(slug)) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  const r = await resolve(slug);
  if (!r) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  await clearDesignSession(r.supabase, r.id);
  return NextResponse.json({ ok: true });
}
