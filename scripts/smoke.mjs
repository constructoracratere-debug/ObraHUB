/** Smoke post-deploy: la app SIRVE y sus chunks están íntegros.
 *  Falla → GitHub Actions marca el deploy en rojo (avisa por correo). */
const BASE = "https://obrahub-cratere.vercel.app";
const must = async (url, label, extra) => {
  const r = await fetch(url, { redirect: "manual" });
  if (r.status >= 400) { console.error(`❌ ${label}: HTTP ${r.status}`); process.exit(1); }
  if (extra && !(await r.text()).includes(extra)) { console.error(`❌ ${label}: contenido inesperado`); process.exit(1); }
  console.log(`✅ ${label}`);
  return r;
};
const login = await must(`${BASE}/login`, "login sirve");
const html = await (await fetch(`${BASE}/login`)).text();
const chunks = [...new Set(html.match(/\/_next\/static\/[^"']+\.js/g) ?? [])];
console.log(`   ${chunks.length} chunks referenciados`);
for (const c of chunks) await must(`${BASE}${c}`, `chunk ${c.slice(-18)}`);
await must(`${BASE}/sw.js`, "service worker v2", "obrahub");
console.log("🎉 SMOKE OK — producción viva e íntegra.");
