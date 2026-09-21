/**
 * PASAPORTE — Scraper de precios (SISTEMA REPETIBLE).
 * Refresca lib/passport/prices.ts desde fuentes publicas colombianas.
 * Reglas de oro:
 *  - Nunca rompe la KB: si una fuente falla (403/cambio de HTML), la salta
 *    y lo reporta; la KB solo se reescribe si pasa validacion.
 *  - Cada precio cita fuente+fecha; los no actualizados conservan la suya.
 *  - Determinista en salida (orden fijo de claves).
 * Uso: node scripts/scrape-prices.mjs [--dry]
 */
import { writeFileSync, readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ObraHub-Passport/1.0", Accept: "application/json" };
const today = new Date().toISOString().slice(0, 10);

/** Fuentes: cada adapter devuelve { cop, note } o null. */
const SOURCES = {
  async homecenter(query) {
    try {
      const r = await fetch(`https://www.homecenter.com.co/homecenter-co/search?Ntt=${encodeURIComponent(query)}`, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return null;
      const html = await r.text();
      const m = [...html.matchAll(/\$([\d.]{4,12})/g)].map((x) => Number(x[1].replace(/\./g, ""))).filter((n) => n > 500);
      if (!m.length) return null;
      m.sort((a, b) => a - b);
      return { cop: Math.round(m[Math.floor(m.length * 0.4)]), note: "Homecenter mediana-baja" }; // mediana-baja: primera calidad funcional
    } catch { return null; }
  },
};

/** Queries por clave de la KB (unidad de referencia). */
const PLAN = {
  "Ladrillo": { q: "ladrillo H-10", unit: "und" },
  "Ceramica": { q: "ceramica piso 60x60", unit: "m2" },
  "Acabado piso": { q: "piso laminado", unit: "m2" },
  "Puerta": { q: "puerta cedro", unit: "und" },
};

async function main() {
  const path = "lib/passport/prices.ts";
  const src = readFileSync(path, "utf-8");
  const report = [];
  let next = src;
  for (const [key, plan] of Object.entries(PLAN)) {
    const hit = await SOURCES.homecenter(plan.q);
    if (!hit) { report.push(`- ${key}: SIN DATO (fuente bloqueada o vacia) — se conserva precio vigente`); continue; }
    // GUARD ANTI-OUTLIER: el valor vigente de la KB es la referencia; si el
    // scrape trae algo fuera de [0.4x, 2.5x] (paquetes, accesorios, promos),
    // se descarta — la KB nunca se corrompe por un parseo equivocado.
    const cur = Number(src.split(`"${key}": { cop: `)[1]?.split(",")[0]) || 0;
    if (cur && (hit.cop < cur * 0.4 || hit.cop > cur * 2.5)) {
      report.push(`- ${key}: descartado COP ${hit.cop} (outlier x${(hit.cop / cur).toFixed(1)} vs KB ${cur}) — probable paquete/accesorio`);
      continue;
    }
    const re = new RegExp(`("${key.replace(/[^a-zA-Z]/g, (c) => "\\\\" + c)}": \{ cop: )(\d+)`, "");
    // Reemplazo robusto linea a linea:
    next = next.replace(new RegExp(`("${key}": \{ cop: \d+, unit: "[^"]+", source: ")[^"]+(", updated: ")[^"]+`, "g"),
      `$1${hit.note} ${today}$2${today}`);
    next = next.replace(new RegExp(`("${key}": \{ cop: )\d+`), `$1${hit.cop}`);
    report.push(`+ ${key}: COP ${hit.cop.toLocaleString("es-CO")} (${hit.note} ${today})`);
  }
  console.log(report.join("\n"));
  if (Object.keys(PLAN).length && !next.includes("export const PRICES")) { console.error("KB corrupta — NO se escribe"); process.exit(1); }
  if (DRY) { console.log("(dry-run: no se escribe)"); return; }
  writeFileSync(path, next, "utf-8");
  console.log(`\nKB actualizada: ${path}`);
}
main();
