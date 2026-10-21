/**
 * QA DE EXPORTACIONES — genera los entregables reales (DXF por lámina + IFC)
 * para una batería de proyectos REPRESENTATIVOS y los deja en .tmp-qa/ para:
 *   · scripts/plot-preview.py  → PDF/PNG ploteados al tamaño de papel declarado
 *   · scripts/qa-ifc.py        → validación IFC independiente (ifcopenshell)
 *
 * Fixtures:
 *   guadua  — réplica del caso reportado (Vivienda Guadúa Manizales): casa
 *             1 nivel ~10.5×8 m, MEP denso en cocina/baño/lavandería.
 *   doble   — misma casa a 2 niveles (láminas A-01/A-01.2, storeys apilados).
 *   largos  — nombres largos de proyecto/lámina (régimen del rótulo).
 *
 * Ejecutar: node scripts/qa-exports.mjs
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, ".tmp-qa");
mkdirSync(outDir, { recursive: true });

const tmp = path.join(root, ".tmp-design-test");
execSync(
  `npx tsc lib/design/schema.ts lib/design/dxf.ts lib/design/plot.ts lib/design/views.ts lib/design/knowledge.ts lib/design/symbols.ts lib/design/sheets.ts lib/design/materials.ts lib/design/ifc.ts lib/structural/plan.ts lib/structural/loads.ts --outDir "${tmp}" --module commonjs --target es2022 --skipLibCheck --esModuleInterop`,
  { cwd: root, stdio: "pipe" },
);

const { createRequire } = await import("node:module");
const req = createRequire(import.meta.url);
const { sanitizeFloorPlan } = req(path.join(tmp, "design", "schema.js"));
const { planToDxfSheets, planToDxf } = req(path.join(tmp, "design", "dxf.js"));
const { planToPdfSet, pdfBytes } = req(path.join(tmp, "design", "plot.js"));
const { planToIfc } = req(path.join(tmp, "design", "ifc.js"));

// ── Fixture: Vivienda Guadúa Manizales (caso reportado) ─────────────────────
const guadua = {
  version: 2,
  name: "Vivienda Guadúa Manizales",
  levels: 1,
  floorToFloor: 2.6,
  outline: { width: 10.5, depth: 8.0 },
  wallThickness: { exterior: 0.12, interior: 0.10 },
  site: { city: "Manizales", department: "Caldas" },
  rooms: [
    { name: "Sala", type: "sala", x: 0.12, y: 0.12, width: 4.2, depth: 3.9, level: 0 },
    { name: "Cocina", type: "cocina", x: 4.42, y: 0.12, width: 3.6, depth: 2.6, level: 0 },
    { name: "Lavandería", type: "lavanderia", x: 8.12, y: 0.12, width: 2.26, depth: 2.6, level: 0 },
    { name: "Comedor", type: "comedor", x: 4.42, y: 2.82, width: 3.6, depth: 1.2, level: 0 },
    { name: "Alcoba 1", type: "habitacion", x: 0.12, y: 4.12, width: 3.3, depth: 3.76, level: 0 },
    { name: "Baño 1", type: "bano", x: 3.52, y: 4.12, width: 1.6, depth: 2.2, level: 0 },
    { name: "Alcoba Principal", type: "habitacion_principal", x: 5.22, y: 4.12, width: 3.4, depth: 3.76, level: 0 },
    { name: "Baño Social", type: "bano", x: 8.72, y: 4.12, width: 1.66, depth: 2.0, level: 0 },
  ],
  doors: [
    { from: "exterior", to: "Sala", x: 1.6, y: 0.12, width: 0.9, hinge: "left", swing: "in", level: 0 },
    { from: "Sala", to: "Cocina", x: 4.42, y: 1.4, width: 0.75, hinge: "left", swing: "in", level: 0 },
    { from: "Comedor", to: "Lavandería", x: 8.12, y: 1.6, width: 0.7, hinge: "right", swing: "in", level: 0 },
    { from: "Sala", to: "Alcoba 1", x: 2.4, y: 4.12, width: 0.75, hinge: "left", swing: "in", level: 0 },
    { from: "Pasillo", to: "Baño 1", x: 3.52, y: 4.6, width: 0.65, hinge: "left", swing: "in", level: 0 },
    { from: "Comedor", to: "Alcoba Principal", x: 5.92, y: 4.12, width: 0.8, hinge: "right", swing: "in", level: 0 },
    { from: "Alcoba Principal", to: "Baño Social", x: 8.72, y: 4.6, width: 0.65, hinge: "left", swing: "in", level: 0 },
  ],
  windows: [
    { room: "Sala", wall: "sur", x: 2.9, width: 1.6, sill: 0.9, height: 1.2, level: 0 },
    { room: "Sala", wall: "oeste", x: 2.4, width: 1.2, sill: 1.0, height: 1.1, level: 0 },
    { room: "Cocina", wall: "sur", x: 5.9, width: 1.2, sill: 1.0, height: 1.1, level: 0 },
    { room: "Lavandería", wall: "este", x: 1.4, width: 0.8, sill: 1.2, height: 0.9, level: 0 },
    { room: "Alcoba 1", wall: "oeste", x: 5.6, width: 1.2, sill: 1.0, height: 1.1, level: 0 },
    { room: "Alcoba 1", wall: "norte", x: 1.8, width: 1.2, sill: 1.0, height: 1.1, level: 0 },
    { room: "Alcoba Principal", wall: "norte", x: 6.6, width: 1.5, sill: 0.9, height: 1.3, level: 0 },
    { room: "Baño Social", wall: "este", x: 4.9, width: 0.6, sill: 1.5, height: 0.8, level: 0 },
  ],
  structure: {
    system: "mixto",
    justification: "Bahareque encementado (guadúa) confinado NSR-10 E.3/M.2",
    axes: [
      { id: "A", orientation: "vertical", at: 0.12 },
      { id: "B", orientation: "vertical", at: 4.32 },
      { id: "C", orientation: "vertical", at: 8.12 },
      { id: "D", orientation: "vertical", at: 10.38 },
      { id: "1", orientation: "horizontal", at: 0.12 },
      { id: "2", orientation: "horizontal", at: 4.12 },
      { id: "3", orientation: "horizontal", at: 7.88 },
    ],
  },
  electrical: {
    points: [
      { kind: "tablero", room: "Sala", x: 0.45, y: 0.45, level: 0 },
      { kind: "iluminacion", room: "Sala", x: 2.1, y: 2.0, level: 0 },
      { kind: "iluminacion", room: "Cocina", x: 6.2, y: 1.4, level: 0 },
      { kind: "iluminacion", room: "Alcoba 1", x: 1.7, y: 5.9, level: 0 },
      { kind: "iluminacion", room: "Alcoba Principal", x: 6.9, y: 5.9, level: 0 },
      { kind: "tomacorriente", room: "Sala", x: 0.5, y: 1.6, level: 0 },
      { kind: "tomacorriente", room: "Sala", x: 4.0, y: 3.5, level: 0 },
      { kind: "tomacorriente", room: "Cocina", x: 4.8, y: 0.5, level: 0 },
      { kind: "tomacorriente", room: "Cocina", x: 7.6, y: 2.3, level: 0 },
      { kind: "tomacorriente", room: "Alcoba 1", x: 0.5, y: 5.2, level: 0 },
      { kind: "tomacorriente", room: "Alcoba Principal", x: 8.3, y: 5.2, level: 0 },
      { kind: "interruptor", room: "Sala", x: 1.1, y: 0.45, level: 0 },
      { kind: "interruptor", room: "Alcoba 1", x: 2.8, y: 4.4, level: 0 },
    ],
    notes: "circuitos separados RETIE",
  },
  hydro: {
    points: [
      { kind: "sanitario", room: "Baño 1", x: 4.9, y: 5.9, level: 0 },
      { kind: "lavamanos", room: "Baño 1", x: 3.8, y: 4.3, level: 0 },
      { kind: "ducha", room: "Baño Social", x: 9.5, y: 5.6, level: 0 },
      { kind: "lavamanos", room: "Baño Social", x: 8.9, y: 4.4, level: 0 },
      { kind: "lavaplatos", room: "Cocina", x: 5.2, y: 0.5, level: 0 },
      { kind: "lavadero", room: "Lavandería", x: 8.4, y: 0.45, level: 0 },
    ],
    notes: "húmedas agrupadas RAS",
  },
};

const doble = sanitizeFloorPlan({
  ...guadua,
  name: "Vivienda Guadúa Manizales — Doble",
  levels: 2,
  rooms: [
    ...guadua.rooms,
    { name: "Estudio N2", type: "estudio", x: 0.12, y: 0.12, width: 3.6, depth: 3.0, level: 1 },
    { name: "Alcoba Huéspedes N2", type: "habitacion", x: 3.82, y: 0.12, width: 3.2, depth: 3.5, level: 1 },
    { name: "Baño N2", type: "bano", x: 7.12, y: 0.12, width: 1.7, depth: 2.2, level: 1 },
    { name: "Terraza N2", type: "balcon", x: 3.82, y: 3.42, width: 5.0, depth: 2.6, level: 1 },
  ],
  electrical: { ...guadua.electrical, points: [...guadua.electrical.points, { kind: "iluminacion", room: "Estudio N2", x: 1.8, y: 1.6, level: 1 }] },
});

const largos = sanitizeFloorPlan({
  ...guadua,
  name: "Ampliación Vivienda Guadúa del Conjunto Los Yarumos de Manizales Etapa II — Licencia Modalidad Obra Nueva",
});

// ── Generación de entregables ────────────────────────────────────────────────
const fixtures = [
  ["guadua", sanitizeFloorPlan(guadua)],
  ["doble", doble],
  ["largos", largos],
];

// El fixture crudo también a disco (para sondas/debug de composición).
writeFileSync(path.join(outDir, "guadua-raw.json"), JSON.stringify(guadua, null, 2), "utf8");

const files = [];
for (const [slug, plan] of fixtures) {
  for (const s of planToDxfSheets(plan, { fecha: "2026-10-13" })) {
    const name = `${slug}-${s.code.toLowerCase()}.dxf`;
    writeFileSync(path.join(outDir, name), s.dxf, "utf8");
    files.push(name);
  }
  writeFileSync(path.join(outDir, `${slug}.ifc`), planToIfc(plan), "utf8");
  files.push(`${slug}.ifc`);
  writeFileSync(path.join(outDir, `${slug}-set.pdf`), pdfBytes(planToPdfSet(plan, { fecha: "2026-10-13" })));
}

console.log(`✅ ${files.length} entregables en ${outDir}`);
console.log(files.join("\n"));
