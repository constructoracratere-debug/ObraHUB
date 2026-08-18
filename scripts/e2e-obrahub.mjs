#!/usr/bin/env node
/**
 * ObraHub E2E — suite de verificación funcional completa.
 *
 * Uso:
 *   OBRahUB_BASE=http://localhost:3100 OBRahUB_CODE=313370 node scripts/e2e-obrahub.mjs
 *   OBRahUB_BASE=https://obra-hub-diego-pineda-s-projects.vercel.app OBRahUB_CODE=xxxx node scripts/e2e-obrahub.mjs
 *
 * OBRahUB_CODE = código de login vigente (generado por send-code o inyectado por el admin).
 * OBRahUB_SEED=1 además crea un proyecto demo completo ("Load Test — {ciudad}") con
 * presupuesto, vínculos, bitácora, RFI y baseline — para alimentar el sistema.
 */

const BASE = process.env.OBRahUB_BASE ?? "http://localhost:3100";
const CODE = process.env.OBRahUB_CODE ?? "";
const EMAIL = process.env.OBRahUB_EMAIL ?? "sofyarquitectura@gmail.com";
const SEED = process.env.OBRahUB_SEED === "1";

let cookie = "";
const results = [];

async function call(name, path, opts = {}, check = (r) => r.status) {
  try {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) },
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const kv = c.split(";")[0];
      if (kv.startsWith("sb-")) cookie = kv;
    }
    const ok = check(res);
    results.push({ name, ok, status: res.status });
    return res;
  } catch (e) {
    results.push({ name, ok: false, status: String(e.message).slice(0, 40) });
    return null;
  }
}

async function j(res) {
  try { return await res.json(); } catch { return {}; }
}

const mat = (n, q, u, p) => ({ name: n, qty: q, unit: u, unitPrice: p, subtotal: Math.round(q * p), source: "E2E-SISDOCES" });
const mo = (n, q, p) => ({ name: n, qty: q, unit: "h-h", unitPrice: p, subtotal: Math.round(q * p), source: "E2E-NSR10" });
const eq = (n, q, p) => ({ name: n, qty: q, unit: "día", unitPrice: p, subtotal: Math.round(q * p), source: "E2E-Alquiler" });

