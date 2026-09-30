// Audit IFC placements per element type (Z coherence check).
import { readFileSync } from "node:fs";
const ifc = readFileSync("audit.ifc", "utf-8");
const lines = ifc.split(";").map((l) => l.trim()).filter((l) => l.startsWith("#"));
const ent = new Map();
for (const l of lines) {
  const m = l.match(/^#(\d+)=\s*([A-Z0-9]+)\((.*)\)$/);
  if (m) ent.set(m[1], { type: m[2], args: m[3] });
}
const pts = new Map();
for (const [id, e] of ent) if (e.type === "IFCCARTESIANPOINT") pts.set(id, (e.args.match(/\(([^)]*)\)/) ?? ["", "0,0,0"])[1].split(",").map(Number));
const dirs = new Map();
for (const [id, e] of ent) if (e.type === "IFCDIRECTION") dirs.set(id, (e.args.match(/\(([^)]*)\)/) ?? ["", "0,0,1"])[1].split(",").map(Number));

function axInfo(id) {
  const e = ent.get(id);
  if (!e || e.type !== "IFCAXIS2PLACEMENT3D") return null;
  const loc = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  return { p: pts.get(loc[0]), z: dirs.get(loc[1]), x: dirs.get(loc[2]) };
}
function placeFull(id, depth = 0) {
  const e = ent.get(id);
  if (!e || e.type !== "IFCLOCALPLACEMENT" || depth > 6) return { x: 0, y: 0, z: 0 };
  const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  const a = axInfo(refs[1]);
  const up = refs[0] ? placeFull(refs[0], depth + 1) : { x: 0, y: 0, z: 0 };
  return { x: (a?.p?.[0] ?? 0) + up.x, y: (a?.p?.[1] ?? 0) + up.y, z: (a?.p?.[2] ?? 0) + up.z };
}
const counts = {};
for (const [id, e] of ent) {
  if (!/IFC(WALLSTANDARDCASE|DOOR|WINDOW|SLAB|COLUMN|BEAM|FURNISHINGELEMENT|FOOTING)/.test(e.type)) continue;
  const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
  const p = refs[0] ? placeFull(refs[0]) : { x: 0, y: 0, z: 0 };
  counts[e.type] = counts[e.type] ?? [];
  if (counts[e.type].length < 30) counts[e.type].push(`(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
}
for (const [t, zs] of Object.entries(counts)) console.log(t.padEnd(24), zs.length + ":", zs.slice(0, 14).join(" "));
console.log("\nstoreys:");
for (const [, e] of ent) if (e.type === "IFCBUILDINGSTOREY") console.log("  ", e.args.replace(/\s+/g, " ").slice(0, 110));
