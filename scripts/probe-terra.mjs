import { readFileSync } from "node:fs";
for (const ln of readFileSync(".env.local", "utf8").split("\n")) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createRequire } = await import("node:module");
const path = await import("node:path");
const req = createRequire(import.meta.url);
const { AGENT_ARCHITECT_DRAFT } = req(path.join(process.cwd(), ".tmp-ab", "design", "agents.js"));
const { default: OpenAI } = await import("openai");
const cli = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const r = await cli.chat.completions.create({
  model: "gpt-6.1-terra",
  response_format: { type: "json_object" },
  max_completion_tokens: 4500,
  messages: [
    { role: "system", content: AGENT_ARCHITECT_DRAFT },
    { role: "user", content: "ENCARGO: Casa de 1 piso en mamposteria confinada, 3 alcobas, 2 banos, sala-comedor, cocina, lote 12x15 m\nResponde el JSON del plan." },
  ],
});
const msg = r.choices[0]?.message ?? {};
const raw = msg.content ?? "";
console.log("content len:", raw.length, "| refusal:", msg.refusal ?? "-", "| finish:", r.choices[0]?.finish_reason);
console.log("usage:", JSON.stringify(r.usage));
console.log("=== PRIMEROS 600 CHARS ===");
console.log(raw.slice(0, 600));
console.log("=== reasoning tail (si trae) ===");
console.log(String(msg.reasoning ?? msg.reasoning_content ?? "").slice(-300));
console.log("=== keys top-level ===");
try { console.log(Object.keys(JSON.parse(raw))); } catch { console.log("no parsea directo"); }
