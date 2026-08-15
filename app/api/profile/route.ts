import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * PATCH /api/profile — upsert the signed-in user's profile fields.
 *
 * Uses UPSERT (not UPDATE): users whose accounts predate the auto-create
 * trigger have no profiles row, and a plain UPDATE on zero rows silently
 * "succeeds" while saving nothing — the bug behind profiles never sticking.
 * The write goes through the service client so the row is created safely.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const update: Record<string, string> = {};
    for (const key of ["full_name", "profession_type", "company", "phone", "avatar_url"]) {
      const v = body[key];
      if (typeof v === "string") update[key] = v.trim();
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await admin
      .from("profiles")
      .upsert({ id: user.id, ...update, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) {
      console.error("Profile upsert error:", error.message);
      // avatar_url column may not exist yet — retry with base fields only.
      const base: Record<string, string> = {};
      for (const k of ["full_name", "profession_type", "company", "phone"]) {
        if (update[k] !== undefined) base[k] = update[k];
      }
      if (Object.keys(base).length > 0) {
        const retry = await admin
          .from("profiles")
          .upsert({ id: user.id, ...base, updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (!retry.error) return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "No se pudo guardar el perfil" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/profile/avatar — multipart upload of a profile photo.
 * Stores it in the project-files bucket under <userId>/profile/avatar and
 * records the storage path in profiles.avatar_url.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "La foto debe pesar menos de 5 MB" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/profile/avatar.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("project-files")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) {
      console.error("Avatar upload error:", upErr.message);
      return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 });
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: dbErr } = await admin
      .from("profiles")
      .upsert({ id: user.id, avatar_url: path, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (dbErr) {
      // Column may not exist yet — the photo is stored; surface a clear hint.
      return NextResponse.json(
        { error: "Foto subida, pero falta ejecutar profile-avatar.sql en Supabase" },
        { status: 202 },
      );
    }
    return NextResponse.json({ ok: true, avatarUrl: path });
  } catch (error) {
    console.error("POST avatar error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
