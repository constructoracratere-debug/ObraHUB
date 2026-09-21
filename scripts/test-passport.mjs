import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/passport/takeoff.ts lib/design/schema.ts lib/design/materials.ts --outDir .tmp-pp --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { takeoff } = req(path.join(process.cwd(), ".tmp-pp", "passport/takeoff.js"));
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-pp", "design/schema.js"));
let pass = 0, fail = 0;
const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };
const plan = sanitizeFloorPlan({
  version: 1, name: "T Passport", units: "m", levels: 1, floorToFloor: 2.6,
  outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.7, depth: 2.85 },
    { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4.0, depth: 2.85 },
    { name: "Baño", type: "baño", x: 0.15, y: 3.0, width: 1.8, depth: 2.85 },
    { name: "Alcoba", type: "habitacion", x: 1.95, y: 3.0, width: 5.9, depth: 2.85 },
  ],
  doors: [
    { from: "exterior", to: "Sala", x: 2, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 },
    { from: "Sala", to: "Cocina", x: 3.85, y: 1.5, width: 0.8, hinge: "left", swing: "in", level: 0 },
  ],
  windows: [
    { room: "Sala", wall: "sur", x: 1.2, width: 1.2, sill: 0.9, height: 1.2, level: 0 },
    { room: "Alcoba", wall: "norte", x: 4.5, width: 1.4, sill: 0.9, height: 1.2, level: 0 },
  ],
});
const t = takeoff(plan);
const q = (m) => t.find((l) => l.material.includes(m))?.qty ?? 0;
check("takeoff genera líneas", t.length >= 8);
check("ladrillo a ladrillo (und > 0)", q("Ladrillo") > 100);
check("concreto columnas > 0 m³", q("columnas") > 0);
check("acero = 100 kg/m3 x concreto total", Math.abs(q("Acero") - (q("columnas") + q("vigas") + q("losas") + q("zapatas")) * 100) < 1);
check("ceramica zonas humedas > 0", q("Cerámica") > 5);
check("ventanas m2 = suma areas", Math.abs(q("Ventana") - (1.2 * 1.2 + 1.4 * 1.2)) < 0.05);
check("determinista", JSON.stringify(takeoff(plan)) === JSON.stringify(t));
console.log(`
${pass} pasan · ${fail} fallan`);
process.exit(fail ? 1 : 0);
