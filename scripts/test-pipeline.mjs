/**
 * ✅ CADENA DE OBRA — test determinístico offline.
 * takeoff → presupuesto APU → cronograma: mismos números siempre.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc -p scripts/tsconfig.pipeline.json", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const root = process.cwd();
const { takeoffToBudget, budgetToSchedule, chainSummary } = req(path.join(root, ".tmp-pipe", "pipeline.js"));
const { sanitizeFloorPlan } = req(path.join(root, ".tmp-pipe", "design", "schema.js"));

let pass = 0, fail = 0;
const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };

// Casa 2 pisos, 6 columnas, 3 espacios por nivel — el caso del usuario.
const plan = sanitizeFloorPlan({
  version: 1, name: "Casa Cadena", units: "m", levels: 2, floorToFloor: 3.0,
  outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "Sala", type: "sala", x: 0, y: 0, width: 4, depth: 3, level: 0 },
    { name: "Cocina", type: "cocina", x: 4, y: 0, width: 4, depth: 3, level: 0 },
    { name: "Alcoba 1", type: "habitacion", x: 0, y: 3, width: 4, depth: 3, level: 0 },
    { name: "Alcoba 2", type: "habitacion_principal", x: 0, y: 0, width: 4, depth: 3, level: 1 },
    { name: "Baño", type: "baño", x: 4, y: 0, width: 4, depth: 3, level: 1 },
    { name: "Estudio", type: "estudio", x: 0, y: 3, width: 8, depth: 3, level: 1 },
  ],
  doors: [{ from: "Sala", to: "Cocina", width: 0.9 }, { from: "Sala", to: "Alcoba 1", width: 0.9 }],
  windows: [{ room: "Sala", wall: "sur", x: 1, width: 1.2, sill: 1, height: 1.2 }],
});

// ── Presupuesto ────────────────────────────────────────────────────────────
const c1 = takeoffToBudget(plan);
const b = c1.budget;
check("presupuesto tiene título del plan", b.titulo.includes("Casa Cadena"));
check("hay capítulos ordenados (≥5)", b.capitulos.length >= 5);
check("capítulos en orden constructivo", b.capitulos[0].nombre.startsWith("1.") && /2\. Cimenta/.test(b.capitulos[1]?.nombre ?? ""));
check("zapatas caen en Cimentación", (b.capitulos.find((c) => c.nombre.includes("Cimentación"))?.items ?? []).some((i) => /zapata/i.test(i.descripcion)));
check("cada ítem tiene materiales + mano de obra", b.capitulos.every((c) => c.items.every((i) => i.materiales.length > 0 && i.manoObra.length > 0)));
check("AIU 10/3/10 en cada ítem", b.capitulos.every((c) => c.items.every((i) => i.aiu.administracion === 10 && i.aiu.imprevistos === 3 && i.aiu.utilidad === 10)));
check("costosDirectos = Σ(costoDirecto × cantidad) exacto", Math.abs(b.resumen.costosDirectos - b.capitulos.reduce((s, c) => s + c.items.reduce((x, i) => x + i.costoDirecto * i.cantidad, 0), 0)) < 1);
check("total > costosDirectos (AIU+IVA aplicados)", b.resumen.total > b.resumen.costosDirectos);
check("IVA 19% correcto", Math.abs(b.resumen.valorIVA - Math.round((b.resumen.costosDirectos + b.resumen.valorAIU) * 0.19)) <= 1);
check("línea con fuente de precio citada", c1.lines.every((l) => l.source.length > 0));

// Casa realista: 96 m² construidos en Colombia 2026 → COP entre 2.5M/m² piso bajo y tope alto
const m2 = plan.outline.width * plan.outline.depth * 2;
const copm2 = b.resumen.total / m2;
check(`presupuesto por m² realista (${Math.round(copm2).toLocaleString("es-CO")} COP/m², 96 m²)`, copm2 > 1_500_000 && copm2 < 6_500_000);

// Determinismo byte a byte.
const b2 = takeoffToBudget(sanitizeFloorPlan(JSON.parse(JSON.stringify(plan)))).budget;
check("determinístico: misma entrada → mismo total", b2.resumen.total === b.resumen.total);

// ── Cronograma ─────────────────────────────────────────────────────────────
const t = budgetToSchedule(b);
check("cronograma ≥ 5 fases + hito", t.length >= 6);
check("hito de entrega al final", t[t.length - 1].taskType === "milestone");
check("dependencias encadenadas (fase i depende de i-1)", t.slice(1, -1).every((x, i) => x.dependencies?.includes(t[i].name)));
check("fechas ISO válidas y ordenadas", t.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.startDate)) && t.slice(1).every((x, i) => x.startDate > t[i].startDate || x.startDate === t[i].startDate));
check("sin fines < inicios", t.every((x) => x.endDate >= x.startDate));
check("arranca un lunes", new Date(t[0].startDate + "T12:00:00").getDay() === 1);
check("fases citan presupuesto en descripción", t.slice(0, -1).every((x) => /\$/.test(x.description ?? "")));
const days = t.reduce((s, x) => s + Math.max(1, Math.round((new Date(x.endDate) - new Date(x.startDate)) / 86400000) + 1), 0);
check(`duración razonable casa 2 pisos (${days} días-hombre)`, days > 20 && days < 200);

// ── Resumen ────────────────────────────────────────────────────────────────
const sum = chainSummary(plan, c1, t);
check("resumen: área 96 m²", sum.area === 96);
check("resumen: total coincide", sum.budgetTotal === b.resumen.total);
check("resumen: 6 espacios", sum.rooms === 6);

console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
