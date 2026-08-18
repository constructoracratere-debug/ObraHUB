"use client";

import { useEffect, useRef } from "react";

/**
 * 🗺️ AmericasMap — professional interactive map (Leaflet + OpenStreetMap).
 * Drag to pan, scroll/buttons to zoom, major LATAM cities as reference,
 * and each project as a colored marker whose hover shows a live summary
 * (progress, SPI, alerts) and click opens the project.
 */

type Card = {
  slug: string;
  name: string;
  city: string | null;
  progress: number;
  spi: number | null;
  alerts: number;
  critical: number;
  tasksTotal: number;
};

const CITY_COORDS: Record<string, [number, number]> = {
  bogota: [4.71, -74.07], medellin: [6.24, -75.58], cali: [3.45, -76.53],
  barranquilla: [10.97, -74.8], cartagena: [10.39, -75.51], bucaramanga: [7.13, -73.13],
  cucuta: [7.89, -72.5], pereira: [4.81, -75.7], manizales: [5.07, -75.52],
  ibague: [4.44, -75.23], villavicencio: [4.14, -73.63], "santa marta": [11.24, -74.21],
  armenia: [4.53, -75.68], popayan: [2.44, -76.61], neiva: [2.93, -75.28],
  monteria: [8.75, -75.88], valledupar: [10.46, -73.26], sincelejo: [9.31, -75.4],
  quibdo: [5.69, -76.65], // Colombia
  "ciudad de mexico": [19.43, -99.13], guadalajara: [20.67, -103.35], monterrey: [25.69, -100.32], // México
  lima: [-12.05, -77.04], "santiago de chile": [-33.45, -70.67], "buenos aires": [-34.6, -58.38],
  quito: [-0.18, -78.47], caracas: [10.48, -66.9], "sao paulo": [-23.55, -46.63],
  "panama city": [8.98, -79.52], miami: [25.76, -80.19], "nueva york": [40.71, -74.0],
};

function norm(city: string): string {
  return city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function AmericasMap({ cards, onOpen }: { cards: Card[]; onOpen: (slug: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !holder.current || mapRef.current) return;

      const map = L.map(holder.current, {
        center: [7, -72], // Colombia-centric view of the Americas
        zoom: 5,
        minZoom: 3,
        maxZoom: 12,
        scrollWheelZoom: false, // no robar el scroll de la página
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Marcadores de proyectos (agrupados por ciudad)
      const byCity = new Map<string, Card[]>();
      for (const c of cards) {
        const key = (c.city ?? "").trim();
        if (!key) continue;
        byCity.set(key, [...(byCity.get(key) ?? []), c]);
      }
      for (const [city, list] of byCity) {
        const coords = CITY_COORDS[norm(city)];
        if (!coords) continue;
        const anyCrit = list.some((c) => c.critical > 0);
        const color = anyCrit ? "#EF4444" : list.length > 1 ? "#F59E0B" : "#0EA5E9";
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${color}22;border:2px solid ${color};box-shadow:0 0 12px ${color}66"><div style="width:14px;height:14px;border-radius:50%;background:${color}"></div></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const lines = list
          .slice(0, 4)
          .map(
            (c) =>
              `<b>${c.name}</b><br/>Avance ${c.progress}% · SPI ${c.spi ?? "—"} · ${c.alerts} alerta(s) · ${c.tasksTotal} tareas`,
          )
          .join("<hr style='margin:4px 0;border:none;border-top:1px solid #e2e8f0'/>");
        L.marker(coords, { icon })
          .addTo(map)
          .bindTooltip(`<div style="font-family:Segoe UI,Arial;font-size:11px">${lines}</div>`, { direction: "top", opacity: 0.95 })
          .on("click", () => onOpen(list[0].slug));
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
    // Re-init solo cuando cambia el set de proyectos con ciudad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => `${c.slug}:${c.city}`).join("|")]);

  return (
    <div className="mt-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
        🗺️ Obras — mapa interactivo (arrastra, zoom, pasa el cursor por un proyecto)
      </p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08]">
        <div ref={holder} className="h-[420px] w-full bg-[#0a1120]" />
      </div>
    </div>
  );
}
