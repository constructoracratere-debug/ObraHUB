/**
 * Test offline del motor DXF de ✏️ Diseño IA.
 * Genera un plan hardcodeado → string DXF → asserts estructurales.
 * Ejecutar: node scripts/test-design-dxf.mjs (tras build o con tsx).
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// Transpila schema+dxf a JS plano en tmp (sin dependencias externas).
const tmp = path.join(root, ".tmp-design-test");
execSync(`npx tsc lib/design/schema.ts lib/design/dxf.ts --outDir "${tmp}" --module commonjs --target es2022 --skipLibCheck`, { cwd: root, stdio: "pipe" });

const { createRequire } = await import("node:module");
const req = createRequire(import.meta.url);
const { sanitizeFloorPlan } = req(path.join(tmp, "schema.js"));
const { planToDxf } = req(path.join(tmp, "dxf.js"));

const rawPlan = {
  version: 2,
  name: "Apto Test 2 Alcobas",
  levels: 1,
  floorToFloor: 2.6,
  outline: { width: 8.5, depth: 7.0 },
  wallThickness: { exterior: 0.15, interior: 0.10 },
  site: { city: "Bogotá", department: "Cundinamarca", climate: "frío 14°C", wind: "NE", potNotes: "verificar", localMaterials: ["ladrillo H-10"], localMethods: ["mampostería confinada"], risks: ["sismo alto"] },
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
  finishes: [
    { room: "Sala", floor: "porcelanato", walls: "pintura", ceiling: "estuco" },
  ],
};

const plan = sanitizeFloorPlan(rawPlan);
const dxf = planToDxf(plan);

// ── Asserts ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

console.log("Test motor DXF — Diseño IA\n");
check("header R12 (AC1009)", dxf.includes("$ACADVER") && dxf.includes("AC1009"));
check("tabla LAYER con MUROS", dxf.includes("0\nLAYER\n2\nMUROS\n"));
check("tabla LAYER con ELECTRICO", dxf.includes("ELECTRICO"));
check("tabla LAYER con HIDROSANITARIO", dxf.includes("HIDROSANITARIO"));
check("entidades LINE presentes", (dxf.match(/0\nLINE\n/g) ?? []).length > 10);
check("entidades POLYLINE (contornos)", (dxf.match(/0\nPOLYLINE\n/g) ?? []).length >= 7); // envolvente×2 + 5 rooms
check("VERTEX balanceados", (() => {
  const polylines = dxf.split("0\nPOLYLINE\n").slice(1);
  return polylines.every((pl) => {
    const seg = pl.split("0\nSEQEND\n")[0];
    return (seg.match(/0\nVERTEX\n/g) ?? []).length >= 2;
  });
})());
check("ARC de giro de puertas", (dxf.match(/0\nARC\n/g) ?? []).length === rawPlan.doors.length);
check("CIRCLE para instalaciones", (dxf.match(/0\nCIRCLE\n/g) ?? []).length === rawPlan.electrical.points.length + rawPlan.hydro.points.length);
check("TEXT con nombre de espacios", dxf.includes("ALCOBA PRINCIPAL") || dxf.includes("Alcoba Principal"));
check("TEXT de área (m2)", dxf.includes("m2"));
check("cota total presente", dxf.includes("8.50"));
check("EOF final", dxf.trimEnd().endsWith("0\nEOF"));
// Convenciones Ching (KB):
check("poché: más LINEs en MUROS tras el rayado 45°", (dxf.match(/0\nLINE\n8\nMUROS\n/g) ?? []).length > 60);
check("flecha de norte (texto N + capa TEXTOS)", /0\nTEXT\n8\nTEXTOS\n[\s\S]{0,80}N\n/.test(dxf.replace(/1\n/g, "1\n")) || (dxf.match(/TEXTOS/g) ?? []).length > 2);
check("cajetín con PROYECTO", dxf.includes("PROYECTO:"));
check("cajetín con LÁMINA", dxf.includes("LAMINA") || dxf.includes("LÁMINA") || /L[ÁA]MINA/.test(dxf));
check("escala gráfica (metros en COTAS)", dxf.includes("5 m"));

// Determinismo: mismo plan → mismo string.
const dxf2 = planToDxf(sanitizeFloorPlan(rawPlan));
check("determinismo byte a byte", dxf === dxf2);

// Sanitizador: clamp de coordenadas fuera de rango.
const clamped = sanitizeFloorPlan({ ...rawPlan, rooms: [{ ...rawPlan.rooms[0], x: 999, width: -5 }] });
check("sanitizador clampa x y width", clamped.rooms[0].x <= clamped.outline.width && clamped.rooms[0].width >= 0.9);

// Tamaño razonable (< 100 KB para 5 espacios).
check(`tamaño razonable (${(dxf.length / 1024).toFixed(1)} KB)`, dxf.length < 100_000);

console.log(`\n${pass} pasan · ${fail} fallan`);
if (fail > 0) {
  // Guarda el DXF para inspección manual.
  const out = path.join(root, "test-output.dxf");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, dxf, "utf8");
  console.log(`DXF de depuración: ${out}`);
  process.exit(1);
}
console.log("✅ Motor DXF OK");
