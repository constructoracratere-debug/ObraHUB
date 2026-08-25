import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/normative-updates — latest normative changes affecting construction. */
export async function GET(request: NextRequest) {
  try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const limit = Math.min(50, Number(new URL(request.url).searchParams.get("limit") ?? 20));
    const { data, error } = await s
      .from("normative_updates")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ updates: data ?? [] });
  } catch (e) {
    console.error("GET normative-updates:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