async function main() {
  console.log(`\n▶ ObraHub E2E — ${BASE} (${EMAIL})${SEED ? " + SEED" : ""}\n`);
  if (!CODE) { console.error("Falta OBRahUB_CODE"); process.exit(1); }

  // 1. Login
  const lg = await call("login (verify-code)", "/api/auth/verify-code", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, code: CODE }),
  }, (r) => r.status === 200);
  if (!lg || lg.status !== 200) return report();
  cookie = cookie || lg.headers.getSetCookie?.()[0]?.split(";")[0] || "";

  // 2. Portfolio
  const pf = await call("portfolio (cards+summary)", "/api/portfolio", {}, (r) => r.status === 200);
  if (pf) { const d = await j(pf); results[results.length - 1].ok = Array.isArray(d.cards) && d.summary != null; }

  // Proyecto de trabajo (nuevo si SEED, si no el más reciente del listado)
  let slug;
  if (SEED) {
    const cities = ["Bogotá", "Medellín", "Cali", "Cartagena", "Barranquilla"];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const pr = await call("seed: crear proyecto", "/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Load Test ${new Date().toISOString().slice(0,10)} — ${Math.random().toString(36).slice(2,6)}`, city }),
    }, (r) => r.status === 201);
    slug = (await j(pr)).project?.slug;
  } else {
    const pl = await call("listar proyectos", "/api/projects", {}, (r) => r.status === 200);
    slug = ((await j(pl)).projects ?? [])[0]?.slug;
  }
  if (!slug) { console.error("Sin proyecto de trabajo"); return report(); }
  console.log(`   · proyecto: ${slug}\n`);

  // 3. Tareas
  const tasks = [["Preliminares","2026-08-01","2026-08-08",100],["Excavación","2026-08-08","2026-08-18",55],["Cimentación","2026-08-15","2026-09-05",10],["Estructura","2026-09-01","2026-10-15",0]];
  const tr = await call("cronograma (crear tareas)", `/api/projects/${slug}/tasks`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: tasks.map(([name, startDate, endDate, progress]) => ({ name, startDate, endDate, progress })) }),
  }, (r) => r.status === 201);
  const tl = (await j(tr)).tasks ?? [];

  // 4. Presupuesto con desglose completo
  const item = (codigo, descripcion, unidad, cantidad, m, o, e, cd) => ({
    codigo, descripcion, unidad, cantidad, materiales: m, manoObra: o, equipos: e, costoDirecto: cd,
    aiu: { administracion: 13, imprevistos: 3, utilidad: 6 },
    precioUnitarioTotal: Math.round(cd * 1.22), subtotal: Math.round(cd * 1.22 * cantidad),
  });
  const budget = { titulo: `E2E Presupuesto ${new Date().toISOString().slice(0,10)}`, capitulos: [
    { nombre: "1. Preliminares", items: [item("1.1","Localización y replanteo","m2",400,[mat("Estacas",60,"un",1200)],[mo("Topógrafo",24,65000)],[eq("Estación total",2,120000)],2600)] },
    { nombre: "2. Cimentación", items: [
      item("2.1","Excavación a máquina","m3",350,[mat("ACPM",55,"gal",14500)],[mo("Operador",40,70000)],[eq("Retro 350L — alquiler/día",8,650000)],15000),
      item("2.2","Concreto 3000 psi zapatas","m3",90,[mat("Cemento 50kg",8.2,"bulto",34500),mat("Arena",0.55,"m3",78000)],[mo("Oficial",2.4,78000)],[eq("Vibrador 2HP",3,65000)],420000)] },
  ]};
  const cd = budget.capitulos.reduce((n,c)=>n+c.items.reduce((m,i)=>m+i.costoDirecto*i.cantidad,0),0);
  const st = budget.capitulos.reduce((n,c)=>n+c.items.reduce((m,i)=>m+i.subtotal,0),0);
  budget.resumen = { costosDirectos: Math.round(cd), aiuTotal: 22, valorAIU: Math.round(st-cd), subtotalConAIU: Math.round(st), iva: 19, valorIVA: Math.round(st*0.19), total: Math.round(st*1.19) };
  const br = await call("presupuesto (guardar completo)", `/api/projects/${slug}/budgets`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, source: "manual" }),
  }, (r) => r.status === 201);
  const bid = (await j(br)).id;

  // 5. Reabrir presupuesto — el recordatorio de TODO
  if (bid) {
    const rr = await call("presupuesto (reabrir con desglose)", `/api/projects/${slug}/budgets?id=${bid}`, {}, (r) => r.status === 200);
    if (rr) {
      const b = (await j(rr)).budget;
      const it = b?.capitulos?.[1]?.items?.[1];
      results[results.length-1].ok = (it?.materiales?.length ?? 0) > 0 && (it?.manoObra?.length ?? 0) > 0 && (it?.equipos?.length ?? 0) > 0;
    }
  }

  // 6. Vínculos
  const ctrl0 = await call("control (dashboard)", `/api/projects/${slug}/control`, {}, (r) => r.status === 200);
  const items0 = ctrl0 ? (await j(ctrl0)).items ?? [] : [];
  if (items0[0] && tl[0]) {
    await call("vínculo APU↔tarea", `/api/projects/${slug}/budgets`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: items0[0].id, taskId: tl[0].id }),
    }, (r) => r.status === 200);
  }

  // 7. Bitácora
  await call("bitácora (guardar día)", `/api/projects/${slug}/bitacora`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryDate: new Date(Date.now() - 86400000).toISOString().slice(0,10), weather: "lluvia", rainHours: 3, workersTotal: 8,
      workersDetail: { Oficial: 3, Ayudante: 5 }, equipment: { Retro: 1 }, observations: "E2E día", incidents: "", delays: "",
      taskProgress: tl.slice(0,2).map((t,i) => ({ taskId: t.id, progress: 50 + i * 10 })) }),
  }, (r) => r.status === 200);
  const bg = await call("bitácora (leer día)", `/api/projects/${slug}/bitacora?date=${new Date(Date.now()-86400000).toISOString().slice(0,10)}`, {}, (r) => r.status === 200);

  // 8. RFI + baseline
  const rf = await call("RFI (crear)", `/api/projects/${slug}/rfis`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "E2E — confirmación de detalle", assignee: "QA", dueDate: "2026-12-31" }),
  }, (r) => r.status === 201);
  const rfiId = (await j(rf)).rfi?.id;
  if (rfiId) await call("RFI (responder)", `/api/projects/${slug}/rfis`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: rfiId, status: "respondida", response: "E2E OK" }),
  }, (r) => r.status === 200);
  await call("baseline (congelar)", `/api/projects/${slug}/baselines`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "E2E" }),
  }, (r) => r.status === 201);

  // 9. Salud + actividad
  const ph = await call("project_health (portfolio card)", "/api/portfolio", {}, () => true);
  if (ph) { const d = await j(ph); const c = (d.cards ?? []).find(x => x.slug === slug); results[results.length-1].ok = !!c && (c.tasksTotal ?? 0) > 0; }
  await call("actividad (feed)", `/api/projects/${slug}/activity`, {}, (r) => r.status === 200);

  // 10. Exportaciones
  const zip = await call("export ZIP (proyecto)", `/api/projects/${slug}/export`, {}, (r) => r.status === 200);
  if (zip) { const buf = await zip.arrayBuffer(); results[results.length-1].ok = buf.byteLength > 2000 && new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4B; }
  const pptx = await call("informe PPTX (asamblea)", `/api/projects/${slug}/weekly-report`, {}, (r) => r.status === 200);
  if (pptx) { const buf = await pptx.arrayBuffer(); results[results.length-1].ok = buf.byteLength > 10000; }

  void bg;
  report();
}

function report() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  let pass = 0;
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    if (r.ok) pass++;
    console.log(`${mark}  ${r.name}  (${r.status})`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   ${pass}/${results.length} PASSED\n`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error("E2E fatal:", e); process.exit(1); });
