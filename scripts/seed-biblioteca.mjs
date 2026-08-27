// Amplía la Biblioteca: descarga normas oficiales (PDF/HTML), las trocea,
// embebe y registra en documents/document_chunks. Además siembra catálogo en
// normative_updates con URLs oficiales.
// Uso: node scripts/seed-biblioteca.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const OAI = env.match(/OPENAI_API_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const slugify = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// ── Fuentes verificadas (200 OK) ──
const SOURCES = [
  { title: "Ley 400 de 1997 — Sismorresistencia (texto oficial)", url: "https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=336", kind: "html" },
  { title: "Ley 1796 de 2016 — Vivienda Segura (supervisión técnica)", url: "https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=67884", kind: "html" },
  { title: "Decreto 945 de 2017 — Modificación parcial NSR-10", url: "https://curaduria1pereira.com/wp-content/uploads/2024/01/DECRETO-945-DEL-05-DE-JUNIO-DE-2017-MODIFICACION-NSR10.pdf", kind: "pdf" },
  { title: "Decreto 1401 de 2023 — Última modificación NSR-10 (obra menor)", url: "https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=145699", kind: "html" },
  { title: "Ley 2439 de 2024 — Estatuto del Consumidor (protección comprador vivienda)", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=207751", kind: "html" },
  { title: "Resolución 312 de 2019 — Estándares mínimos SG-SST (MinTrabajo)", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=93971", kind: "html" },
  { title: "Resolución 2400 de 1979 — Estatuto de Seguridad Industrial", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8289", kind: "html" },
];

const htmlToText = (h) => h
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
  .replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/div>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

// 0. owner: usuario admin (Diego)
const usersReq = await fetch(`${URL_}/auth/v1/admin/users?email=constructoracratere@gmail.com`, { headers: H });
const users = await usersReq.json();
const ownerId = users.users?.[0]?.id;
if (!ownerId) { console.error("sin owner"); process.exit(1); }

let okCount = 0;
for (const src of SOURCES) {
  try {
    // 1. Descargar
    const res = await fetch(src.url, { headers: { "user-agent": "Mozilla/5.0 ObraHubLibraryBot" }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) { console.log(`SKIP ${src.title} → HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    let fullText = "";
    if (src.kind === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse();
      const r = await parser.getText(buf);
      fullText = r.text ?? "";
      await parser.destroy?.();
    } else {
      fullText = htmlToText(buf.toString("latin1"));
    }
    if (fullText.length < 800) { console.log(`SKIP ${src.title} → texto muy corto (${fullText.length})`); continue; }

    // 2. Fila documento (evitar duplicados por slug)
    const slug = slugify(src.title);
    const dup = await (await fetch(`${URL_}/rest/v1/documents?slug=eq.${slug}&select=id`, { headers: H })).json();
    if (dup.length > 0) { console.log(`YA-EXISTE ${src.title}`); continue; }
    const docIns = await fetch(`${URL_}/rest/v1/documents`, {
      method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ scope: "global", owner_id: ownerId, title: src.title, slug, source_filename: src.url.split("/").pop()?.slice(0, 120) ?? slug, mime_type: src.kind === "pdf" ? "application/pdf" : "text/html", page_count: 1, status: "processing" }),
    });
    const doc = (await docIns.json())[0];

    // 3. Troceo (~1500 chars, solape 200) por secciones simuladas de "página"
    const pages = [];
    const SIZE = 6000;
    for (let i = 0, p = 1; i < fullText.length; i += SIZE, p++) pages.push({ page: p, text: fullText.slice(i, i + SIZE) });
    const chunks = [];
    for (const pg of pages) {
      const c = pg.text.trim();
      for (let s = 0, ci = 0; s < c.length; s += 1300, ci++) {
        const slice = c.slice(s, s + 1500);
        if (slice.trim()) chunks.push({ document_id: doc.id, page_number: pg.page, chunk_index: ci, text: slice });
        if (s + 1500 >= c.length) break;
      }
    }
    // 4. Embeddings (lotes de 100) + insert (lotes de 200)
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += 100) {
      const batch = chunks.slice(i, i + 100);
      const emb = await (await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST", headers: { Authorization: `Bearer ${OAI}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map((c) => c.text) }),
      })).json();
      if (!emb.data) throw new Error("embeddings falló: " + JSON.stringify(emb).slice(0, 120));
      emb.data.forEach((d, j) => (batch[j].embedding = d.embedding));
    }
    for (let i = 0; i < chunks.length; i += 200) {
      const r = await fetch(`${URL_}/rest/v1/document_chunks`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(chunks.slice(i, i + 200)) });
      if (!r.ok) throw new Error("chunk insert " + r.status);
      inserted += Math.min(200, chunks.length - i);
    }
    await fetch(`${URL_}/rest/v1/documents?id=eq.${doc.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "ready", page_count: pages.length }) });
    console.log(`OK ${src.title} → ${pages.length} págs, ${inserted} chunks`);
    okCount++;
  } catch (e) {
    console.log(`ERROR ${src.title}: ${String(e.message).slice(0, 90)}`);
  }
}

// 5. Catálogo ampliado en normative_updates (con URLs oficiales)
const CATALOG = [
  { norm_type: "resolucion", number: "2400", year: 1979, title: "Resolución 2400 de 1979 — Estatuto de Seguridad Industrial", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8289" },
  { norm_type: "resolucion", number: "312", year: 2019, title: "Resolución 312 de 2019 — Estándares mínimos SG-SST", url: "https://www.mintrabajo.gov.co/normatividad/resoluciones" },
  { norm_type: "decreto", number: "1077", year: 2015, title: "Decreto 1077 de 2015 — Licencias urbanísticas y curadurías", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=39841" },
  { norm_type: "ntc", number: "2289", year: 2023, title: "NTC 2289 — Barras de acero de refuerzo (corrugadas)", url: "https://www.icontec.org" },
  { norm_type: "ntc", number: "121", year: 2021, title: "NTC 121 — Cemento Portland: especificaciones físicas y químicas", url: "https://www.icontec.org" },
  { norm_type: "ntc", number: "174", year: 2021, title: "NTC 174 — Agregados para concreto", url: "https://www.icontec.org" },
  { norm_type: "otro", number: "AIS-C-2017", year: 2017, title: "AIS C-2017 — Evaluación e Intervención de edificaciones existentes (anexo al NSR-10 por Decreto 1711/2021)", url: "https://www.ais.org.co" },
  { norm_type: "otro", number: "AIS-MANUAL", year: 2010, title: "Manual AIS de Construcción Sismo-Resistente — guía práctica de la NSR-10", url: "https://www.ais.org.co" },
  { norm_type: "otro", number: "GUIA-AUTOCONS", year: 2020, title: "Guía de autoconstrucción sismo-resistente (SGC/MinVivienda) — vivienda 1-2 pisos", url: "https://www.sgc.gov.co" },
  { norm_type: "resolucion", number: "330", year: 2017, title: "RAS 2017 — Títulos C a J disponibles en MinVivienda (potabilización, redes, alcantarillado)", url: "https://www.minvivienda.gov.co" },
];
const cat = await fetch(`${URL_}/rest/v1/normative_updates?on_conflict=number,year`, {
  method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify(CATALOG.map((c) => ({ ...c, source: "Fuente oficial", status: "vigente", relevance: "media", summary: "Documento oficial de referencia — ver URL.", published_at: new Date().toISOString() }))),
});
console.log(`CATALOGO: ${cat.status} (+${CATALOG.length}) | INGESTADOS: ${okCount}`);
process.exit(0);
