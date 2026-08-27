import { readFileSync } from "node:fs";
const env = readFileSync("C:/ObraHub/ObraHub/.env.local", "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const OAI = env.match(/OPENAI_API_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const buf = readFileSync("./dec945.pdf");
const { PDFParse } = await import("pdf-parse");
const parser = new PDFParse({ data: new Uint8Array(buf) });
const parsed = await parser.getText();
const fullText = parsed.text ?? "";
console.log("texto:", fullText.length, "pags:", parsed.total);
const users = await (await fetch(URL_ + "/auth/v1/admin/users?email=constructoracratere@gmail.com", { headers: H })).json();
const ownerId = users.users[0].id;
const title = "Decreto 945 de 2017 — Modificación parcial NSR-10";
const slug = "decreto-945-de-2017-modificacion-parcial-nsr-10";
const dup = await (await fetch(`${URL_}/rest/v1/documents?slug=eq.${slug}&select=id`, { headers: H })).json();
if (dup.length) { console.log("ya existe"); process.exit(0); }
const doc = (await (await fetch(`${URL_}/rest/v1/documents`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ scope: "global", owner_id: ownerId, title, slug, source_filename: "DECRETO-945.pdf", mime_type: "application/pdf", page_count: parsed.total ?? 1, status: "processing" }) })).json())[0];
const chunks = [];
for (let s = 0, ci = 0; s < fullText.length; s += 1300, ci++) {
  const slice = fullText.slice(s, s + 1500);
  if (slice.trim()) chunks.push({ document_id: doc.id, page_number: Math.floor(s / 6000) + 1, chunk_index: ci, text: slice });
}
const emb = await (await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${OAI}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input: chunks.map(c => c.text) }) })).json();
if (!emb.data) { console.error("EMB FAIL", JSON.stringify(emb).slice(0,200)); process.exit(1); }
emb.data.forEach((d, j) => chunks[j].embedding = d.embedding);
const r = await fetch(`${URL_}/rest/v1/document_chunks`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(chunks) });
await fetch(`${URL_}/rest/v1/documents?id=eq.${doc.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "ready" }) });
console.log("OK 945:", chunks.length, "chunks insert", r.status);
process.exit(0);
