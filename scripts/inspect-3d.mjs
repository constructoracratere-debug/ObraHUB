// Inspección profunda: ¿vértices crudos son mundo o locales? ¿qué lleva la matriz?
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/design/ifc.ts lib/design/schema.ts lib/design/materials.ts lib/design/symbols.ts lib/design/views.ts lib/design/validate.ts --outDir .tmp-r3d --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { planToIfc } = req(path.join(process.cwd(), ".tmp-r3d", "ifc.js"));
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-r3d", "schema.js"));

const plan = sanitizeFloorPlan({
  version: 1, name: "Mini", units: "m", levels: 1, floorToFloor: 2.6,
  outline: { width: 6, depth: 4 }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [{ name: "Sala", type: "sala", x: 0, y: 0, width: 6, depth: 4, level: 0 }],
  doors: [], windows: [],
});
const ifcText = planToIfc(plan, { includeFoundations: false });
const WebIfc = req("web-ifc");
const THREE = req("three");
const api = new WebIfc.IfcAPI();
await api.Init();
const mid = api.OpenModel(new TextEncoder().encode(ifcText), { COORDINATE_TO_ORIGIN: true });

let n = 0;
api.StreamAllMeshes(mid, (mesh) => {
  if (n++ >= 4) return;
  const g0 = mesh.geometries.get(0);
  const geom = api.GetGeometry(mid, g0.geometryExpressID);
  const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let k = 0; k < verts.length; k += 6) for (let j = 0; j < 3; j++) {
    mn[j] = Math.min(mn[j], verts[k + j]); mx[j] = Math.max(mx[j], verts[k + j]);
  }
  const m = new THREE.Matrix4().fromArray(g0.flatTransformation);
  console.log(`mesh ${mesh.expressID} nVerts=${verts.length / 6}`);
  console.log("  verts crudos min", mn.map((x) => +x.toFixed(2)), "max", mx.map((x) => +x.toFixed(2)));
  console.log("  flatTransformation (columnas):");
  const e = m.elements;
  for (let r = 0; r < 3; r++) console.log("   ", [e[0 + r], e[4 + r], e[8 + r], e[12 + r]].map((x) => +x.toFixed(3)).join("  "));
  geom.delete?.();
});
api.CloseModel(mid);
