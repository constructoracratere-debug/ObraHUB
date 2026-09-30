// Verificación Z-mundo por elemento: placement chain + solid position.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/design/ifc.ts lib/design/schema.ts lib/design/materials.ts lib/design/symbols.ts lib/design/views.ts lib/design/validate.ts --outDir .tmp-ifc --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { planToIfc } = req(path.join(process.cwd(), ".tmp-ifc", "ifc.js"));
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-ifc", "schema.js"));

const fft = 3.0;
const plan = sanitizeFloorPlan({
  version: 1, name: "ZCheck", units: "m", levels: 2, floorToFloor: fft,
  outline: { width: 8, depth: 6 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "Sala", type: "sala", x: 0, y: 0, width: 4, depth: 3, level: 0 },
    { name: "Cocina", type: "cocina", x: 4, y: 0, width: 4, depth: 3, level: 0 },
    { name: "Alcoba", type: "habitacion", x: 0, y: 3, width: 4, depth: 3, level: 0 },
    { name: "Alcoba2", type: "habitacion", x: 0, y: 0, width: 4, depth: 3, level: 1 },
    { name: "Bano", type: "baño", x: 4, y: 0, width: 4, depth: 3, level: 1 },
  ],
  doors: [{ from: "Sala", to: "Cocina", width: 0.9 }, { from: "Sala", to: "Alcoba", width: 0.9 }],
  windows: [{ room: "Sala", wall: "sur", x: 1, width: 1.2, sill: 1, height: 1.2 }],
});
const ifc = planToIfc(plan);
const lines = ifc.split(";").map((l) => l.trim()).filter((l) => l.startsWith("#"));
const ent = new Map();
for (const l of lines) {
  const m = l.match(/^#(\d+)=\s*([A-Z0-9]+)\((.*)\)$/);
  if (m) ent.set(m[1], { type: m[2], args: m[3] });
}
const pts = new Map();
for (const [id, e] of ent) if (e.type === "IFCCARTESIANPOINT") pts.set(id, (e.args.match(/\(([^)]*)\)/) ?? ["", "0"])[1].split(",").map(Number));

function placeZ(id, depth = 0) {
  const e = ent.get(id);
  if (!e || e.type !== "IFCLOCALPLACEMENT" || depth > 8) return 0;
  const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  let z = 0;
  if (refs[1]) { const ax = ent.get(refs[1]); if (ax?.type === "IFCAXIS2PLACEMENT3D") { const pr = [...ax.args.matchAll(/#(\d+)/g)][0]?.[1]; z = pts.get(pr)?.[2] ?? 0; } }
  return z + (refs[0] ? placeZ(refs[0], depth + 1) : 0);
}
function solidZ(productArgs, repRef) {
  const rep = ent.get(repRef ?? "");
  if (!rep) return null;
  const inner = [...rep.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  for (const i of inner) {
    const sr = ent.get(i);
    if (!sr) continue;
    for (const j of [...sr.args.matchAll(/#(\d+)/g)].map((m) => m[1])) {
      const sol = ent.get(j);
      if (sol?.type === "IFCEXTRUDEDAREASOLID") {
        const sx = [...sol.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
        const ax = ent.get(sx[1] ?? "");
        if (ax?.type === "IFCAXIS2PLACEMENT3D") {
          const pr = [...ax.args.matchAll(/#(\d+)/g)][0]?.[1];
          return pts.get(pr)?.[2] ?? 0;
        }
      }
    }
  }
  return null;
}

let pass = 0, fail = 0;
const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };

const rows = [];
for (const [id, e] of ent) {
  if (!/IFC(WALLSTANDARDCASE|DOOR|WINDOW|SLAB|COLUMN|BEAM|FURNISHINGELEMENT|FOOTING)/.test(e.type)) continue;
  // args: (GlobalId, #Owner, 'Name', Desc, ObjType, #Placement, #Representation, ...)
  const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  const placementRef = e.type === "IFCBUILDINGSTOREY" ? refs[0] : refs[1];
  const repRef = e.type === "IFCBUILDINGSTOREY" ? undefined : refs[2];
  const pz = placeZ(placementRef);
  const sz = repRef ? solidZ(e.args, repRef) : 0;
  const quoted = [...e.args.matchAll(/'([^']*)'/g)];
  const name = quoted[1]?.[1] ?? "?";
  rows.push({ type: e.type.replace("IFC", ""), name, world: pz + (sz ?? 0), local: sz, place: pz });
}
// N1 (nivel 0): muros/puertas/mobiliario z=0..3, losa z=3. N2: muros z=3, losa z=6. Zapatas z=-1.4..-1.1
const l1walls = rows.filter((r) => r.type === "WALLSTANDARDCASE" && /N1/.test(r.name));
const l2walls = rows.filter((r) => r.type === "WALLSTANDARDCASE" && /N2/.test(r.name));
check(`muros N1 todos con base z-mundo=0 (${l1walls.length})`, l1walls.length > 0 && l1walls.every((r) => Math.abs(r.world) < 0.01));
check(`muros N2 todos con base z-mundo=3 (${l2walls.length})`, l2walls.length > 0 && l2walls.every((r) => Math.abs(r.world - 3) < 0.01));
const l1doors = rows.filter((r) => r.type === "DOOR");
check(`puertas z-mundo 0 o 3 (nunca 6) — got [${l1doors.map((r) => r.world)}]`, l1doors.length > 0 && l1doors.every((r) => Math.abs(r.world) < 0.01 || Math.abs(r.world - 3) < 0.01));
const wins = rows.filter((r) => r.type === "WINDOW");
check(`ventana base z-mundo=1 (sill 1) — got [${wins.map((r) => r.world)}]`, wins.length > 0 && wins.every((r) => Math.abs(r.world - 1) < 0.01));
const slabs = rows.filter((r) => r.type === "SLAB").map((r) => r.world).sort((a, b) => a - b);
check(`losas z-mundo = [-0.1, 3, 6] — got [${slabs}]`, JSON.stringify(slabs.map((z) => Math.round(z * 10) / 10)) === JSON.stringify([-0.1, 3, 6]));
const cols = rows.filter((r) => r.type === "COLUMN");
check(`columnas base z-mundo 0 o 3 — got [${[...new Set(cols.map((r) => r.world))].sort()}]`, cols.length > 0 && cols.every((r) => [0, 3].some((z) => Math.abs(r.world - z) < 0.01)));
const furn = rows.filter((r) => r.type === "FURNISHINGELEMENT");
check(`mobiliario z-mundo 0 o 3 — got [${[...new Set(furn.map((r) => r.world))].sort()}]`, furn.length > 0 && furn.every((r) => [0, 3].some((z) => Math.abs(r.world - z) < 0.01)));
const foot = rows.filter((r) => r.type === "FOOTING");
check(`zapatas z-mundo=-1.4`, foot.length > 0 && foot.every((r) => Math.abs(r.world + 1.4) < 0.01));

console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
