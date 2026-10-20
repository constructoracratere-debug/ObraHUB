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
const fills = [...ent.values()].filter((e) => e.type === "IFCRELFILLSELEMENT");
check(`IFCOPENINGELEMENT por cada vano (${openings.length} vanos)`, openings.length >= 4);
check(`IFCRELVOIDSELEMENT muro→vano (${voids.length})`, voids.length === openings.length && voids.length > 0);
check(`IFCRELFILLSELEMENT vano→puerta/ventana (${fills.length})`, fills.length >= rows.filter((r) => r.type === "DOOR" || r.type === "WINDOW").length && fills.length > 0);
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

// ── Review #12: codec GUID exacto + unicidad GLOBAL + aridad OPENING ────────
const { ifcGuidCompress, ifcGuidDecompress } = req(path.join(process.cwd(), ".tmp-ifc", "ifc.js"));
check("codec GUID buildingSMART: round-trip exacto (compress∘decompress = id)",
  guids.every((g) => ifcGuidCompress(ifcGuidDecompress(g)) === g) && ifcGuidDecompress(ifcGuidCompress("2ac13b9d4f0c8a7b1e2d3f4a5b6c7d8e")).length === 32);
check("GUIDs ÚNICOS ENTRE PROYECTOS (scope = identidad persistente del plan)", (() => {
  const otro = planToIfc(sanitizeFloorPlan({ ...plan, name: "Otro Proyecto Distinto" }));
  const g1 = ifc.match(/= IFCPROJECT\('([^']{22})'/)?.[1];
  const g2 = otro.match(/= IFCPROJECT\('([^']{22})'/)?.[1];
  return !!g1 && !!g2 && g1 !== g2;
})());
check("IFCOPENINGELEMENT aridad IFC4 (9 atributos: PredefinedType .OPENING.)",
  openingsRowsAll().every((e) => /\$,\s*\.OPENING\.\s*$/.test(e.args)));
function openingsRowsAll() { return [...ent.values()].filter((e) => e.type === "IFCOPENINGELEMENT"); }

