import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/news — LATAM construction news scraper (RSS).
 * Scheduled daily via vercel.json. Pulls curated feeds (prices, methods,
 * normativa, empresas, gobierno, premios) into news_items; dedupes by link.
 * Public read via RLS (news_public_read).
 */

type Feed = { source: string; url: string; category: string; country: string };

const FEEDS: Feed[] = [
  // ===== COLOMBIA — sector, economía, gobierno =====
  { source: "Camacol", url: "https://camacol.co/rss.xml", category: "empresas", country: "colombia" },
  { source: "La República — Infraestructura", url: "https://www.larepublica.co/rss/infraestructura", category: "oportunidades", country: "colombia" },
  { source: "El Tiempo — Economía", url: "https://www.eltiempo.com/rss/economia.xml", category: "precios", country: "colombia" },
  { source: "El Tiempo — Colombia", url: "https://www.eltiempo.com/rss/colombia.xml", category: "gobierno", country: "colombia" },
  { source: "El Tiempo — Bogotá", url: "https://www.eltiempo.com/rss/bogota.xml", category: "gobierno", country: "colombia" },
  { source: "Asobancaria", url: "https://www.asobancaria.com/rss", category: "precios", country: "colombia" },
  { source: "Expansión MX — Obras", url: "https://expansion.mx/rss/obras", category: "empresas", country: "mexico" },
  // ===== LATAM — Arquitectura, BIM, Innovación =====
  { source: "ArchDaily Global", url: "https://www.archdaily.com/feed", category: "innovacion", country: "latam" },
  { source: "ArchDaily México", url: "https://www.archdaily.mx/feed", category: "innovacion", country: "mexico" },
  { source: "ArchDaily Chile", url: "https://www.archdaily.ch/feed", category: "innovacion", country: "latam" },
  { source: "ArchDaily Colombia", url: "https://www.archdaily.co/feed", category: "innovacion", country: "colombia" },
  { source: "ArchDaily Perú", url: "https://www.archdaily.pe/feed", category: "innovacion", country: "latam" },
  { source: "ArchDaily Brasil", url: "https://www.archdaily.com.br/feed", category: "innovacion", country: "latam" },
  { source: "Plataforma Arquitectura", url: "https://www.plataformaarquitectura.cl/feed", category: "innovacion", country: "latam" },
  { source: "Dezeen — Global Design", url: "https://www.dezeen.com/feed/", category: "innovacion", country: "latam" },
  { source: "Design Milk — Tech", url: "https://design-milk.com/feed/", category: "innovacion", country: "latam" },
  // ===== ECONOMÍA LATAM =====
  { source: "Valora Analitik", url: "https://www.valoraanalitik.com/rss", category: "precios", country: "latam" },
];

function tag(xml: string, t: string): string {
  const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function classify(title: string, summary: string, fallback: string): string {
  const t = `${title} ${summary}`.toLowerCase();
  if (/precio|inflaci|ipc|m2|costo|cemento|acero|material/.test(t)) return "precios";
  if (/norma|reglamento|nsr|decreto|resoluci|ley|código|codigo/.test(t)) return "normativa";
  if (/licitaci|concesi|contrato|obra pública|obra publica|asignaci|adjudica|invitaci/.test(t)) return "oportunidades";
  if (/premio|ganador|mención|mencion|reconocimiento/.test(t)) return "premios";
  if (/gobierno|ministerio|alcaldía|alcaldia|presidencia|dane|ani/.test(t)) return "gobierno";
  if (/constructora|empresa|consorcio|startup|emprendedor|fusión|fusion/.test(t)) return "empresas";
  if (/bim|innovaci|método|metodo|tecnolog|sostenib|prefabrica/.test(t)) return "innovacion";
  return fallback;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  let inserted = 0;
  const failures: string[] = [];

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "user-agent": "ObraHubNewsBot/1.0 (+https://obrahub.app)" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const xml = await res.text();
      const items = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
      const rows: Array<Record<string, unknown>> = [];
      for (const it of items.slice(0, 10)) {
        const title = tag(it, "title");
        const link =
          tag(it, "link") ||
          (it.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
        if (!title || !link) continue;
        const summary = tag(it, "description") || tag(it, "summary") || tag(it, "content");
        const img = it.match(/<enclosure[^>]*url="([^"]+\.(?:jpg|png|webp))"/i)?.[1] ?? null;
        const dateStr = tag(it, "pubDate") || tag(it, "updated") || tag(it, "published");
        const ts = dateStr ? new Date(dateStr) : new Date();
        rows.push({
          link: link.slice(0, 500),
          title: title.slice(0, 250),
          summary: summary.slice(0, 1200),
          source: feed.source,
          source_url: feed.url,
          category: classify(title, summary, feed.category),
          country: feed.country,
          image_url: img,
          published_at: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
        });
      }
      if (rows.length > 0) {
        const { error, count } = await admin
          .from("news_items")
          .upsert(rows, { onConflict: "link", ignoreDuplicates: true, count: "exact" });
        if (!error) inserted += Number(count ?? rows.length);
      }
    } catch (e) {
      failures.push(`${feed.source}: ${String((e as Error).message).slice(0, 30)}`);
    }
  }

  return NextResponse.json({ ok: true, feeds: FEEDS.length, inserted, failures });
}
