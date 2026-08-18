"use client";

/**
 * 🗺️ Obras por ciudad — geo-grid of Colombia (no fake borders).
 * Cities placed by real lat/lon normalized to the country's bounding box;
 * dot size = project count, red = any critical alert. Unknown cities are
 * listed below the grid (never silently dropped).
 */

/**
 * Simplified Colombia silhouette (lon, lat) — stylized low-poly outline.
 * Same normalization as the city dots, so pins land inside the country.
 */
const BORDER: Array<[number, number]> = [
  [-71.7, 12.4], [-72.9, 11.5], [-74.2, 11.2], [-74.8, 10.9], [-75.5, 10.4],
  [-75.9, 8.7], [-76.9, 8.1], [-77.4, 7.2], [-77.9, 7.0], [-77.2, 6.0],
  [-77.9, 4.0], [-77.2, 3.9], [-78.8, 1.8], [-79.0, 1.0], [-78.3, 0.1],
  [-76.6, 0.2], [-75.6, -0.1], [-70.0, -1.0], [-69.9, -4.2], [-69.5, 0.0],
  [-67.5, 1.2], [-67.0, 2.0], [-67.0, 2.5], [-67.4, 4.0], [-67.9, 6.0],
  [-67.3, 7.7], [-72.2, 8.6],
];

const CITIES: Record<string, [number, number]> = {
  bogota: [4.71, -74.07],
  medellin: [6.24, -75.58],
  cali: [3.45, -76.53],
  barranquilla: [10.97, -74.8],
  cartagena: [10.39, -75.51],
  bucaramanga: [7.13, -73.13],
  cucuta: [7.89, -72.5],
  pereira: [4.81, -75.7],
  manizales: [5.07, -75.52],
  ibague: [4.44, -75.23],
  villavicencio: [4.14, -73.63],
  "santa marta": [11.24, -74.21],
  armenia: [4.53, -75.68],
  popayan: [2.44, -76.61],
  neiva: [2.93, -75.28],
  monteria: [8.75, -75.88],
  valledupar: [10.46, -73.26],
  sincelejo: [9.31, -75.4],
  tunja: [5.53, -73.37],
  quibdo: [5.69, -76.65],
};

function normalize(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ColombiaMap({
  cards,
}: {
  cards: Array<{ city: string | null; critical: number; name: string }>;
}) {
  const byCity = new Map<string, { count: number; critical: number }>();
  for (const c of cards) {
    const key = (c.city ?? "").trim();
    if (!key) continue;
    const cur = byCity.get(key) ?? { count: 0, critical: 0 };
    cur.count += 1;
    cur.critical += c.critical;
    byCity.set(key, cur);
  }
  if (byCity.size === 0) return null;

  const W = 760;
  const H = 460;
  const LAT0 = 12.9;
  const LAT1 = -4.7;
  const LON0 = -79.6;
  const LON1 = -66.8;
  const px = (lon: number) => 40 + ((lon - LON0) / (LON1 - LON0)) * (W - 80);
  const py = (lat: number) => 30 + ((LAT0 - lat) / (LAT0 - LAT1)) * (H - 70);

  const placed = Array.from(byCity.entries()).map(([city, st]) => ({
    city,
    st,
    k: CITIES[normalize(city)],
  }));
  const others = placed.filter((e) => !e.k);

  return (
    <div className="mt-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
        🗺️ Obras por ciudad
      </p>
      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Mapa de obras por ciudad">
          <defs>
            <pattern id="obrapp-grid" width="38" height="38" patternUnits="userSpaceOnUse">
              <path d="M38 0H0V38" fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#obrapp-grid)" rx="12" />
          <polygon
            points={BORDER.map(([lon, lat]) => `${px(lon)},${py(lat)}`).join(" ")}
            fill="rgba(14,165,233,0.06)"
            stroke="rgba(56,189,248,0.35)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text x={W / 2} y={24} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize="11" letterSpacing="3">
            COLOMBIA — DISTRIBUCIÓN GEOGRÁFICA DE OBRAS
          </text>
          {placed
            .filter((e) => e.k)
            .map((e) => {
              const [lat, lon] = e.k as [number, number];
              const r = 6 + Math.min(10, e.st.count * 2);
              const hasCrit = e.st.critical > 0;
              const label = e.city.charAt(0).toUpperCase() + e.city.slice(1);
              return (
                <g key={e.city}>
                  <circle cx={px(lon)} cy={py(lat)} r={r + 7} fill={hasCrit ? "rgba(239,68,68,0.12)" : "rgba(14,165,233,0.12)"} />
                  <circle cx={px(lon)} cy={py(lat)} r={r} fill={hasCrit ? "#EF4444" : "#0EA5E9"} opacity="0.85" />
                  <circle cx={px(lon)} cy={py(lat)} r={3} fill="#F8FAFC" opacity="0.9" />
                  <text x={px(lon) + r + 7} y={py(lat) + 4} fill="#E2E8F0" fontSize="12" fontWeight="600">
                    {label} · {e.st.count}
                  </text>
                </g>
              );
            })}
        </svg>
        {others.length > 0 && (
          <p className="px-3 pb-1 text-[10px] text-slate-600">
            Otras ubicaciones: {others.map((e) => `${e.city} (${e.st.count})`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
