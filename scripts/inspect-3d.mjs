// COORDINATE_TO_ORIGIN=false: ¿la matriz sale limpia (edificio en y>0)?
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/design/ifc.ts lib/design/schema.ts lib/design/materials.ts lib/design/symbols.ts lib/design/views.ts lib/design/validate.ts --outDir .tmp-r3d --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { planToIfc } = req(path.join(process.cwd(), ".tmp-r3d", "ifc.js"));
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-r3d", "schema.js"));

const fft = 2.6, W = 6, D = 4;
const plan = sanitizeFloorPlan({
  version: 1, name: "Mini", units: "m", levels: 1, floorToFloor: fft,
  outline: { width: W, depth: D }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [{ name: "Sala", type: "sala", x: 0, y: 0, width: 6, depth: 4, level: 0 }],
  doors: [], windows: [],
});
const ifcText = planToIfc(plan, { includeFoundations: false });

for (const flag of [false, true]) {
  const WebIfc = req("web-ifc");
  const THREE = req("three");
  const api = new WebIfc.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(new TextEncoder().encode(ifcText), { COORDINATE_TO_ORIGIN: flag });
  console.log(`\n=== COORDINATE_TO_ORIGIN: ${flag} ===`);
  let all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
  let shown = 0;
  api.StreamAllMeshes(mid, (mesh) => {
    const g0 = mesh.geometries.get(0);
    const geom = api.GetGeometry(mid, g0.geometryExpressID);
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const m = new THREE.Matrix4().fromArray(g0.flatTransformation);
    const v = new THREE.Vector3();
    for (let k = 0; k < verts.length; k += 6) {
      v.set(verts[k], verts[k + 1], verts[k + 2]).applyMatrix4(m);
      for (let j = 0; j < 3; j++) {
        all.mn[j] = Math.min(all.mn[j], v.getComponent(j));
        all.mx[j] = Math.max(all.mx[j], v.getComponent(j));
      }
    }
    if (shown++ < 1) {
      const e = m.elements;
      console.log("matriz (filas):");
      for (let r = 0; r < 3; r++) console.log("  ", [e[0 + r], e[4 + r], e[8 + r], e[12 + r]].map((x) => +x.toFixed(2)).join("  "));
    }
    geom.delete?.();
  });
  console.log("bbox mundo:", all.mn.map((x) => +x.toFixed(2)), "..", all.mx.map((x) => +x.toFixed(2)));
  api.CloseModel(mid);
}
