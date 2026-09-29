/**
 * SCRAPER DE NORMAS OFICIALES — detallado y tolerante:
 *  - Por cada fuente: prueba URLs candidatas (HEAD->GET), guarda el PDF
 *    crudo en kb/raw/, extrae TEXTO COMPLETO (pdf-parse) a kb/text/,
 *    y registra sha256+paginas+estado en kb/manifest.json (versionado git).
 *  - Nunca rompe: una fuente caida queda "pend" con su error para reintento.
 * Uso: node scripts/scrape-norms.mjs [--dry] [--only nsr10]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
// El catalogo se compila con tsc al vuelo (determinista).
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/norms/catalog.ts --outDir .tmp-norms --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { OFFICIAL_SOURCES } = req(path.join(process.cwd(), ".tmp-norms", "catalog.js"));

const DRY = process.argv.includes("--dry");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "--only=").split("=")[1] || null;
mkdirSync("kb/raw", { recursive: true });
mkdirSync("kb/text", { recursive: true });
const manifest = existsSync("kb/manifest.json") ? JSON.parse(readFileSync("kb/manifest.json", "utf8")) : { generated: "", sources: {} };

const UA = { "User-Agent": "Mozilla/5.0 ObraHub-NormsKB/1.0 (+educational)", Accept: "application/pdf,*/*" };
async function probe(url) {
  let buf = null, ct = "";
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); ct = r.headers.get("content-type") ?? ""; }
  } catch { /* fetch falla tras proxy corporativo → curl */ }
  if (!buf) {
    // Transporte curl (respeta proxies del sistema).
    const { execSync } = await import("node:child_process");
    try {
      buf = execSync(`curl -sL --max-time 60 -A "${UA["User-Agent"]}" "${url.replace(/"/g, "")}"`, { maxBuffer: 80 * 1024 * 1024 });
    } catch (e) { throw new Error("curl fallo: " + e.message.slice(0, 60)); }
  }
  if (!buf || buf.length < 20000) throw new Error("respuesta vacia o corta (" + (buf ? buf.length : 0) + "B)");
  const isPdf = buf.subarray(0, 4).toString() === "%PDF" || ct.includes("pdf");
  return { buf, isPdf };
}
let pdfParse = null;
async function extractPdf(buf, id) {
  // pdftotext (poppler) es el ganador en PDFs gigantes (NSR-10 19MB/1625p);
  // pdf-parse queda de fallback.
  const { execSync } = await import("node:child_process");
  const fs = await import("node:fs");
  try {
    execSync(`pdftotext -enc UTF-8 kb/raw/${id}.pdf kb/text/${id}.txt`);
    const text = fs.readFileSync(`kb/text/${id}.txt`, "utf8");
    const info = execSync(`pdfinfo kb/raw/${id}.pdf`).toString();
    const pages = Number((info.match(/Pages:\s+(\d+)/) ?? [])[1] ?? 0);
    return { pages, text };
  } catch (e) {
    if (!pdfParse) pdfParse = (await import("pdf-parse")).default;
    const t = await pdfParse(buf);
    return { pages: t.numpages, text: t.text };
  }
}
(async () => {
  for (const s of OFFICIAL_SOURCES) {
    if (ONLY && s.id !== ONLY) continue;
    let hit = null, err = null;
    for (const u of s.urls) {
      try { hit = await probe(u); if (hit) { hit.url = u; break; } } catch (e) { err = e.message; }
    }
    if (!hit) {
      manifest.sources[s.id] = { name: s.name, status: "pend", error: err ?? "sin fuente", scope: s.scope, ts: new Date().toISOString() };
      console.log(`- ${s.id}: PEND (${err})`);
      continue;
    }
    const sha = createHash("sha256").update(hit.buf).digest("hex").slice(0, 16);
    let pages = null, textChars = 0;
    if (hit.isPdf) {
      try {
        const ex = await extractPdf(hit.buf, s.id);
        pages = ex.pages; textChars = ex.text.length;
        if (!DRY) writeFileSync(`kb/text/${s.id}.txt`, ex.text, "utf8");
      } catch (e) { err = "pdf: " + e.message; }
    }
    if (!DRY) writeFileSync(`kb/raw/${s.id}${hit.isPdf ? ".pdf" : ".html"}`, hit.buf);
    manifest.sources[s.id] = { name: s.name, status: hit.isPdf ? "ok-pdf" : "ok-raw", url: hit.url, sha, bytes: hit.buf.length, pages, textChars, scope: s.scope, ts: new Date().toISOString() };
    console.log(`+ ${s.id}: ${hit.isPdf ? "PDF" : "RAW"} ${(hit.buf.length / 1e6).toFixed(1)}MB ${pages ? pages + "p " + textChars + "ch" : ""}`);
  }
  manifest.generated = new Date().toISOString();
  if (!DRY) writeFileSync("kb/manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  console.log(DRY ? "(dry)" : "manifest: kb/manifest.json");
})();
