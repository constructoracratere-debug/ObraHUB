// Replica el render exacto del visor: StreamAllMeshesWithTypes + GetGeometry
import { readFileSync } from "node:fs";
import { IfcAPI, IFCWALLSTANDARDCASE, IFCCOLUMN, IFCSLAB, IFCBEAM } from "web-ifc";
const buf = readFileSync(new URL("../ejemplo-estructural.ifc", import.meta.url));
const api = new IfcAPI();
await api.Init();
const modelID = api.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: false });
const tracked = [IFCWALLSTANDARDCASE, IFCCOLUMN, IFCSLAB, IFCBEAM];
let meshes = 0, verts = 0;
api.StreamAllMeshesWithTypes(modelID, tracked, (mesh) => {
  meshes++;
  const g = mesh.geometries.get(0);
  if (g) {
    const geom = api.GetGeometry(modelID, g.geometryExpressID);
    const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    verts += v.length / 6;
  }
});
console.log("MALLAS RENDERIZABLES:", meshes, "| vértices totales:", verts);
console.log(meshes >= 10 ? "✅ EL VISOR DIBUJARÁ LOS 10 ELEMENTOS" : "⚠️ faltan mallas");
api.CloseModel(modelID);
process.exit(0);
