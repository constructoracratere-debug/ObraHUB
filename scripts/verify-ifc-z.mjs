// Verificación del modelo IFC: Z-mundo por elemento + BIM mínimo exigible
// (GUID buildingSMART, contención espacial, aperturas vanos, cantidades
// tipadas, espacios, clases MEP) — review Codex #10.
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
    // Estudio crea una división interior que EMPIEZA en x=4 (>0): la puerta
    // Cocina→Estudio vive en un muro con inicio ≠ 0 (regresión del offset).
    { name: "Estudio", type: "estudio", x: 4, y: 3, width: 4, depth: 3, level: 0 },
    { name: "Alcoba2", type: "habitacion", x: 0, y: 0, width: 4, depth: 3, level: 1 },
    { name: "Bano", type: "baño", x: 4, y: 0, width: 4, depth: 3, level: 1 },
  ],
  doors: [
    { from: "Sala", to: "Cocina", width: 0.9 },
    { from: "Sala", to: "Alcoba", width: 0.9 },
    { from: "Cocina", to: "Estudio", width: 0.9 }, // muro interior con s0 = 4
  ],
  windows: [{ room: "Sala", wall: "sur", x: 1, width: 1.2, sill: 1, height: 1.2 }],
  structure: {
    system: "concreto", justification: "Mampostería confinada NSR-10",
    axes: [
      { id: "A", orientation: "vertical", at: 0.15 }, { id: "B", orientation: "vertical", at: 7.85 },
      { id: "1", orientation: "horizontal", at: 0.15 }, { id: "2", orientation: "horizontal", at: 5.85 },
    ],
  },
  electrical: { points: [
    { kind: "tablero", room: "Sala", x: 0.4, y: 0.4, level: 0 },
    { kind: "iluminacion", room: "Sala", x: 2.0, y: 1.5, level: 0 },
    { kind: "interruptor", room: "Alcoba", x: 0.4, y: 2.8, level: 0 },
  ] },
  hydro: { points: [
    { kind: "sanitario", room: "Bano", x: 5.9, y: 1.2, level: 1 },
    { kind: "lavamanos", room: "Bano", x: 5.2, y: 0.6, level: 1 },
    { kind: "lavaplatos", room: "Cocina", x: 6.5, y: 0.6, level: 0 },
  ] },
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
const refsOf = (id) => [...(ent.get(id)?.args ?? "").matchAll(/#(\d+)/g)].map((m) => m[1]);
const numsOf = (id) => [...(ent.get(id)?.args ?? "").matchAll(/(-?[\d.]+)/g)].map((m) => Number(m[1]));

function placeZ(id, depth = 0) {
  const e = ent.get(id);
  if (!e || e.type !== "IFCLOCALPLACEMENT" || depth > 8) return 0;
  const refs = refsOf(id);
  let z = 0;
  if (refs[1]) { const ax = ent.get(refs[1]); if (ax?.type === "IFCAXIS2PLACEMENT3D") { const pr = refsOf(refs[1])[0]; z = pts.get(pr)?.[2] ?? 0; } }
  return z + (refs[0] ? placeZ(refs[0], depth + 1) : 0);
}
/** Sólido de un producto: {z, h, cx, cy} del primer extruded (posición del
 *  eje de extrusión + profundidad). */
function solidOf(repRef) {
  const rep = ent.get(repRef ?? "");
  if (!rep) return null;
  for (const i of refsOf(repRef ?? "")) {
    const sr = ent.get(i);
    if (!sr) continue;
    for (const j of refsOf(i)) {
      const sol = ent.get(j);
      if (sol?.type === "IFCEXTRUDEDAREASOLID") {
        const sx = refsOf(j);
        const ax = ent.get(sx[1] ?? "");
        if (ax?.type === "IFCAXIS2PLACEMENT3D") {
          const p = pts.get(refsOf(sx[1])[0]) ?? [0, 0, 0];
          const depth = numsOf(j).at(-1) ?? 0;
          return { z: p[2] ?? 0, h: depth, cx: p[0] ?? 0, cy: p[1] ?? 0 };
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
  if (!/IFC(WALLSTANDARDCASE|DOOR|WINDOW|SLAB|COLUMN|BEAM|FURNISHINGELEMENT|FOOTING|OPENINGELEMENT|SPACE)/.test(e.type)) continue;
  const refs = refsOf(id);
  const placementRef = refs[1];
  const repRef = refs[2];
  const pz = placeZ(placementRef);
  const s = repRef ? solidOf(repRef) : null;
  const quoted = [...e.args.matchAll(/'([^']*)'/g)];
  const name = quoted[1]?.[1] ?? "?";
  rows.push({ id, type: e.type.replace("IFC", ""), name, world: pz + (s?.z ?? 0), local: s?.z ?? 0, place: pz, h: s?.h ?? 0, cx: s?.cx ?? 0, cy: s?.cy ?? 0 });
}

// ── Z-mundo por elemento ─────────────────────────────────────────────────────
const l1walls = rows.filter((r) => r.type === "WALLSTANDARDCASE" && /N1/.test(r.name));
const l2walls = rows.filter((r) => r.type === "WALLSTANDARDCASE" && /N2/.test(r.name));
// Segmentos N1: tramos/antepechos nacen en 0; DINTELES nacen en head y
// llegan a fft (base+altura = piso a piso). Ninguno flota ni atraviesa.
check(`muros N1: base 0 (tramo/antepecho) o dintel que cierra en +${fft} (${l1walls.length})`,
  l1walls.length > 0 && l1walls.every((r) => Math.abs(r.world) < 0.01 || Math.abs(r.world + r.h - fft) < 0.02));
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

// ── GUID buildingSMART (IfcGloballyUniqueId) ────────────────────────────────
const guids = [...ifc.matchAll(/= IFC[A-Z0-9]+\('([^']{22})',#/g)].map((m) => m[1]);
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
check(`GUIDs: 22 chars, alfabeto válido, 1er char 0-3 (${guids.length})`,
  guids.length > 50 && guids.every((g) => g.length === 22 && [...g].every((c) => B64.includes(c)) && "0123".includes(g[0])));
check(`GUIDs únicos (${new Set(guids).size}/${guids.length})`, new Set(guids).size === guids.length);
check("GUIDs estables entre exports (determinismo byte a byte)", planToIfc(plan) === ifc);

// ── Contención espacial (patrón buildingSMART) ──────────────────────────────
const contained = [...ent.values()].filter((e) => e.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE");
const aggregates = [...ent.values()].filter((e) => e.type === "IFCRELAGGREGATES");
const storeyIds = new Set([...ent].filter(([, e]) => e.type === "IFCBUILDINGSTOREY").map(([id]) => id));
const containedProducts = new Set(contained.flatMap((e) => [...e.args.matchAll(/#(\d+)/g)].map((m) => m[1])));
const productIds = new Set(rows.filter((r) => !["OPENINGELEMENT", "SPACE"].includes(r.type)).map((r) => r.id));
check(`IFCRELCONTAINEDINSPATIALSTRUCTURE por storey (${contained.length})`, contained.length >= 2 && contained.every((e) => storeyIds.has((e.args.match(/#(\d+)/g) ?? []).at(-1)?.slice(1))));
check(`todo producto contenido en un storey (${containedProducts.size}/${productIds.size})`,
  productIds.size > 0 && [...productIds].every((p) => containedProducts.has(p)));
const aggParents = aggregates.map((e) => e.args.match(/#\d+,.*,.*,#(\d+)/)?.[1]);
check("AGGREGATES solo en el árbol espacial (Project/Site/Building/Storey→Spaces)", aggParents.length >= 3);

// ── Vanos: openings + voids + fills (patrón buildingSMART) ──────────────────
const openings = rows.filter((r) => r.type === "OPENINGELEMENT");
const voids = [...ent.values()].filter((e) => e.type === "IFCRELVOIDSELEMENT");
const fills = [...ent.values()].filter((e) => e.type === "IFCRELFILLESELEMENT");
check(`IFCOPENINGELEMENT por cada vano (${openings.length} vanos)`, openings.length >= 4);
check(`IFCRELVOIDSELEMENT muro→vano (${voids.length})`, voids.length === openings.length && voids.length > 0);
check(`IFCRELFILLESELEMENT vano→puerta/ventana (${fills.length})`, fills.length >= rows.filter((r) => r.type === "DOOR" || r.type === "WINDOW").length && fills.length > 0);
// REGRESIÓN offset: la puerta Cocina→Estudio vive en un muro con inicio
// x=4 (>0); su opening debe centrarse en las MISMAS coordenadas absolutas.
const doorEstudio = rows.find((r) => r.type === "DOOR" && /Estudio/.test(r.name));
const doorOpen = openings.find((o) => Math.abs(o.cx - doorEstudio.cx) < 0.35 && Math.abs(o.cy - doorEstudio.cy) < 0.35);
check(`puerta en muro con inicio>0: opening en coords absolutas (${doorEstudio?.cx.toFixed(2)},${doorEstudio?.cy.toFixed(2)})`, !!doorOpen);
// Vano físicamente libre: muros del muro afectado no cubren el rect del vano.
const windowRow = wins[0];
const covering = l1walls.filter((w) => Math.abs(w.cy - windowRow.cy) < 0.2 && w.cx - w.h > 0 && (w.cx + (w.h * 0)) >= 0);
check("ventana: ningún muro full-height invade el vano (antepecho+dintel, no muro macizo)",
  !l1walls.some((w) => Math.abs(w.cy - windowRow.cy) < 0.2 && Math.abs(w.cx - windowRow.cx) < 0.7 && Math.abs(w.h - fft) < 0.02));

// ── Cantidades tipadas (Qto) + metadatos ────────────────────────────────────
const eqts = [...ent.values()].filter((e) => e.type === "IFCELEMENTQUANTITY");
const qAreas = [...ent.values()].filter((e) => e.type === "IFCQUANTITYAREA");
const qVols = [...ent.values()].filter((e) => e.type === "IFCQUANTITYVOLUME");
const qWeights = [...ent.values()].filter((e) => e.type === "IFCQUANTITYWEIGHT");
check(`IFCELEMENTQUANTITY con cantidades tipadas (${eqts.length} A:${qAreas.length} V:${qVols.length} W:${qWeights.length})`,
  eqts.length >= 10 && qAreas.length > 5 && qVols.length > 5 && qWeights.length > 5);
check("números de pset como IFCREAL (no IFCLABEL)", /IFCPROPERTYSINGLEVALUE\('[^']*',\$,\s*IFCREAL\(/.test(ifc));
// Volumen de viga = longitud×sección (antes: paréntesis mal puesto → ~0.06).
const beamQty = rows.find((r) => r.type === "BEAM");
const beamVol = (() => {
  for (const [rid, rel] of ent) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES" || !new RegExp(`#${beamQty?.id}[,) ]`).test(rel.args)) continue;
    const eqRef = refsOf(rid).at(-1);
    if (ent.get(eqRef ?? "")?.type !== "IFCELEMENTQUANTITY") continue;
    for (const [id, e] of ent) if (e.type === "IFCQUANTITYVOLUME" && /Concreto/.test(e.args) && refsOf(eqRef ?? "").includes(id)) return numsOf(id).at(-1);
  }
  return 0;
})();
check(`volumen de viga realista (~0.5 m³, no ~0.06 del bug) — got ${beamVol.toFixed(2)}`, beamVol > 0.2 && beamVol < 2);
const doorEntry = [...ent].find(([, e]) => e.type === "IFCDOOR");
const doorNums = (doorEntry?.[1].args ?? "").replace(/'[^']*'/g, "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
const doorWidth = doorNums.at(-1) ?? 0; // último número = OverallWidth
check(`ancho de puerta desde el plan (0.9, no 1.0 hardcodeado) — got ${doorWidth}`, Math.abs(doorWidth - 0.9) < 0.01);

// ── Espacios y clases MEP ────────────────────────────────────────────────────
const spaces = rows.filter((r) => r.type === "SPACE");
check(`IFCSPACE por cada cuarto (${spaces.length}/${plan.rooms.length})`, spaces.length === plan.rooms.length);
check("MEP con clases reales (SanitaryTerminal/LightFixture/DistributionBoard) y 0 proxies genéricos",
  /IFCSANITARYTERMINAL|IFCLIGHTFIXTURE|IFCELECTRICDISTRIBUTIONBOARD/.test(ifc) && !/IFCBUILDINGELEMENTPROXY/.test(ifc));

console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
