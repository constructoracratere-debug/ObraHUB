// Purga news_items: elimina noticias no-construcción y >30 días.
// Correr: node scripts/purge-news.mjs [--dry]
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Mismo filtro del cron (app/api/cron/news/route.ts)
const OBRA_RE = new RegExp(
  [
    "constru\\w*", "obra[s]?\\b", "vivienda", "infraestruct\\w*", "cemento", "acero",
    "arena", "grava", "material\\w*", "licitaci\\w*", "contratist\\w*", "constructor\\w*",
    "arquitect\\w*", "urbanis\\w*", "edificio", "edificaci\\w*", "torre", "metro\\b",
    "carretera", "puente", "t[uú]nel", "mamposter\\w*", "concreto", "inmobiliar\\w*",
    "\\bbim\\b", "obra p[uú]blica", "plan parcial", "\\bpot\\b", "licencia",
    "curadur\\w*", "sismo\\w*", "terremoto", "cimentaci\\w*", "losa", "muro",
    "prefabricad\\w*", "ferrocarril", "tranv[ií]a", "aeropuerto", "puerto\\b",
    "represa", "hidroel[eé]ctric\\w*", "v[ií]a expresa", "autopista", "bodega[s]?\\b",
    "centro comercial", "d[uú]plex", " remodelaci\\w*", "obra civil", "excavaci\\w*",
    "demolici\\w*", "restauraci[oó]n", "patrimonio", "dise[nñ]o urban",
    "d[oó]lar", "inflaci\\w*", "\\bipc\\b", "hipotecari\\w*", "tasas de inter[eé]s",
    "financiaci[oó]n de vivienda", "subsidio de vivienda",
    "architect\\w*", "building[s]?\\b", "skyscraper", "timber", "concrete",
    "housing", "pavilion", "museum", "school building", "tower block",
    "construction", "engineer\\w*", "renovation", "masterplan", "urban",
    "edif[ií]cio", "moradia", "habita\\w*", "arquitet\\w*",
  ].join("|"),
  "i",
);
const JUNK_RE =
  /homicid|asesinat|secuestr|narcot|capturan|robo|robado|hurto|f[uú]tbol|futbolista|deporte|tatuaje|famoso|farándula|celebrid|novela|estrella de|kardashian|perro|gato|cachorro|animal|mascota|loter[ií]|hor[oó]scopo|receta|pel[ií]cula|serie de tv|streaming|xbox|playstation|videojuego|m[uú]sica|concierto|festival|accidente de tr[aá]nsito|tranc[oó]n|pico y placa|medicamento|hospitalizad|muri[oó]|funeral|boda|divorcio|elecci[oó]n presidencial|encuesta electoral|partido pol[ií]tico|debate|candidat\\w* presidencia|congreso.*reforma pensional|reforma pensional|reforma laboral|reforma de salud/i;

const THIRTY_D = Date.now() - 30 * 24 * 3600 * 1000;

// 1. Leer todo (paginado por 1000)
let all = [];
let from = 0;
while (true) {
  const res = await fetch(`${URL_}/rest/v1/news_items?select=id,title,summary,published_at&order=published_at.desc&limit=1000&offset=${from}`, { headers: H });
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) break;
  all = all.concat(rows);
  from += rows.length;
  if (rows.length < 1000) break;
}

// 2. Decidir qué borrar
const toDelete = [];
let kept = 0;
for (const n of all) {
  const text = `${n.title ?? ""} ${(n.summary ?? "").slice(0, 400)}`;
  const isJunk = JUNK_RE.test(text) || !OBRA_RE.test(text);
  const isOld = new Date(n.published_at).getTime() < THIRTY_D;
  if (isJunk || isOld) toDelete.push(n);
  else kept++;
}

console.log(`Total: ${all.length} | A conservar: ${kept} | A borrar: ${toDelete.length} (junk/viejas)`);
if (DRY) {
  console.log("\n— Muestra de lo que se BORRARÁ —");
  toDelete.slice(0, 15).forEach((n) => console.log("  ✕", n.title.slice(0, 90)));
  process.exit(0);
}

// 3. Borrar por lotes
let deleted = 0;
for (let i = 0; i < toDelete.length; i += 100) {
  const ids = toDelete.slice(i, i + 100).map((n) => n.id);
  const res = await fetch(`${URL_}/rest/v1/news_items?id=in.(${ids.join(",")})`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  if (res.ok) deleted += ids.length;
  else console.error("batch failed", res.status, await res.text());
}
console.log(`Borradas: ${deleted}. Quedan ${all.length - deleted} noticias del sector.`);
process.exit(0);
