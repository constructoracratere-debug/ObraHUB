import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/profile — update the signed-in user's profile fields.
 * RLS ensures a user can only update their own row.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let body: {
      full_name?: unknown;
      profession_type?: unknown;
      company?: unknown;
      phone?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const update: Record<string, string> = {};
    if (typeof body.full_name === "string") update.full_name = body.full_name.trim();
    if (typeof body.profession_type === "string")
      update.profession_type = body.profession_type.trim();
    if (typeof body.company === "string") update.company = body.company.trim();
    if (typeof body.phone === "string") update.phone = body.phone.trim();

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id);

    if (error) {
      console.error("Profile update error:", error.message);
      return NextResponse.json({ error: "No se pudo guardar el perfil" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
