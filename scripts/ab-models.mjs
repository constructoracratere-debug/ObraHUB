/**
 * A/B DE MODELOS para el BOCETO (la etapa que define la geometría).
 * Mismo encargo → cada modelo → sanitizeFloorPlan → gateDraft + gateMEP:
 * el que pase más puertas y deje mejor envolvente GANA. Empírico, sin fe.
 *
 *   node scripts/ab-models.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// .env.local a proceso (llaves del proyecto)
for (const ln of readFileSync(".env.local", "utf8").split("\n")) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const req = createRequire(import.meta.url);
const root = process.cwd();
const tmp = path.join(root, ".tmp-ab");
const { sanitizeFloorPlan } = req(path.join(tmp, "design", "schema.js"));
const { gateDraft, gateAdapt, gateSanitized } = req(path.join(tmp, "design", "validate.js"));
const { AGENT_ARCHITECT_DRAFT } = req(path.join(tmp, "design", "agents.js"));
const { extractJson } = req(path.join(tmp, "ai", "json.js"));

const ENCARGO = "Casa de 1 piso en mamposteria confinada, 3 alcobas, 2 banos, sala-comedor, cocina, lote 12x15 m, cubierta inclinada";
const USER = `ENCARGO: ${ENCARGO}\nLOTE: 12.0 x 15.0 m\nResponde el JSON del plan.`;

const CANDIDATOS = [
  { id: "gpt-4.1", baseURL: "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: "gpt-4.1" },
  { id: "gpt-4.1-mini", baseURL: "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: "gpt-4.1-mini" },
  { id: "gemini-3.6-flash", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-3.6-flash" },
];

const { default: OpenAI } = await import("openai");
console.log("modelo              json  espacios  envolvente  vanos  gates   t(s)\n" + "-".repeat(72));
for (const c of CANDIDATOS) {
  if (!c.key) { console.log(`${c.id.padEnd(19)} SIN LLAVE`); continue; }
  const t0 = Date.now();
  try {
    const cli = new OpenAI({ apiKey: c.key, baseURL: c.baseURL, timeout: 150_000 });
    const r = await cli.chat.completions.create({
      model: c.model,
      response_format: { type: "json_object" },
      max_tokens: 4500,
      temperature: 0.4,
      messages: [
        { role: "system", content: AGENT_ARCHITECT_DRAFT },
        { role: "user", content: USER },
      ],
    });
    const raw = r.choices[0]?.message?.content ?? "";
    const plan = sanitizeFloorPlan(JSON.parse(extractJson(raw) ?? "{}"));
    const g1 = gateDraft(plan), g2 = gateAdapt(plan), g3 = gateSanitized(plan);
    const pass = (g) => g.checks.filter((x) => x.pass).length;
    const env = g1.checks.find((x) => /envolvente/i.test(x.label));
    const vanos = g1.checks.find((x) => /puertas|vanos/i.test(x.label));
    const gs = [g1, g2, g3];
    const total = gs.reduce((n, g) => n + g.checks.length, 0);
    const pases = gs.reduce((n, g) => n + g.checks.filter((x) => x.pass).length, 0);
    const fallan = gs.flatMap((g) => g.checks.filter((x) => !x.pass).map((x) => x.label));
    const cob = gs.flatMap((g) => g.checks).find((x) => /envolvente|ocupad/i.test(x.label));
    console.log(
      c.id.padEnd(19),
      String("ok").padEnd(5),
      String(plan.rooms.length).padEnd(9),
      String(cob ? (cob.pass ? "✓" : "✗ " + cob.detail.slice(0, 14)) : "-").padEnd(19),
      `${pases}/${total}`.padEnd(7),
      ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + "s",
      fallan.length ? "  ✗ " + fallan.join(" · ").slice(0, 58) : "  ✓ TODO",
    );
  } catch (e) {
    console.log(c.id.padEnd(19), "ERROR:", String(e.message).slice(0, 70), ((Date.now() - t0) / 1000).toFixed(1) + "s");
  }
}
