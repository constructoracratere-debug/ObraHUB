import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/passport/takeoff.ts lib/passport/prices.ts lib/passport/value.ts lib/passport/waste.ts lib/passport/deconstruction.ts lib/passport/report.ts lib/design/schema.ts lib/design/materials.ts --outDir .tmp-pr --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url); const root = process.cwd();
const { buildEnvironmentalReport } = req(path.join(root, ".tmp-pr", "passport", "report.js"));
const { sanitizeFloorPlan } = req(path.join(root, ".tmp-pr", "design", "schema.js"));
let pass = 0, fail = 0; const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };
const plan = sanitizeFloorPlan({ version: 1, name: "T Reporte", units: "m", levels: 1, floorToFloor: 2.6, outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [{ name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.7, depth: 2.85 }, { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4, depth: 2.85 }, { name: "Bano", type: "bano", x: 0.15, y: 3, width: 1.8, depth: 2.85 }, { name: "Alcoba", type: "habitacion", x: 1.95, y: 3, width: 5.9, depth: 2.85 }],
  doors: [{ from: "exterior", to: "Sala", x: 2, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 }],
  windows: [{ room: "Sala", wall: "sur", x: 1.2, width: 1.2, sill: 0.9, height: 1.2, level: 0 }] });
const r = buildEnvironmentalReport(plan);
check("6 secciones", ["1.", "2.", "3.", "4.", "5.", "6."].every((s) => r.includes(s)));
check("desmonte 7 fases", r.includes("7. [Cimentacion]"));
check("salud cita normativa CO", r.includes("0312/2019"));
check("determinista", r === buildEnvironmentalReport(plan));
console.log(`\n${pass} pasan · ${fail} fallan · ${r.length} caracteres`);
process.exit(fail ? 1 : 0);
