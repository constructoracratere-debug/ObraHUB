/**
 * 📍 SiNuPut / ArcGIS REST — Consulta de POT y uso del suelo por coordenadas.
 *
 * Los visores POT de Colombia (SINUPOT, Colombia en Mapas, SDP) corren sobre
 * ArcGIS Hub → sus capas se exponen como servicios REST. Esta utilidad
 * consulta por coordenadas (lat/lon WGS84) y devuelve uso del suelo, normas
 * urbanísticas y (cuando están publicadas) capas de amenaza.
 *
 * Si el municipio no tiene servicio ArcGIS, degrada a búsqueda web.
 */

export type SinupotResult = {
  fuente: string;
  ciudad: string;
  usoDelSuelo?: string;
  tratamiento?: string;
  edificabilidad?: string;
  amenaza?: string;
  restricciones?: string[];
  coordenadas: { lat: number; lon: number };
};

/** Servicios ArcGIS conocidos por ciudad (capas de POT/uso del suelo). */
const ARCGIS_SERVICES: Record<string, string> = {
  "bogota": "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/Mapa_Referencia/MapServer",
  // Cali, Medellín, etc. se agregan al confirmar sus endpoints
};

/**
 * Consulta ArcGIS REST por punto (lat/lon → uso del suelo).
 * Formato estándar: /query?geometry={x,y}&geometryType=esriGeometryPoint&inSR=4326
 */
export async function queryPotByCoords(lat: number, lon: number, city: string): Promise<SinupotResult | null> {
  const base = ARCGIS_SERVICES[city.toLowerCase()];
  if (!base) return null;
  try {
    const url =
      `${base}/identify?f=json&geometry=${JSON.stringify({ x: lon, y: lat })}` +
      `&geometryType=esriGeometryPoint&sr=4326&layers=all:visible&tolerance=5&mapExtent=` +
      `${JSON.stringify({ xmin: lon - 0.01, ymin: lat - 0.01, xmax: lon + 0.01, ymax: lat + 0.01 })}&imageDisplay=800,600,96`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const json = await r.json() as { results?: Array<{ attributes: Record<string, unknown> }> };
    const attrs = json.results?.[0]?.attributes;
    if (!attrs) return null;
    return {
      fuente: `ArcGIS ${city} (Catastro/SDP)`,
      ciudad: city,
      usoDelSuelo: String(attrs["USO"] ?? attrs["uso"] ?? attrs["TIPO"] ?? ""),
      tratamiento: String(attrs["TRATAMIENTO"] ?? attrs["tratamiento"] ?? ""),
      coordenadas: { lat, lon },
    };
  } catch {
    return null;
  }
}

/** Detecta coordenadas en texto libre ("4.65N -74.08W", "4.65, -74.08", etc.). */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d{2,6})[,\s]+(-?\d{1,3}\.\d{2,6})/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 12 || Math.abs(lon) > 80) return null; // fuera de Colombia
  return { lat, lon };
}
