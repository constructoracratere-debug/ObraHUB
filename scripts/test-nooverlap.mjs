import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/design/schema.ts --outDir .tmp-no --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-no", "schema.js"));
let pass = 0, fail = 0; const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.05 && Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y) > 0.05;

// Caso brutal: 4 espacios TODOS traslapados al centro
const p = sanitizeFloorPlan({ version: 1, name: "NoSolape", units: "m", levels: 1, floorToFloor: 2.6,
  outline: { width: 10, depth: 8 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "A", type: "sala", x: 2, y: 2, width: 5, depth: 4 },
    { name: "B", type: "cocina", x: 3, y: 3, width: 5, depth: 4 },
    { name: "C", type: "habitacion", x: 4, y: 2, width: 4, depth: 3 },
    { name: "D", type: "baño", x: 2.5, y: 3.5, width: 2, depth: 2 },
  ],
  doors: [{ from: "exterior", to: "A", x: 3, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 }],
  windows: [] });
let n = 0;
for (let i = 0; i < p.rooms.length; i++) for (let j = i + 1; j < p.rooms.length; j++) if (overlap(p.rooms[i], p.rooms[j])) n++;
check("CERO traslapes en salida (entraron 4 amontonados)", n === 0);
check("espacios sobrevivieron >= 2", p.rooms.length >= 2);
check("todos con lado >= 0.9", p.rooms.every((r) => Math.min(r.width, r.depth) >= 0.89));
check("dentro del outline", p.rooms.every((r) => r.x >= -0.01 && r.y >= -0.01 && r.x + r.width <= 10.01 && r.y + r.depth <= 8.01));
check("determinista", JSON.stringify(sanitizeFloorPlan(JSON.parse(JSON.stringify({ version: 1, name: "NoSolape", units: "m", levels: 1, floorToFloor: 2.6, outline: { width: 10, depth: 8 }, wallThickness: { exterior: 0.15, interior: 0.1 }, rooms: [{ name: "A", type: "sala", x: 2, y: 2, width: 5, depth: 4 }, { name: "B", type: "cocina", x: 3, y: 3, width: 5, depth: 4 }, { name: "C", type: "habitacion", x: 4, y: 2, width: 4, depth: 3 }, { name: "D", type: "baño", x: 2.5, y: 3.5, width: 2, depth: 2 }], doors: [{ from: "exterior", to: "A", x: 3, y: 0.15, width: 0.9, hinge: "left", swing: "in", level: 0 }], windows: [] })))) === JSON.stringify(p));
console.log(`\n${pass} pasan · ${fail} fallan`);
process.exit(fail ? 1 : 0);
