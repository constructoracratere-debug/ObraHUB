/**
 * Test offline del motor DXF — FORMATO OBRAHUB 700×500 (R2007).
 * Genera un plan hardcodeado → string DXF → asserts estructurales +
 * validación con ezdxf (si hay python disponible).
 * Ejecutar: node scripts/test-design-dxf.mjs
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const tmp = path.join(root, ".tmp-design-test");
execSync(`npx tsc lib/design/schema.ts lib/design/dxf.ts lib/design/views.ts lib/design/knowledge.ts lib/design/symbols.ts lib/design/sheets.ts lib/design/materials.ts lib/structural/plan.ts lib/structural/loads.ts --outDir "${tmp}" --module commonjs --target es2022 --skipLibCheck --esModuleInterop`, { cwd: root, stdio: "pipe" });

const { createRequire } = await import("node:module");
const req = createRequire(import.meta.url);
// rootDir de tsc = el común de fuentes (lib/) → salida en tmp/design/*.
const { sanitizeFloorPlan } = req(path.join(tmp, "design", "schema.js"));
const { planToDxf } = req(path.join(tmp, "design", "dxf.js"));

const rawPlan = {
  version: 2,
  name: "Apto Test 2 Alcobas",
  levels: 1,
  floorToFloor: 2.6,
  outline: { width: 8.5, depth: 7.0 },
  wallThickness: { exterior: 0.15, interior: 0.10 },
  site: { city: "Bogotá", department: "Cundinamarca" },
  rooms: [
    { name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.6, depth: 3.4, level: 0 },
    { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4.5, depth: 2.4, level: 0 },
    { name: "Alcoba 1", type: "habitacion", x: 0.15, y: 3.65, width: 3.0, depth: 3.2, level: 0 },
    { name: "Baño 1", type: "bano", x: 3.25, y: 3.65, width: 1.5, depth: 2.0, level: 0 },
    { name: "Alcoba Principal", type: "habitacion_principal", x: 4.85, y: 2.65, width: 3.5, depth: 4.2, level: 0 },
  ],
  doors: [
    { from: "exterior", to: "Sala", x: 1.9, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 },
    { from: "Sala", to: "Alcoba 1", x: 1.6, y: 3.65, width: 0.75, hinge: "right", swing: "in", level: 0 },
  ],
  windows: [
    { room: "Sala", wall: "sur", x: 1.9, width: 1.5, sill: 0.9, height: 1.2, level: 0 },
    { room: "Alcoba 1", wall: "oeste", x: 4.5, width: 1.2, sill: 1.0, height: 1.1, level: 0 },
  ],
  structure: {
    system: "concreto",
    justification: "Mampostería confinada NSR-10 A.3/E.3",
    axes: [
      { id: "A", orientation: "vertical", at: 0.15 },
      { id: "B", orientation: "vertical", at: 4.35 },
      { id: "C", orientation: "vertical", at: 8.35 },
      { id: "1", orientation: "horizontal", at: 0.15 },
      { id: "2", orientation: "horizontal", at: 3.65 },
      { id: "3", orientation: "horizontal", at: 6.85 },
    ],
  },
  electrical: {
    points: [
      { kind: "tablero", room: "Sala", x: 0.5, y: 0.5, level: 0 },
      { kind: "iluminacion", room: "Sala", x: 1.95, y: 1.85, level: 0 },
      { kind: "tomacorriente", room: "Sala", x: 0.5, y: 1.2, level: 0 },
      { kind: "interruptor", room: "Sala", x: 1.5, y: 0.4, level: 0 },
    ],
    notes: "circuitos separados",
  },
  hydro: {
    points: [
      { kind: "sanitario", room: "Baño 1", x: 4.4, y: 5.35, level: 0 },
      { kind: "lavamanos", room: "Baño 1", x: 3.7, y: 4.0, level: 0 },
      { kind: "lavaplatos", room: "Cocina", x: 6.0, y: 0.6, level: 0 },
    ],
    notes: "agrupar húmedas",
  },
};

const plan = sanitizeFloorPlan(rawPlan);
const dxf = planToDxf(plan);
// Multi-nivel (idea del review Codex): lámina por piso + capas -N.
const multiLevelPlan = sanitizeFloorPlan({
  ...rawPlan,
  name: "Apto Test Doble",
  levels: 2,
  rooms: [...rawPlan.rooms, { name: "Sala N2", type: "sala", x: 0.15, y: 0.15, width: 3.6, depth: 3.4, level: 1 }],
  electrical: {
    ...rawPlan.electrical,
    points: [...rawPlan.electrical.points, { kind: "iluminacion", room: "Sala N2", x: 1.5, y: 1.5, level: 1 }],
  },
});
const multiDxf = planToDxf(multiLevelPlan, { fecha: "2026-01-15" });

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

console.log("Test motor DXF — Formato OBRAHUB 700×500 (R2000)\n");

// ── Escritor R2007 con disciplina de plumillas ISO 128 ──────────────────────
check("header R2007 (AC1021, UTF-8 nativo)", dxf.includes("$ACADVER") && dxf.includes("AC1021"));
check("unidades mm de lámina (INSUNITS 4)", /\$INSUNITS\n70\n4/.test(dxf));
check("LTYPE CONTINUOUS/DASHED/CENTER definidos", ["CONTINUOUS", "DASHED", "CENTER"].every((lt) => dxf.includes(`0\nLTYPE\n2\n${lt}\n`)));
check("LTYPE CENTER con patrón real (73/49)", /LTYPE\n2\nCENTER\n[\s\S]*?73\n4\n40\n20/.test(dxf));
check("A-MUROS con GROSOR de corte (370=70 → 0.70 mm)", /LAYER\n2\nA-MUROS\n70\n0\n62\n[-\d]+\n6\nCONTINUOUS\n370\n70/.test(dxf));
check("A-EJES con linetype CENTER y trazo 0.13", /LAYER\n2\nA-EJES\n[\s\S]*?6\nCENTER\n370\n13/.test(dxf));
check("I-ELECTRICO DASHED fino 0.25", /LAYER\n2\nI-ELECTRICO\n[\s\S]*?6\nDASHED\n370\n25/.test(dxf));
check("jerarquía ISO completa en tabla (70/35/25/13)", [70, 35, 25, 13].every((lw) => new RegExp(`370\\n${lw}`).test(dxf)));

// ── Integridad capa↔entidad (el bug histórico de capas fantasma) ────────────
const tableNames = [...dxf.matchAll(/0\nLAYER\n2\n([^\n]+)\n/g)].map((m) => m[1]);
// Anclado a tipo de entidad: un color 62→8 en la tabla NO es una capa "8".
const entityLayers = new Set([...dxf.matchAll(/0\n(?:LINE|POLYLINE|VERTEX|SEQEND|CIRCLE|ARC|TEXT)\n8\n([^\n]+)\n/g)].map((m) => m[1]));
const phantoms = [...entityLayers].filter((l) => !tableNames.includes(l));
check(`toda entidad vive en una capa de la tabla (${entityLayers.size} capas usadas, ${phantoms.length} fantasma)`, phantoms.length === 0);
check("nomenclatura A/E/I profesional", ["A-MUROS", "A-PUERTAS", "I-ELECTRICO", "I-HIDRAULICO"].every((n) => tableNames.includes(n)));

// ── Multi-nivel: lámina por piso, capas GLOBALES (review #11) ────────────────
check("2 niveles → lámina A-01.2", multiDxf.includes("A-01.2"));
check("capas GLOBALES por categoría: 0 sufijos -N (apagar A-MUROS = todos los niveles)", (() => {
  const declared = [...multiDxf.matchAll(/0\nLAYER\n2\n([^\n]+)/g)].map((m) => m[1]);
  return declared.includes("A-MUROS") && declared.includes("A-CORTE") && declared.every((n) => !/-N\d+$/.test(n));
})());
check("multi-nivel: 0 entidades en capa no declarada", (() => {
  const declared = new Set([...multiDxf.matchAll(/0\nLAYER\n2\n([^\n]+)/g)].map((m) => m[1]));
  const used = [...multiDxf.matchAll(/0\n(?:LINE|POLYLINE|VERTEX|SEQEND|CIRCLE|ARC|TEXT)\n8\n([^\n]+)/g)].map((m) => m[1]);
  return used.length > 0 && used.every((l) => declared.has(l));
})());
check("fecha del rótulo la pone quien llama (no el reloj)", multiDxf.includes("2026-01-15") && planToDxf(plan) === planToDxf(plan));

// ── Vanos REALES: el muro se parte en jambas (guía §2.3/§2.6) ───────────────
check("ventanas/aberturas recortan la banda del muro", (() => {
  const { plantaPrimitives } = req(path.join(tmp, "design", "views.js"));
  const fMuros = (p) => p.filter((q) => q.t === "F" && q.l === "MUROS").length;
  const conVanos = fMuros(plantaPrimitives(plan));
  const sinVanos = fMuros(plantaPrimitives({ ...plan, windows: [], doors: [] }));
  return conVanos > sinVanos;
})());

// ── Leyenda MEP explicada (guía §Símbolos) ───────────────────────────────────
check("leyenda SIMBOLOGÍA MEP en A-01", dxf.includes("SIMBOLOGÍA MEP"));
check("leyenda describe símbolos presentes", dxf.includes("TOMACORRIENTE") && dxf.includes("SANITARIO"));

// ── Tabla de impresión CPNAA §4.3 (págs. 100-101) — fuente única ────────────
check("plotMm: filas literales de la tabla", (() => {
  const { plotMm } = req(path.join(tmp, "design", "knowledge.js"));
  return plotMm("cut", 20) === 0.7 && plotMm("cut", 50) === 0.6 && plotMm("cut", 500) === 0.15
    && plotMm("text", 500) === 0.2 && plotMm("hid", 50) === 0.13 && plotMm("ejes", 200) === 0.13;
})());
check("plotMm: interpola escalas intermedias (1:75 → cut 0.55)", (() => {
  const { plotMm } = req(path.join(tmp, "design", "knowledge.js"));
  return plotMm("cut", 75) === 0.55 && plotMm("elec", 75) === 0.14;
})());
check("370 por ENTIDAD a la escala real de la lámina (A-01 @1:50 → cut 0.60)", /8\nA-MUROS\n370\n60\n/.test(dxf));
check("achurado EN A-MUROS con 370 de la fila achu (0.30 @1:50) — apagar muros apaga el hatch", /8\nA-MUROS\n370\n30\n/.test(dxf) && !dxf.includes("ACHU"));
check("estructura por tipo: S-COLUMNAS/S-VIGAS/S-LOSAS en tabla", (() => {
  const declared = [...dxf.matchAll(/0\nLAYER\n2\n([^\n]+)/g)].map((m) => m[1]);
  return ["S-COLUMNAS", "S-VIGAS", "S-LOSAS"].every((n) => declared.includes(n)) && !declared.includes("S-ELEMENTOS");
})());
check("STYLE portable OBRAHUB (txt.shx) + código 7 en TEXT", dxf.includes("2\nSTYLE") && /0\nTEXT\n8\n[^\n]+\n(?:370\n\d+\n)?7\nOBRAHUB\n10\n/.test(dxf));
check("DXF por lámina: N archivos, cada uno 700×500 en origen con su rótulo", (() => {
  const { planToDxfSheets } = req(path.join(tmp, "design", "dxf.js"));
  const files = planToDxfSheets(plan, { fecha: "2026-01-15" });
  return files.length >= 6
    && files.every((f) => f.dxf.startsWith("0\nSECTION") && f.dxf.trimEnd().endsWith("0\nEOF") && f.dxf.includes(`${f.code} / 1`) && /10\n5\.000\n20\n5\.000/.test(f.dxf))
    && new Set(files.map((f) => f.code)).size === files.length;
})());
check("símbolos F ≠ poché: SOLID macizo (marca de corte en A-CORTE)", /0\nSOLID\n8\nA-CORTE\n/.test(dxf));
check("SOLID también lleva 370 de entidad (política única de grosor)", /0\nSOLID\n8\nA-CORTE\n370\n60\n/.test(dxf));
check("plantilla de capa conserva default ISO (370=70 en tabla A-MUROS)", /LAYER\n2\nA-MUROS\n70\n0\n62\n[-\d]+\n6\nCONTINUOUS\n370\n70/.test(dxf));
check("flags de primitiva pasan al DXF: dash → 6 DASHED en entidad", /8\nA-PUERTAS\n6\nDASHED\n370\n13\n/.test(dxf));
check("flags de primitiva: ejes discontinuos conservan CENTER", /8\nA-EJES\n6\nCENTER\n370\n13\n/.test(dxf));
check("cotas finas (thin → 0.20×0.72 = 0.14 mm @1:50)", /8\nA-COTAS\n370\n14\n/.test(dxf));
check("scaleBarMm: presets que nunca desbordan", (() => {
  const { scaleBarMm } = req(path.join(tmp, "design", "knowledge.js"));
  const b50 = scaleBarMm(20, 58);   // 1:50 → 5m=100mm no cabe → 2m=40mm
  const b100 = scaleBarMm(10, 58);  // 1:100 → 5m=50mm sí
  const b20 = scaleBarMm(50, 58);   // 1:20 → hasta 1m=50mm
  return b50.total === 2 && b50.totalMm <= 58 && b100.total === 5 && b100.totalMm === 50 && b20.total === 1 && b20.totalMm <= 58;
})());

// ── Anotación a TAMAÑO DE PAPEL (guía §2.5 + libro h≥2.5) ────────────────────
check("todo TEXT imprime ≥2.2 mm (piso 2.5; exentos numerales/símbolos 2.2)", (() => {
  const chunks = dxf.split("0\nTEXT\n").slice(1);
  const heights = chunks.map((c) => Number((c.match(/40\n(\d+\.\d{3})\n/) ?? [0, "99"])[1]));
  return heights.length > 100 && heights.every((h) => h >= 2.19) && heights.some((h) => h >= 2.5);
})());
check("lámina A-00 índice + simbología abre el set", dxf.includes("A-00") && dxf.includes("ÍNDICE DEL SET"));
check("REVISÓ veraz: pendiente hasta firma profesional", dxf.includes("PENDIENTE DE REVISIÓN") && !dxf.includes("ING. MATRICULADO"));
check("cotas sin traslape al TAMAÑO FINAL (1:50/1:100/1:200, rotadas incluidas)", (() => {
  const { plantaPrimitives } = req(path.join(tmp, "design", "views.js"));
  const labels = plantaPrimitives(plan).filter((p) => p.t === "T" && p.l === "COTAS");
  const clashes = (den) => {
    const floor = 2.5 * den / 1000; // piso 2.5 mm en unidades de modelo
    const L = labels.map((t) => ({ ...t, hE: Math.max(t.h, floor) }));
    let bad = 0;
    const H = L.filter((t) => (t.r ?? 0) !== 90);
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
      const a = H[i], b = H[j];
      if (Math.abs(a.y - b.y) > Math.max(a.hE, b.hE) * 0.9) continue; // distinto renglón
      if (Math.min(a.x + a.s.length * a.hE * 0.62, b.x + b.s.length * b.hE * 0.62) - Math.max(a.x, b.x) > 0.03) bad++;
    }
    const V = L.filter((t) => (t.r ?? 0) === 90);
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const a = V[i], b = V[j];
      if (Math.abs(a.x - b.x) > Math.max(a.hE, b.hE) * 0.9) continue; // distinta columna
      if (Math.min(a.y + a.s.length * a.hE * 0.62, b.y + b.s.length * b.hE * 0.62) - Math.max(a.y, b.y) > 0.03) bad++;
    }
    return bad;
  };
  const res = [50, 100, 200].map(clashes);
  return res.every((n) => n === 0);
})());

// ── Lámina general 700×500 con rótulo OBRAHUB ────────────────────────────────
check("set completo A-01…A-05", ["A-01", "A-02", "A-03", "A-04", "A-05"].every((c) => dxf.includes(c)));
check("marca OBRAHUB en rótulo", dxf.includes("OBRAHUB"));
check("sin universidad (formato propio)", !/UNIVERSIDAD/i.test(dxf));
check("rótulo: PROYECTO/UBICACIÓN/ESCALA/DIBUJÓ/REVISÓ/LÁMINA", ["PROYECTO", "UBICACI", "ESCALA", "DIBUJ", "REVIS", "LÁMINA"].every((s) => dxf.includes(s)));
check("escala normalizada 1:50…1:200", /1:(50|75|100|125|150|200)/.test(dxf));
check("BOGOTÁ del site en el rótulo", dxf.includes("BOGOT"));
// 5 láminas de 700mm con gap 50: frames exteriores en x=0,750,1500,2250,3000
check("marcos exteriores cada 750 mm", [0, 750, 1500, 2250, 3000].every((x) => new RegExp(`10\\n${x + 5}\\.000\\n20\\n5\\.000`).test(dxf)));
check("marco interior a 10 mm (doble filete)", /20\n10\.000[\s\S]{0,140}10\n690\.000[\s\S]{0,60}20\n10\.000/.test(dxf));

// ── Contenido del motor de vistas (Ching/Neufert) ───────────────────────────
check("entidades LINE presentes", (dxf.match(/0\nLINE\n/g) ?? []).length > 50);
check("contornos POLYLINE con VERTEX ≥ 2 balanceados", (() => {
  const polylines = dxf.split("0\nPOLYLINE\n").slice(1);
  return polylines.length >= 10 && polylines.every((pl) => (pl.split("0\nSEQEND\n")[0].match(/0\nVERTEX\n/g) ?? []).length >= 2);
})());
check("MEP: círculos I-ELECTRICO e I-HIDRAULICO en A-01", entityLayers.has("I-ELECTRICO") && entityLayers.has("I-HIDRAULICO"));
check("TEXT con nombre de espacios", dxf.includes("ALCOBA PRINCIPAL") || dxf.includes("Alcoba Principal"));
check("cota total 8.50 en planta", dxf.includes("8.50"));
check("cortes A-A' y B-B' presentes", dxf.includes("CORTE A-A'") && dxf.includes("CORTE B-B'"));
check("fachadas rotuladas", /FACHADA (NORTE|SUR)/.test(dxf));
check("cuadro de áreas dibujado", /CUADRO DE/.test(dxf));
check("flecha de norte en rótulo", /TEXT\n8\nA-ROTULO-TXT\n[\s\S]{0,120}1\nN\n/.test(dxf));
check("escala gráfica en metros (rótulo)", /40\n2\.200\n1\nm\n/.test(dxf));

// ── Determinismo y sanidad ───────────────────────────────────────────────────
const dxf2 = planToDxf(sanitizeFloorPlan(rawPlan));
check("determinismo byte a byte", dxf === dxf2);
check("EOF final", dxf.trimEnd().endsWith("0\nEOF"));
check(`tamaño razonable (${(dxf.length / 1024).toFixed(1)} KB)`, dxf.length < 450_000);
const clamped = sanitizeFloorPlan({ ...rawPlan, rooms: [{ ...rawPlan.rooms[0], x: 999, width: -5 }] });
check("sanitizador clampa x y width", clamped.rooms[0].x <= clamped.outline.width && clamped.rooms[0].width >= 0.9);

// ── ezdxf (validador profesional — como lo abriría AutoCAD/LibreCAD) ────────
if (process.env.SKIP_EZDXF !== "1") {
  let hasEzdxf = false;
  try {
    execSync(`python -c "import ezdxf"`, { stdio: "pipe" });
    hasEzdxf = true;
  } catch {
    // CI sin python: soft-skip, los 32 asserts estructurales ya corrieron.
  }
  if (!hasEzdxf) {
    console.log("ℹ ezdxf no instalado — validación profesional omitida (soft skip)");
  } else {
    try {
      const { writeFileSync } = await import("node:fs");
      const out = path.join(root, "test-output.dxf");
      writeFileSync(out, dxf, "utf8");
      const py = execSync(
        `python -c "import ezdxf,sys; d=ezdxf.readfile(r'${out}'); ms=d.modelspace(); lws={l.dxf.name:l.dxf.lineweight for l in d.layers}; assert lws.get('A-MUROS')==70, lws; assert lws.get('A-EJES')==13, lws; n=len(ms); assert n>200, n; print('ezdxf OK', n, 'entidades,', len(d.layers), 'capas')"`,
        { encoding: "utf8", stdio: "pipe" },
      ).trim();
      check(`ezdxf parsea: ${py}`, py.startsWith("ezdxf OK"));
    } catch (e) {
      check(`ezdxf valida el archivo (${String(e).split("\n")[0].slice(0, 60)})`, false);
    }
  }
}

console.log(`\n${pass} pasan · ${fail} fallan`);
if (fail > 0) {
  console.log(`DXF de depuración: ${path.join(root, "test-output.dxf")}`);
  process.exit(1);
}
console.log("✅ Motor DXF OK");
