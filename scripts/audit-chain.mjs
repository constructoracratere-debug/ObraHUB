// Full placement chain audit for one wall + one door + storeys.
import { readFileSync } from "node:fs";
const ifc = readFileSync("audit.ifc", "utf-8");
const lines = ifc.split(";").map((l) => l.trim()).filter((l) => l.startsWith("#"));
const ent = new Map();
for (const l of lines) {
  const m = l.match(/^#(\d+)=\s*([A-Z0-9]+)\((.*)\)$/);
  if (m) ent.set(m[1], { type: m[2], args: m[3], raw: l });
}
function show(id, depth = 0) {
  const e = ent.get(id);
  if (!e) return;
  console.log(" ".repeat(depth * 2) + e.raw.slice(0, 150));
  if (e.type === "IFCLOCALPLACEMENT") {
    const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
    if (refs[1]) show(refs[1], depth + 1);
    if (refs[0]) show(refs[0], depth + 1);
  }
  if (e.type === "IFCAXIS2PLACEMENT3D") {
    const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]);
    for (const r of refs) show(r, depth + 1);
  }
}
// First wall, first door, both storeys — ObjectPlacement es refs[1] (tras OwnerHistory).
for (const [id, e] of ent) {
  if (e.type === "IFCWALLSTANDARDCASE") { console.log("=== WALL " + id); const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]); show(refs[1]); break; }
}
for (const [id, e] of ent) {
  if (e.type === "IFCDOOR") { console.log("\n=== DOOR " + id); const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]); show(refs[1]); break; }
}
console.log("\n=== STOREY placements");
for (const [id, e] of ent) if (e.type === "IFCBUILDINGSTOREY") { const refs = [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1]); console.log("storey " + id + " placement #" + refs[1]); show(refs[1], 1); }
// One wall's profile polyline (to see where X/Y position comes from)
const wall = [...ent.entries()].find(([, e]) => e.type === "IFCWALLSTANDARDCASE");
if (wall) {
  console.log("\n=== WALL raw (first 400 chars):\n", wall[1].raw.slice(0, 400));
}
