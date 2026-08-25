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
  // Colombia — sector, precios y gobierno
  { source: "Camacol", url: "https://camacol.co/rss.xml", category: "empresas", country: "colombia" },
  { source: "DANE — PIB construcción", url: "https://www.dane.gov.co/rss/boletines", category: "precios", country: "colombia" },
  { source: "Construdata", url: "https://construdata.com/feed", category: "empresas", country: "colombia" },
  { source: "El Tiempo — Construcción", url: "https://www.eltiempo.com/rss/construccion.xml", category: "general", country: "colombia" },
  { source: "La República — Infraestructura", url: "https://www.larepublica.co/rss/infraestructura", category: "oportunidades", country: "colombia" },
  { source: "Ministerio de Vivienda", url: "https://www.minvivienda.gov.co/rss/noticias", category: "gobierno", country: "colombia" },
  { source: "ANI — Concesiones", url: "https://www.ani.gov.co/rss", category: "oportunidades", country: "colombia" },
  // Regional LATAM
  { source: "ArchDaily", url: "https://www.archdaily.com/feed", category: "innovacion", country: "latam" },
  { source: "Plataforma Arquitectura", url: "https://www.plataformaarquitectura.cl/feed", category: "innovacion", country: "latam" },
  { source: "Obras (México)", url: "https://obras.web.mx/rss.xml", category: "general", country: "mexico" },
  { source: "Obras por Expansión", url: "https://expansion.mx/rss/obras", category: "empresas", country: "mexico" },
  { source: "IBD — Obras e infraestructura", url: "https://www.ibd.org.ar/rss/noticias", category: "general", country: "latam" },
  { source: "Planuma", url: "https://www.planuma.com/feed", category: "innovacion", country: "latam" },
  { source: "Premios Iberoamericanos", url: "https://www.premiosiberoamericanos.com/feed", category: "premios", country: "latam" },
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
