"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 📰 Noticias LATAM — the retention engine: prices, methods, normativa,
 * empresas, government tenders, awards and innovation, scraped daily from
 * the region's key construction media.
 */

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  country: string;
  image_url: string | null;
  link: string;
  published_at: string;
};

const CATEGORIES: Array<[string, string]> = [
  ["", "🌐 Todo"],
  ["precios", "📉 Precios"],
  ["oportunidades", "🎯 Licitaciones"],
  ["normativa", "⚖️ Normativa"],
  ["empresas", "🏢 Empresas"],
  ["gobierno", "🏛️ Gobierno"],
  ["premios", "🏆 Premios"],
  ["innovacion", "💡 Innovación/BIM"],
];

const COUNTRY_LABEL: Record<string, string> = {
  colombia: "🇨🇴",
  mexico: "🇲🇽",
  latam: "🌎",
};

// Filtro de frescura — por defecto solo la última semana.
const RANGES: Array<[string, string]> = [
  ["1", "🕘 Hoy"],
  ["7", "📅 7 días"],
  ["30", "🗓️ 30 días"],
  ["all", "♾️ Todo"],
];

function since(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "ahora";
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h / 24)}d`;
}

export function NewsTool() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [days, setDays] = useState("7");
  const [q, setQ] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (country) params.set("country", country);
      if (q.trim()) params.set("q", q.trim());
      params.set("days", days);
      const res = await fetch(`/api/news?${params}`);
      const d = await res.json();
      setItems(res.ok ? (d.items ?? []) : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, country, q, days]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-8">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">📰 Noticias del sector</h2>
          <div className="flex gap-1.5">
            {RANGES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDays(id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  days === id
                    ? "border-orange-500/50 bg-orange-500/20 text-orange-200"
                    : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Solo noticias relevantes para obra: construcción, materiales, licitaciones, normativa y arquitectura.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (ej. cemento, licitación, BIM)…"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-orange-500/40 focus:outline-none"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-2 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">🌎 Todo LATAM</option>
            <option value="colombia">🇨🇴 Colombia</option>
            <option value="mexico">🇲🇽 México</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                category === id
                  ? "border-orange-500/50 bg-orange-500/20 text-orange-200"
                  : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Cargando noticias…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-slate-400">Sin noticias en este rango de fechas.</p>
          <p className="mt-1 text-xs text-slate-600">
            Prueba con <button type="button" onClick={() => setDays("30")} className="underline hover:text-slate-400">30 días</button> o{" "}
            <button type="button" onClick={() => setDays("all")} className="underline hover:text-slate-400">todo el historial</button>.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <a
              key={n.id}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-orange-500/25 hover:bg-orange-500/[0.04]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-slate-100 group-hover:text-orange-200">
                    {COUNTRY_LABEL[n.country] ?? "📰"} {n.title}
                  </p>
                  {n.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{n.summary}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-medium text-slate-300">{n.source}</span>
                    <span className="text-slate-600">{since(n.published_at)}</span>
                  </div>
                </div>
                {n.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.image_url}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded-lg border border-white/[0.06] object-cover"
                    loading="lazy"
                  />
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
