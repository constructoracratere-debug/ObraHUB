import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/normative-scan — Vigilancia Normativa Colombia.
 *
 * Scrapes official sources for laws/decrees/resolutions affecting
 * construction (NSR-10, RETIE, RAS, NTC), classifies each with AI for
 * relevance and affected chapters, and stores them in normative_updates.
 * The consultant injects the latest updates so it NEVER cites a
 * derogated article.
 *
 * Sources scanned:
 * - Función Pública — SUJ (Sistema Unificado de Jurisprudencia)
 * - Diario Oficial (via prefetch.cc mirror with CORS)
 * - MinVivienda news
 * - Congreso visible laws
 */

type RawNorm = {
  title: string;
  url: string;
  source: string;
  date: string;
  content: string;
};

const SYSTEM = `Eres un ABOGADO CONSTRUCTOR especialista en derecho de la construcción colombiana. Recibes el título/extracto de una norma nueva y determinas:

1. ¿Es relevante para construcción/arquitectura/infraestructura? (alta/media/baja/irrelevante)
2. ¿Qué modifica de la NSR-10, RETIE, RAS, NTC o licencias?
3. ¿Deroga, adiciona, modifica o es nueva?

Responde en JSON EXACTO:
{"relevance":"alta|media|baja|irrelevante","norm_type":"ley|decreto|resolucion|circular|ntc|otro","affects":[{"nsr_title":"C.14","change":"modifica|deroga|adiciona|nueva","description":"qué cambia"}],"summary":"resumen en 2 líneas para constructores"}

Si no es relevante para construcción, relevance="irrelevante".`;

function extractNormNumber(title: string): { number: string; year: number } {
  const m = title.match(/(?:ley|decreto|resoluci[oó]n)\s+(?:n[uú]mero\s+)?(\d+)\s*(?:de|del?)\s*(\d{4})/i);
  if (m) return { number: m[1], year: parseInt(m[2]) };
  const m2 = title.match(/(\d{4})\s*(?:de|del?)\s*(\d{4})/);
  if (m2) return { number: m2[1], year: parseInt(m2[2]) };
  return { number: `auto-${Date.now()}`, year: new Date().getFullYear() };
}

async function fetchWithTimeout(url: string, ms = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "ObraHubNormBot/1.0" } });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function rssItems(xml: string, source: string): RawNorm[] {
  const out: RawNorm[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks.slice(0, 15)) {
    const g = (t: string) => {
      const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() : "";
    };
    const title = g("title");
    const link = g("link") || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "";
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      source,
      date: g("pubDate") || new Date().toISOString(),
      content: g("description").slice(0, 2000),
    });
  }
  return out;
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
  const apiKey = process.env.OPENAI_API_KEY;
  const openai = apiKey ? new OpenAI({ apiKey }) : null;

  // ── 1) SCRAPE: fuentes oficiales ──
  const rawNorms: RawNorm[] = [];
  const failures: string[] = [];

  const SOURCES: Array<{ url: string; source: string }> = [
    // Diario Oficial — leyes y decretos
    { url: "https://www.preflight.cc/diario-oficial/rss.xml", source: "Diario Oficial" },
    // Función Pública — normativa nueva
    { url: "https://www.funcionpublica.gov.co/web/sigep/manifest/normograma/rss", source: "Función Pública" },
    // MinVivienda — normativa construcción
    { url: "https://www.preflight.cc/minvivienda/rss.xml", source: "MinVivienda" },
    // Congreso — leyes aprobadas
    { url: "https://www.preflight.cc/congreso/leyes/rss.xml", source: "Congreso" },
    // ICONTEC — NTC nuevas
    { url: "https://www.preflight.cc/icontec/ntc/rss.xml", source: "ICONTEC" },
    // Fallback: Camacol (reporta cambios normativos del sector)
    { url: "https://camacol.co/rss.xml", source: "Camacol (normativa)" },
  ];

  for (const src of SOURCES) {
    try {
      const xml = await fetchWithTimeout(src.url);
      const items = rssItems(xml, src.source);
      // Filter: only items that look like norms (ley/decreto/resolución/NTC)
      const normItems = items.filter((i) =>
        /ley\s+\d|decreto\s+\d|resoluci[oó]n\s+\d|NTC\s+\d|norma|reglamento|sismo|construcci|edificaci|urbanismo|licencia/i.test(i.title + " " + i.content),
      );
      rawNorms.push(...normItems);
    } catch (e) {
      failures.push(`${src.source}: ${String((e as Error).message).slice(0, 30)}`);
    }
  }

  // ── 2) AI CLASSIFICATION ──
  let processed = 0;
  let stored = 0;

  for (const norm of rawNorms.slice(0, 20)) {
    try {
      const { number, year } = extractNormNumber(norm.title);

      // Check if already known
      const { count } = await admin
        .from("normative_updates")
        .select("id", { count: "exact", head: true })
        .eq("number", number)
        .eq("year", year);
      if (Number(count ?? 0) > 0) continue;

      let analysis = {
        relevance: "media",
        norm_type: "otro",
        affects: [] as Array<{ nsr_title: string; change: string; description: string }>,
        summary: norm.content.slice(0, 200),
      };

      if (openai) {
        try {
          const c = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 300,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: `Título: ${norm.title}\nExtracto: ${norm.content.slice(0, 500)}\nFuente: ${norm.source}` },
            ],
          });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? "{}");
          if (parsed.relevance) analysis = { ...analysis, ...parsed };
        } catch { /* AI optional */ }
      }

      if (analysis.relevance === "irrelevante") continue;

      const { error } = await admin.from("normative_updates").insert({
        norm_type: analysis.norm_type,
        number,
        year,
        title: norm.title.slice(0, 300),
        summary: analysis.summary.slice(0, 500),
        url: norm.url,
        source: norm.source,
        affects: analysis.affects,
        relevance: analysis.relevance,
        status: "vigente",
        published_at: norm.date ? new Date(norm.date).toISOString() : new Date().toISOString(),
        ai_analysis: JSON.stringify(analysis),
      });
      if (!error) stored++;
      processed++;
    } catch { /* continue */ }
  }

  return NextResponse.json({ ok: true, scanned: rawNorms.length, processed, stored, failures });
}
