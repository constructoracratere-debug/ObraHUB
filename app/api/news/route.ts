import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/news?category=&country=&q=&days=&limit= — LATAM construction news feed
 * (scraped daily by /api/cron/news).
 * `days` filtra por frescura (default 7 días). `days=all` desactiva el filtro.
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
    const daysParam = sp.get("days");
    const limit = Math.min(60, Number(sp.get("limit") ?? 30));
    const days = daysParam === "all" ? 0 : Math.min(365, Math.max(1, Number(daysParam ?? 7) || 7));

    let query = s
      .from("news_items")
      .select("id, title, summary, source, category, country, image_url, link, published_at")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (category) query = query.eq("category", category);
    if (country) query = query.eq("country", country);
    if (q) query = query.ilike("title", `%${q}%`);
    if (days > 0) {
      query = query.gte("published_at", new Date(Date.now() - days * 24 * 3600 * 1000).toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("GET news:", e);
    return NextResponse.json({ error: "Failed to load news" }, { status: 500 });
  }
}
