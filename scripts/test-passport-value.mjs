import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/passport/takeoff.ts lib/passport/prices.ts lib/passport/value.ts lib/design/schema.ts lib/design/materials.ts --outDir .tmp-pv --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const root = process.cwd();
const { takeoff } = req(path.join(root, ".tmp-pv", "passport", "takeoff.js"));
const { valueTakeoff, recommendations } = req(path.join(root, ".tmp-pv", "passport", "value.js"));
const { sanitizeFloorPlan } = req(path.join(root, ".tmp-pv", "design", "schema.js"));
let pass = 0, fail = 0;
const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };
const plan = sanitizeFloorPlan({
  version: 1, name: "T Valor", units: "m", levels: 1, floorToFloor: 2.6,
  outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.7, depth: 2.85 },
    { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4.0, depth: 2.85 },
    { name: "Bano", type: "bano", x: 0.15, y: 3.0, width: 1.8, depth: 2.85 },
    { name: "Alcoba", type: "habitacion", x: 1.95, y: 3.0, width: 5.9, depth: 2.85 },
  ],
  doors: [{ from: "exterior", to: "Sala", x: 2, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 }],
  windows: [{ room: "Sala", wall: "sur", x: 1.2, width: 1.2, sill: 0.9, height: 1.2, level: 0 }],
});
const v = valueTakeoff(takeoff(plan));
check("valor total > 0 COP", v.totalCOP > 10_000_000);
check("CO2e total > 0 kg", v.co2eTotal > 1000);
check("banco de materiales > 0", v.reuseCOP > 0);
check("toda linea cotizada tiene precio", v.lines.every((l) => !l.match || l.totalCOP > 0 || l.qty === 0 || PRICES_UNIT_MISS(l)));
function PRICES_UNIT_MISS(l) { return l.unitCostCOP === 0 && !["und"].includes(l.unit); }
const recs = recommendations(v);
check("recomendaciones rankeadas", recs.length >= 3 && /COP/.test(recs[0]));
check("determinista", JSON.stringify(valueTakeoff(takeoff(plan))) === JSON.stringify(v));
console.log(`\n${pass} pasan · ${fail} fallan — total COP ${(v.totalCOP / 1e6).toFixed(1)}M · CO2e ${(v.co2eTotal / 1000).toFixed(1)}t · banco ${(v.reuseCOP / 1e6).toFixed(1)}M`);
process.exit(fail ? 1 : 0);
