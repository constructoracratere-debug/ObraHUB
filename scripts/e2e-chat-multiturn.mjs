#!/usr/bin/env node
/**
 * E2E — gestor normativo multi-turno (repro del bug "no me deja seguir preguntando").
 * Replica EXACTAMENTE lo que hace app-shell.tsx sendMessage():
 *   persist user → POST /api/chat (con history) → persist assistant (contenido largo)
 * Dos preguntas consecutivas + verificación de estado del composer (isLoading client no reproducible
 * aquí, pero sí el 500/timeout que lo dispara).
 */
const BASE = process.env.OBRahUB_BASE ?? "https://obra-hub-diego-pineda-s-projects.vercel.app";
const EMAIL = process.env.OBRahUB_EMAIL ?? "sofyarquitectura@gmail.com";
import { readFileSync } from "node:fs";
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
})();

let cookie = "";
const t0 = Date.now();
const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    if (kv.startsWith("sb-")) cookie = kv;
  }
  return res;
}

async function main() {
  console.log(`▶ chat multi-turn vs ${BASE}`);

  // 1. login (UN solo send-code)
  await call("/api/auth/send-code", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  const codes = await (await fetch(
    `https://choftjgjvcdnorbnpcmu.supabase.co/rest/v1/login_codes?email=eq.${EMAIL}&select=code,consumed&order=created_at.desc&limit=1`,
    { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } },
  )).json();
  const code = codes?.[0]?.code;
  console.log(`${stamp()} código: ${code} (consumed=${codes?.[0]?.consumed})`);
  const vg = await call("/api/auth/verify-code", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, code }),
  });
  console.log(`${stamp()} login: ${vg.status}`);
  if (vg.status !== 200) return;

  // 2. proyecto real para el flujo de persistencia
  const projects = await (await call("/api/projects")).json();
  const slug = projects?.projects?.[0]?.slug;
  console.log(`${stamp()} proyecto: ${slug ?? "(ninguno)"}`);

  // 3. TURNO 1 — exacto como el cliente
  const history = [];
  for (const [i, q] of ["curado de concreto", "cada cuánto se deben tomar muestras", "y qué pasa si no cumplen"].entries()) {
    console.log(`\n${stamp()} — TURNO ${i + 1}: "${q}"`);
    if (slug) {
      const pu = await call(`/api/projects/${slug}/conversations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: q }),
      });
      console.log(`${stamp()}   persist user: ${pu.status} ${(await pu.text()).slice(0, 120)}`);
    }
    const r = await call("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: q,
        history: history.slice(-6),
        projectSlug: slug ?? undefined,
      }),
    });
    const txt = await r.text();
    let body = {};
    try { body = JSON.parse(txt); } catch { body = { RAW: txt.slice(0, 200) }; }
    console.log(`${stamp()}   /api/chat: ${r.status} resp=${(body.response ?? body.error ?? body.RAW ?? "?").slice(0, 140)}`);
    if (r.status !== 200) { console.log(JSON.stringify(body).slice(0, 600)); return; }
    history.push({ role: "user", content: q }, { role: "assistant", content: String(body.response).slice(0, 2000) });
    if (slug) {
      const pa = await call(`/api/projects/${slug}/conversations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: body.response }),
      });
      console.log(`${stamp()}   persist assistant (${String(body.response).length} chars): ${pa.status} ${(await pa.text()).slice(0, 120)}`);
      if (pa.status !== 200) { console.log("   ⚠️ ESTO dispara el catch del cliente: error + mensaje borrado"); }
    }
  }
  console.log(`\n✅ 3 turnos consecutivos OK`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
