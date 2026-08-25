import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/news?category=&country=&q=&limit= — LATAM construction news feed
 * (scraped daily by /api/cron/news).
 */
export async function GET(request: NextRequest) {
  try {
    const s = await createClient();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const sp = new URL(request.url).searchParams;
    const category = sp.get("category");
    const country = sp.get("country");
    const q = sp.get("q");
    const limit = Math.min(60, Number(sp.get("limit") ?? 30));

    let query = s
      .from("news_items")
      .select("id, title, summary, source, category, country, image_url, link, published_at")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (category) query = query.eq("category", category);
    if (country) query = query.eq("country", country);
    if (q) query = query.ilike("title", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("GET news:", e);
    return NextResponse.json({ error: "Failed to load news" }, { status: 500 });
  }
}
