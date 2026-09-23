import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/structural/loads.ts lib/design/schema.ts --outDir .tmp-st --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url); const root = process.cwd();
const L = req(path.join(root, ".tmp-st", "structural", "loads.js"));
const { sanitizeFloorPlan } = req(path.join(root, ".tmp-st", "design", "schema.js"));
let pass = 0, fail = 0; const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };
const plan = sanitizeFloorPlan({ version: 1, name: "T Estructura", units: "m", levels: 1, floorToFloor: 2.6,
  outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [{ name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.7, depth: 2.85 }, { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4, depth: 2.85 }, { name: "Alcoba", type: "habitacion", x: 0.15, y: 3, width: 7.7, depth: 2.85 }],
  doors: [{ from: "exterior", to: "Sala", x: 2, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 }],
  windows: [{ room: "Sala", wall: "sur", x: 1.2, width: 1.2, sill: 0.9, height: 1.2, level: 0 }] });
const dead = L.deadLoads(plan);
const live = L.liveLoads(plan);
check("carga muerta ~300-600 kgf/m2", dead.wPerM2 > 280 && dead.wPerM2 < 650);
check("cada linea cita NSR/Plazola", dead.lines.every((l) => l.ref.length > 3));
check("sobrecarga ponderada 170-310", live.weighted >= 170 && live.weighted <= 310);
const sw = L.seismicWeight(plan, dead.wPerM2, live.weighted);
check("peso sismico > 0 y = D+0.25L", sw.perM2 === Math.round((dead.wPerM2 + 0.25 * live.weighted) * 100) / 100);
const c = L.combos(dead.wPerM2, live.weighted, 80);
check("4 combinaciones NSR B.2", c.length === 4 && c[0].item.startsWith("1.4"));
const col = L.columnCheck(plan, dead.wPerM2, live.weighted);
check("columna >= 30 cm", parseInt(col.suggested) >= 30);
check("Pu coherente (>10 ton)", col.Pu > 10000);
check("determinista", JSON.stringify(L.deadLoads(plan)) === JSON.stringify(dead));
console.log(`
${pass} pasan · ${fail} fallan — D=${dead.wPerM2} L=${live.weighted} kgf/m2 · W=${Math.round(sw.W/1000)}t · col ${col.suggested} (Pu ${Math.round(col.Pu/1000)}t)`);
process.exit(fail ? 1 : 0);
