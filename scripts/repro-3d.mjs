// REPRO 3D: exact same path as ifc-live.tsx (web-ifc StreamAllMeshes,
// verts×flatTransformation) pero en node — ground truth de lo que el
// navegador dibuja vs lo que el 2D muestra.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/design/ifc.ts lib/design/schema.ts lib/design/materials.ts lib/design/symbols.ts lib/design/views.ts lib/design/validate.ts --outDir .tmp-r3d --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { planToIfc } = req(path.join(process.cwd(), ".tmp-r3d", "ifc.js"));
const { sanitizeFloorPlan } = req(path.join(process.cwd(), ".tmp-r3d", "schema.js"));

const fft = 2.6, W = 7.8, D = 7.6;
const plan = sanitizeFloorPlan({
  version: 1, name: "Apto Repro", units: "m", levels: 1, floorToFloor: fft,
  outline: { width: W, depth: D }, wallThickness: { exterior: 0.15, interior: 0.1 },
  rooms: [
    { name: "Sala", type: "sala", x: 0, y: 0, width: 4, depth: 4, level: 0 },
    { name: "Cocina", type: "cocina", x: 4, y: 0, width: 3.8, depth: 4, level: 0 },
    { name: "Habitación 1", type: "habitacion", x: 0, y: 4, width: 3.8, depth: 3.6, level: 0 },
    { name: "Baño", type: "baño", x: 3.8, y: 4, width: 1.9, depth: 3.6, level: 0 },
    { name: "Habitación 2", type: "habitacion", x: 5.7, y: 4, width: 2.1, depth: 3.6, level: 0 },
  ],
  doors: [{ from: "Sala", to: "Cocina", width: 0.9 }, { from: "Sala", to: "Habitación 1", width: 0.9 }],
  windows: [{ room: "Sala", wall: "sur", x: 1, width: 1.4, sill: 1, height: 1.2 }],
});

const ifcText = planToIfc(plan, { includeFoundations: false }); // IGUAL que IfcLive
const WebIfc = req("web-ifc");
const THREE = req("three");
const api = new WebIfc.IfcAPI();
await api.Init();
const bytes = new TextEncoder().encode(ifcText);
const mid = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
console.log("model id:", mid);

const boxes = [];
api.StreamAllMeshes(mid, (mesh) => {
  const g0 = mesh.geometries.get(0);
  const geom = api.GetGeometry(mid, g0.geometryExpressID);
  const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
  // EXACTAMENTE como el visor que SÍ funciona (ifc-viewer.tsx:1838):
  // three.js Matrix4.fromArray (column-major) × vértices.
  const matrix = new THREE.Matrix4().fromArray(g0.flatTransformation);
  const v = new THREE.Vector3();
  let min = { x: 1e9, y: 1e9, z: 1e9 }, max = { x: -1e9, y: -1e9, z: -1e9 };
  for (let k = 0; k < verts.length; k += 6) {
    v.set(verts[k], verts[k + 1], verts[k + 2]).applyMatrix4(matrix);
    min = { x: Math.min(min.x, v.x), y: Math.min(min.y, v.y), z: Math.min(min.z, v.z) };
    max = { x: Math.max(max.x, v.x), y: Math.max(max.y, v.y), z: Math.max(max.z, v.z) };
  }
  let tId = 0;
  try { tId = api.GetLineType(mid, mesh.expressID); } catch {}
  geom.delete?.();
  boxes.push({ id: mesh.expressID, type: tId, min, max, nGeom: mesh.geometries.size() });
});
console.log("meshes:", boxes.length);

// Esperado tras UNA transformación correcta (convención three Y-up):
// huella X-Z ≈ W×D, altura en Y ≈ fft, muros VERTICALES, muros este/oeste
// corriendo por Z (no cruzados en X).
let pass = 0, fail = 0;
const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };

const all = boxes.reduce((a, b) => ({
  min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
  max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
}), { min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 } });
const fmt = (b) => `(${b.min.x.toFixed(2)},${b.min.y.toFixed(2)},${b.min.z.toFixed(2)})..(${b.max.x.toFixed(2)},${b.max.y.toFixed(2)},${b.max.z.toFixed(2)})`;
console.log("BBOX mundo total:", fmt(all));
const sx = all.max.x - all.min.x, sy = all.max.y - all.min.y, sz = all.max.z - all.min.z;
console.log(`tamaños: X=${sx.toFixed(2)} Y=${sy.toFixed(2)} Z=${sz.toFixed(2)} (esperado ~${W} × ~${fft} × ~${D})`);
check(`extensión X ≈ ${W} (±0.4)`, Math.abs(sx - W) < 0.4);
check(`extensión Y ≈ ${fft} altura (±0.4)`, Math.abs(sy - fft) < 0.4);
check(`extensión Z ≈ ${D} (±0.4)`, Math.abs(sz - D) < 0.4);
const WALL = 3512223829;
const walls = boxes.filter((b) => b.type === WALL);
const upright = walls.filter((b) => (b.max.y - b.min.y) > fft - 0.3 && (b.max.y - b.min.y) < fft + 0.3);
check(`muros verticales (altura≈${fft} en Y): ${upright.length}/${walls.length}`, walls.length > 0 && upright.length === walls.length);
// Muros largos por eje: los de longitud≈segmento>2 corren sobre SU eje.
const alongX = walls.filter((b) => b.max.x - b.min.x > 2);
const alongZ = walls.filter((b) => b.max.z - b.min.z > 2);
// Muro cruzado = largo en AMBOS ejes (imposible para muro de eje).
const crossers = walls.filter((b) => b.max.x - b.min.x > 2 && b.max.z - b.min.z > 2);
check(`muros corriendo por X (${alongX.length}) y por Z (${alongZ.length}) — ambos presentes`, alongX.length > 0 && alongZ.length > 0);
check(`sin muros cruzados (largo ≈ eje equivocado): ${crossers.length}`, crossers.length === 0);
for (const c of crossers.slice(0, 4)) console.log("   CRUZADO:", fmt(c));
const multi = boxes.filter((b) => b.nGeom > 1);
check(`meshes con >1 geometría (${multi.length}) — el viewer solo dibuja la 1ª`, multi.length === 0);

api.CloseModel(mid);
console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