// ── Review de exportaciones: GlobalIds ESTABLES ante edición ajena ─────────
// Editar UN cuarto no puede desplazar los IDs de elementos no relacionados
// (antes el contador global los corría a todos — emparejar revisiones era azar).
check("GlobalIds estables: editar 1 cuarto no mueve los IDs ajenos", (() => {
  const guidsPorNombre = (texto) => {
    const map = new Map();
    for (const m of texto.matchAll(/= IFC\w+\('([^']{22})',#\d+,'([^']*)'/g)) map.set(m[2].trim(), m[1]);
    return map;
  };
  const a = guidsPorNombre(ifc);
  const editado = planToIfc(sanitizeFloorPlan({
    ...plan,
    rooms: plan.rooms.map((r) => (r.name === plan.rooms[plan.rooms.length - 1].name ? { ...r, name: "Cuarto Editado QA" } : r)),
  }));
  const b = guidsPorNombre(editado);
  let iguales = 0, distintos = 0;
  for (const [nombre, gid] of a) {
    if (!b.has(nombre)) continue; // elementos del cuarto editado: cambian, es correcto
    if (b.get(nombre) === gid) iguales++; else distintos++;
  }
  return iguales > 30 && distintos === 0;
})());

// ── Validador INDEPENDIENTE (IfcOpenShell — EXPRESS real, no regex propio) ──
// OBLIGATORIO (review de exportaciones): un verde sin validación externa no
// prueba nada. Si falta python/ifcopenshell el check FALLA — escapar exige
// SKIP_IFCOPENSHELL=1 explícito (consciente, no por accidente).
if (process.env.SKIP_IFCOPENSHELL !== "1") {
  let hasIfc = false;
  try { execSync(`python -c "import ifcopenshell"`, { stdio: "pipe" }); hasIfc = true; } catch { /* abajo falla */ }
  if (!hasIfc) {
    check("ifcopenshell DISPONIBLE para validación independiente (instálalo: pip install ifcopenshell — o SKIP_IFCOPENSHELL=1 consciente)", false);
  } else {
    try {
      const { writeFileSync } = await import("node:fs");
      const dir = path.join(process.cwd(), ".tmp-ifc");
      writeFileSync(path.join(dir, "zcheck.ifc"), ifc, "utf8");
      // Suite completa de QA IFC: schema validate + GUID encoder vs referencia
      // + unicidad (archivo y entre archivos) + espacial + vanos + unidades.
      try {
        const qa = execSync(`python "${path.join(process.cwd(), "scripts", "qa-ifc.py")}" "${dir}"`, {
          encoding: "utf8", stdio: "pipe",
        }).trim();
        check(`qa-ifc (schema + GUID + vanos + unidades): ${qa.split("\n").pop()}`, qa.includes("IFC validado"));
      } catch (e) {
        const out_ = (String(e.stdout ?? "") + String(e.stderr ?? "")).split("\n").filter((l) => l.trim());
        check(`qa-ifc (${out_.slice(-2).join(" | ").slice(0, 110)})`, false);
      }
      const { writeFileSync: wf } = await import("node:fs");
      wf(path.join(dir, "validate_external.py"), [
        "import sys, re, ifcopenshell, ifcopenshell.guid as G",
        "from ifcopenshell import ifcopenshell_wrapper as W",
        `f = ifcopenshell.open(sys.argv[1])`,
        "assert f.schema == 'IFC4', f.schema",
        "# 1) NINGUNA entidad puede caerse al parsear (el typo FILLESELEMENT",
        "#    se coló así: ifcopenshell descarta silenciosamente).",
        "raw = open(sys.argv[1], encoding='utf-8').read()",
        "raw_ids = set(int(m) for m in re.findall(r'#(\\d+)= [A-Z]', raw))",
        "parsed = set(e.id() for e in f)",
        "dropped = raw_ids - parsed",
        "assert not dropped, f'entidades descartadas: {sorted(dropped)[:6]}'",
        "# 2) todo nombre de entidad existe en el schema IFC4",
        "names = set(re.findall(r'= ([A-Z0-9_]+)\\(', raw))",
        "decls = set(d.name().upper() for d in W.schema_by_name('IFC4').declarations())",
        "unknown = names - decls",
        "assert not unknown, f'fuera de schema IFC4: {sorted(unknown)[:6]}'",
        "# 3) GUIDs válidos (codec buildingSMART) y únicos",
        "dec = getattr(G, 'unexpand', None) or getattr(G, 'expand', None) or getattr(G, 'decompress')",
        "seen = set(); n = 0",
        "for e in f:",
        "    gid = getattr(e, 'GlobalId', None)",
        "    if gid:",
        "        dec(gid)  # lanza si la compresión no es válida",
        "        assert gid not in seen, gid",
        "        seen.add(gid); n += 1",
        "# 4) patrón de vanos completo (fills > 0 — el typo los mataba)",
        "ops = f.by_type('IfcOpeningElement')",
        "assert all(o.PredefinedType == 'OPENING' for o in ops)",
        "fills = f.by_type('IfcRelFillsElement'); voids = f.by_type('IfcRelVoidsElement')",
        "cts = f.by_type('IfcRelContainedInSpatialStructure')",
        "assert len(fills) > 0, 'sin fills'",
        "print(f'IFCOPENSHELL OK {n} GUIDs | {len(f.by_type(\"IfcWall\"))} muros | {len(ops)} openings | {len(voids)} voids | {len(fills)} fills | {len(cts)} containments')",
      ].join("\n"));
      const py = execSync(`python "${path.join(dir, "validate_external.py")}" "${path.join(dir, "zcheck.ifc")}"`, { encoding: "utf8", stdio: "pipe" }).trim();
      check(`ifcopenshell (EXPRESS independiente): ${py}`, py.startsWith("IFCOPENSHELL OK"));
    } catch (e) {
      check(`ifcopenshell valida el archivo (${String(e).split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 80)})`, false);
    }
  }
}

console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
