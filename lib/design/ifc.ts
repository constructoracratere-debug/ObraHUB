/**
 * ✏️ Diseño IA — Escritor IFC4 (obra gris detallada + instalaciones).
 *
 * Genera texto STEP determinístico desde el mismo FloorPlan del DXF:
 *  · Muros por CAPAS DE MATERIAL (IfcMaterialLayerSet según sistema constructivo)
 *  · Columnas en intersecciones de la retícula, vigas sobre ejes, losa por nivel
 *  · Cimentación: zapatas aisladas bajo cada columna
 *  · Puertas/ventanas como sólidos con material propio (madera/vidrio)
 *  · Aparatos eléctricos e hidrosanitarios como bloques paramétricos NOMBRADOS
 *    (seleccionables en el visor IFC de ObraHub con su nombre)
 *
 * Reglas aprendidas del bug de placements: IFCCARTESIANPOINT SIEMPRE entidad
 * separada (nunca inline) y todo IFCAXIS2PLACEMENT3D referencia entidades #N.
 */

import type { FloorPlan, Room } from "./schema";
import { WALL_ASSEMBLIES, CONCRETE, MEP_BLOCKS, MATERIALS } from "./materials";

type Line = string;

export function planToIfc(plan: FloorPlan): string {
  guidCounter = 0; // reproducibilidad: cada generación parte de cero
  const lines: Line[] = [];
  let next = 0;
  const id = () => ++next;
  const cache = new Map<string, number>();

  /** Entidad cacheada por firma — determinismo y reuso de instancias. */
  const ent = (signature: string, build: (n: number) => string): number => {
    const hit = cache.get(signature);
    if (hit) return hit;
    const n = id();
    lines.push(build(n));
    cache.set(signature, n);
    return n;
  };

  const pt2 = (x: number, y: number) => ent(`P2:${x},${y}`, (n) => `#${n}= IFCCARTESIANPOINT((${f(x)},${f(y)}));`);
  const pt3 = (x: number, y: number, z: number) => ent(`P3:${x},${y},${z}`, (n) => `#${n}= IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}));`);
  const dir3 = (x: number, y: number, z: number) => ent(`D3:${x},${y},${z}`, (n) => `#${n}= IFCDIRECTION((${f(x)},${f(y)},${f(z)}));`);
  const dir2 = (x: number, y: number) => ent(`D2:${x},${y}`, (n) => `#${n}= IFCDIRECTION((${f(x)},${f(y)}));`);

  const axisZ = ent("AZ", (n) => `#${n}= IFCAXIS2PLACEMENT3D(#${pt3(0, 0, 0)},#${dir3(0, 0, 1)},#${dir3(1, 0, 0)});`);
  const place3 = (x: number, y: number, z: number) =>
    ent(`PL:${x},${y},${z}`, (n) => `#${n}= IFCAXIS2PLACEMENT3D(#${pt3(x, y, z)},#${dir3(0, 0, 1)},${x !== 0 || y !== 0 ? `#${dir3(1, 0, 0)}` : `#${dir3(1, 0, 0)}`});`);

  const levels = Math.max(1, plan.levels);
  const fft = plan.floorToFloor;
  const { width: W, depth: D } = plan.outline;
  const system = plan.structure?.system ?? "concreto";
  const asm = WALL_ASSEMBLIES[system] ?? WALL_ASSEMBLIES.concreto;

  // ── Header + contexto ─────────────────────────────────────────────────────
  // Timestamp DETERMINISTA derivado del nombre (reproducibilidad byte a byte).
  let h0 = 0;
  for (const ch of plan.name) h0 = (h0 * 31 + ch.charCodeAt(0)) >>> 0;
  const epoch = 1735689600 + (h0 % 31536000); // base 2025-01-01 + hash
  const ts = new Date(epoch * 1000).toISOString().slice(0, 19);
  lines.unshift(
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ObraHub — Diseño IA: modelo de obra gris + instalaciones'),'2;1');",
    `FILE_NAME('${plan.name.replace(/'/g, "")}.ifc','${ts}',('ObraHub Diseño IA'),('Cratere S.A.S.'),'ObraHub IFC Writer 1.0','ObraHub','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  );

  const person = ent("PERS", (n) => `#${n}= IFCPERSON($,'Pineda Escobar','Diego Orlando',$,$,$,$,$);`);
  const org = ent("ORG", (n) => `#${n}= IFCORGANIZATION($,'Cratere S.A.S. — ObraHub',$,$,$);`);
  const pando = ent("PANDO", (n) => `#${n}= IFCPERSONANDORGANIZATION(#${person},#${org},$);`);
  const app = ent("APP", (n) => `#${n}= IFCAPPLICATION(#${org},'1.0','ObraHub Diseño IA','ObraHub-IA');`);
  const stamp = ent("STAMP", (n) => `#${n}= IFCCERTIFICATION($,$,$,$,$,$);`);
  const owner = ent("OWNER", (n) => `#${n}= IFCOWNERHISTORY(#${pando},#${app},$,'ADDED',$,${pando},#${app},${epoch});`);

  const lengthUnit = ent("LU", (n) => `#${n}= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  const areaUnit = ent("AU", (n) => `#${n}= IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  const volUnit = ent("VU", (n) => `#${n}= IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
  const units = ent("UNITS", (n) => `#${n}= IFCUNITASSIGNMENT((#${lengthUnit},#${areaUnit},#${volUnit}));`);

  const worldCS = ent("WCS", (n) => `#${n}= IFCAXIS2PLACEMENT3D(#${pt3(0, 0, 0)},#${dir3(0, 0, 1)},#${dir3(1, 0, 0)});`);
  const ctx = ent("CTX", (n) => `#${n}= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${worldCS},#${units});`);

  const proj = ent("PROJ", (n) => `#${n}= IFCPROJECT('${guid("P0")}',#${owner},'${plan.name.replace(/'/g, "")}',$,$,$,$,(#${ctx}),#${units});`);
  const sitePlace = ent("SITEPL", (n) => `#${n}= IFCLOCALPLACEMENT($,#${axisZ});`);
  const site = ent("SITE", (n) => `#${n}= IFCSITE('${guid("S0")}',#${owner},'Terreno',$,$,#${sitePlace},$,$,.ELEMENT.,$,$,0.,$,$);`);
  const bldgPlace = ent("BLDGPL", (n) => `#${n}= IFCLOCALPLACEMENT(#${sitePlace},#${axisZ});`);
  const bldg = ent("BLDG", (n) => `#${n}= IFCBUILDING('${guid("B0")}',#${owner},'${plan.name.replace(/'/g, "")}',$,$,#${bldgPlace},$,$,.ELEMENT.,$,$,$);`);

  // Relaciones agregación.
  const relContains = (parent: number, children: number[], tag: string) =>
    ent(`REL:${tag}`, (n) => `#${n}= IFCRELAGGREGATES('${guid(tag)}',#${owner},$,$,#${parent},(${children.map((c) => `#${c}`).join(",")}));`);

  // ── Materiales (IfcMaterial + LayerSets) ─────────────────────────────────
  const material = (name: string) => ent(`MAT:${name}`, (n) => `#${n}= IFCMATERIAL('${esc(name)}',$,$);`);
  const layerSet = (label: string, layers: Array<{ name: string; thickness: number }>) => {
    const ls = ent(`MLS:${label}`, (n) => `#${n}= IFCMATERIALLAYERSET((#${layers.map((l) => layer(l.name, l.thickness)).join(",#")}), '${esc(label)}');`);
    return ls;
  };
  const layer = (name: string, t: number) => ent(`LY:${name}:${t}`, (n) => `#${n}= IFCMATERIALLAYER(#${material(name)},${f(t)},$,'${esc(name)}',$,$,$);`);

  const extSet = layerSet(asm.ext.label, asm.ext.layers);
  const intSet = layerSet(asm.int.label, asm.int.layers);
  const relAssoc = (product: number, matOrSet: number, tag: string, isSet = false) =>
    ent(`RA:${tag}:${product}:${matOrSet}`, (n) =>
      isSet
        ? `#${n}= IFCRELASSOCIATESMATERIAL('${guid(tag)}',#${owner},$,$,(#${product}),#${matOrSet});`
        : `#${n}= IFCRELASSOCIATESMATERIAL('${guid(tag)}',#${owner},$,$,(#${product}),#${matOrSet});`);

  // ── Sólidos: caja extruida en (x,y,z) con base w×d y altura h ────────────
  const solidBox = (x: number, y: number, z: number, w: number, d: number, h: number, along: "x" | "y") => {
    // Rectángulo centrado en el eje del elemento; extruido hacia +Z.
    const prof =
      along === "x"
        ? ent(`RPX:${w},${d}`, (n) => `#${n}= IFCRECTANGLEPROFILEDEF(.AREA.,$,#${axis2(0, 0)},${f(w)},${f(d)});`)
        : ent(`RPY:${d},${w}`, (n) => `#${n}= IFCRECTANGLEPROFILEDEF(.AREA.,$,#${axis2(0, 0)},${f(d)},${f(w)});`);
    const pl = ent(`SP:${x},${y},${z}`, (n) => `#${n}= IFCAXIS2PLACEMENT3D(#${pt3(x, y, z)},#${dir3(0, 0, 1)},#${dir3(0, 1, 0)});`);
    return ent(`SOL:${x},${y},${z},${w},${d},${h},${along}`, (n) => `#${n}= IFCEXTRUDEDAREASOLID(#${prof},#${pl},#${dir3(0, 0, 1)},${f(h)});`);
  };

  const axis2 = (x: number, y: number) => ent(`A2:${x},${y}`, (n) => `#${n}= IFCAXIS2PLACEMENT2D(#${pt2(x, y)},#${dir2(1, 0)});`);

  const shapeRep = (solid: number, tag: string) => {
    const sr = ent(`SHR:${tag}`, (n) => `#${n}= IFCSHAPEREPRESENTATION(#${ctx},'Body','SweptSolid',(#${solid}));`);
    return ent(`PRD:${tag}`, (n) => `#${n}= IFCPRODUCTDEFINITIONSHAPE($,$,(#${sr}));`);
  };

  // ── Productos por nivel ───────────────────────────────────────────────────
  const allProducts: number[] = [];
  const storeys: number[] = [];

  for (let lvl = 0; lvl < levels; lvl++) {
    const z0 = lvl * fft;
    const storeyPlace = ent(`STPL:${lvl}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${bldgPlace},#${place3(0, 0, z0)});`);
    const storey = ent(`STY:${lvl}`, (n) => `#${n}= IFCBUILDINGSTOREY('${guid(`L${lvl}`)}',#${owner},'Nivel ${lvl + 1} (+${f(z0)})',$,$,#${storeyPlace},$,$,.ELEMENT.,${f(z0)});`);
    storeys.push(storey);
    const products: number[] = [];

    const wall = (x: number, y: number, w: number, d: number, along: "x" | "y", setName: number, name: string) => {
      const solid = solidBox(x, y, z0, w, d, fft, along);
      const prd = shapeRep(solid, `W${x},${y},${z0},${w},${d},${along}`);
      const pl = ent(`WPL:${x},${y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCWALLSTANDARDCASE('${guid(name)}',#${owner},'${esc(name)}',$,$,#${pl},#${prd},$,.STANDARD.);`);
      relAssoc(prod, setName, `WA${name}`, true);
      products.push(prod);
    };

    // Muros exteriores (anillo) e interiores (bordes compartidos dedup).
    const te = extThickness(asm);
    // Exterior: 4 bandas centradas en el eje medio del muro.
    wall(W / 2, te / 2, W, te, "x", extSet, `Muro exterior sur N${lvl + 1}`);
    wall(W / 2, D - te / 2, W, te, "x", extSet, `Muro exterior norte N${lvl + 1}`);
    wall(te / 2, D / 2, D, te, "y", extSet, `Muro exterior oeste N${lvl + 1}`);
    wall(W - te / 2, D / 2, D, te, "y", extSet, `Muro exterior este N${lvl + 1}`);

    // Interiores: aristas horizontales y verticales compartidas.
    const edges = interiorEdges(plan.rooms.filter((r) => r.level === lvl), W, D, te);
    const ti = intThickness(asm);
    for (const e of edges) {
      if (e.along === "x") wall(e.cx, e.cy, e.len, ti, "x", intSet, `División N${lvl + 1} y=${f(e.cy)}`);
      else wall(e.cx, e.cy, e.len, ti, "y", intSet, `División N${lvl + 1} x=${f(e.cx)}`);
    }

    // Columnas en intersecciones de la retícula + vigas sobre ejes.
    const axes = plan.structure?.axes ?? [];
    const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at);
    const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at);
    const colDim = system === "acero_liviano" ? CONCRETE.columnLigero : CONCRETE.column;
    const colMat = material(system === "concreto" || system === "mixto" ? MATERIALS.concreto : system === "acero_liviano" ? MATERIALS.acero : MATERIALS.maderaMat);

    const columnAt = (x: number, y: number) => {
      const solid = solidBox(x, y, z0, colDim.w, colDim.d, fft, "x");
      const prd = shapeRep(solid, `C${x},${y},${z0}`);
      const pl = ent(`CPL:${x},${y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCCOLUMN('${guid(`C${x},${y},${lvl}`)}',#${owner},'Columna eje (${f(x)},${f(y)}) N${lvl + 1} — ${system === "acero_liviano" ? "poste metálico" : "concreto 3000 PSI"}',$,$,#${pl},#${prd},$,.COLUMN.);`);
      relAssoc(prod, colMat, `CM${x},${y},${lvl}`);
      products.push(prod);
      return prod;
    };

    for (const x of vs.length ? vs : [te, W - te]) {
      if (x < 0.05 || x > W - 0.05) continue;
      for (const y of hs.length ? hs : [te, D - te]) {
        if (y < 0.05 || y > D - 0.05) continue;
        columnAt(x, y);
      }
    }

    // Vigas: a lo largo de cada eje horizontal/vertical (intra nivel superior).
    const beamMat = material(MATERIALS.concreto);
    for (const y of hs.length ? hs : []) {
      if (y < 0.05 || y > D - 0.05) continue;
      const solid = solidBox(W / 2, y, z0 + fft - CONCRETE.beam.d, W - 2 * te, CONCRETE.beam.w, CONCRETE.beam.d, "x");
      const prd = shapeRep(solid, `BMx${y},${z0}`);
      const pl = ent(`BMPLx:${y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCBEAM('${guid(`BMx${y},${lvl}`)}',#${owner},'Viga eje y=${f(y)} N${lvl + 1} — concreto 3000 PSI',$,$,#${pl},#${prd},$,.BEAM.);`);
      relAssoc(prod, beamMat, `BMx${y},${lvl}`);
      products.push(prod);
    }
    for (const x of vs.length ? vs : []) {
      if (x < 0.05 || x > W - 0.05) continue;
      const solid = solidBox(x, D / 2, z0 + fft - CONCRETE.beam.d, D - 2 * te, CONCRETE.beam.w, CONCRETE.beam.d, "y");
      const prd = shapeRep(solid, `BMy${x},${z0}`);
      const pl = ent(`BMPLy:${x},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCBEAM('${guid(`BMy${x},${lvl}`)}',#${owner},'Viga eje x=${f(x)} N${lvl + 1} — concreto 3000 PSI',$,$,#${pl},#${prd},$,.BEAM.);`);
      relAssoc(prod, beamMat, `BMy${x},${lvl}`);
      products.push(prod);
    }

    // Losa de pisotecho (encima del nivel).
    const slabT = system === "acero_liviano" ? CONCRETE.slabLigera.thickness : CONCRETE.slab.thickness;
    const slabSolid = solidBox(W / 2, D / 2, z0 + fft, W, D, slabT, "x");
    const slabPrd = shapeRep(slabSolid, `SL${z0}`);
    const slabPl = ent(`SLPL:${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
    const slab = id();
    lines.push(`#${slab}= IFCSLAB('${guid(`SL${lvl}`)}',#${owner},'Losa N${lvl + 1} — ${slabT === 0.1 ? "ligera e=10cm" : "concreto e=12cm"}',$,$,#${slabPl},#${slabPrd},$,.FLOOR.);`);
    relAssoc(slab, material(slabT === 0.1 ? "Losa ligera steel deck" : MATERIALS.losa), `SLM${lvl}`);
    products.push(slab);

    // Placa de piso nivel 0.
    if (lvl === 0) {
      const fs = solidBox(W / 2, D / 2, -0.1, W, D, 0.1, "x");
      const fp = shapeRep(fs, "FS0");
      const fpl = ent("FSPL0", (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const contrapiso = id();
      lines.push(`#${contrapiso}= IFCSLAB('${guid("FS")}',#${owner},'Placa de contrapiso e=10cm',$,$,#${fpl},#${fp},$,.FLOOR.);`);
      relAssoc(contrapiso, material(MATERIALS.concreto), "FSM");
      products.push(contrapiso);

      // Cimentación: zapatas bajo columnas (nivel -1 conceptual).
      for (const x of vs.length ? vs : [te, W - te]) {
        if (x < 0.05 || x > W - 0.05) continue;
        for (const y of hs.length ? hs : [te, D - te]) {
          if (y < 0.05 || y > D - 0.05) continue;
          const s2 = solidBox(x, y, -CONCRETE.footing.pad * 0.0 - 1.4, CONCRETE.footing.pad, CONCRETE.footing.pad, CONCRETE.footing.thickness, "x");
          const p2 = shapeRep(s2, `FT${x},${y}`);
          const pl2 = ent(`FTPL:${x},${y}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
          const ft = id();
          lines.push(`#${ft}= IFCFOOTING('${guid(`FT${x},${y}`)}',#${owner},'Zapata aislada (${f(x)},${f(y)}) 1.10×1.10×0.30 — concreto 3000 PSI',$,$,#${pl2},#${p2},$,.PAD_FOOTING.);`);
          relAssoc(ft, material(MATERIALS.concreto), `FTM${x},${y}`);
          products.push(ft);
        }
      }
    }

    // Puertas (hoja de madera en el vano) y ventanas (vidrio).
    for (const d of plan.doors.filter((x) => x.level === lvl)) {
      const s3 = solidBox(d.x, d.y, z0 + 0.0, Math.max(d.width - 0.04, 0.3), 0.05, 2.1, "x");
      const pr3 = shapeRep(s3, `DR${d.x},${d.y},${z0}`);
      const pl3 = ent(`DRPL:${d.x},${d.y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const dr = id();
      lines.push(`#${dr}= IFCDOOR('${guid(`DR${d.x},${d.y},${lvl}`)}',#${owner},'Puerta ${esc(d.from)}→${esc(d.to)} 0.90m madera',$,$,#${pl3},#${pr3},$,2.1,1.0,.DOOR.,.SINGLE_SWING_LEFT.,$);`);
      relAssoc(dr, material(MATERIALS.hojaPuerta), `DRM${d.x},${d.y},${lvl}`);
      products.push(dr);
    }
    for (const w of plan.windows.filter((x) => x.level === lvl)) {
      const room = plan.rooms.find((r) => r.level === lvl && keyOf(r.name) === keyOf(w.room));
      if (!room) continue;
      const y2 = w.wall === "norte" ? room.y + room.depth : w.wall === "sur" ? room.y : w.x;
      const x2 = w.wall === "este" ? room.x + room.width : w.wall === "oeste" ? room.x : w.x;
      const along = w.wall === "norte" || w.wall === "sur" ? "x" : "y";
      const s4 = solidBox(x2, y2, z0 + w.sill, along === "x" ? w.width : 0.06, along === "x" ? 0.06 : w.width, w.height, along);
      const pr4 = shapeRep(s4, `WN${x2},${y2},${z0}`);
      const pl4 = ent(`WNPL:${x2},${y2},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const wn = id();
      lines.push(`#${wn}= IFCWINDOW('${guid(`WN${x2},${y2},${lvl}`)}',#${owner},'Ventana ${esc(w.room)} ${esc(w.wall)} ${f(w.width)}m vidrio 6mm',$,$,#${pl4},#${pr4},$,${f(w.height)},${f(w.width)},.WINDOW.,.SINGLE_PANEL.,$);`);
      relAssoc(wn, material(MATERIALS.vidrio), `WNM${x2},${y2},${lvl}`);
      products.push(wn);
    }

    // Instalaciones — bloques paramétricos NOMBRADOS (seleccionables).
    const proxy = (x: number, y: number, z: number, w: number, d: number, h: number, name: string, mat: number, tag: string, along: "x" | "y" = "x") => {
      const s5 = solidBox(x, y, z, w, d, h, along);
      const pr5 = shapeRep(s5, tag);
      const pl5 = ent(`PXPL:${tag}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const px = id();
      lines.push(`#${px}= IFCBUILDINGELEMENTPROXY('${guid(tag)}',#${owner},'${esc(name)}',$,$,#${pl5},#${pr5},$,.ELEMENT.);`);
      relAssoc(px, mat, `PXM${tag}`);
      products.push(px);
    };

    const copMat = material(MATERIALS.cobre);
    const pvcMat = material(MATERIALS.griferia);
    for (const p of plan.electrical?.points ?? []) {
      if (p.level !== lvl) continue;
      const b = MEP_BLOCKS[p.kind] ?? MEP_BLOCKS.tomacorriente;
      proxy(p.x, p.y, b.z < 0 ? fft + b.z : b.z, b.w, b.d, b.h, `[ELÉCTRICO] ${b.kind} — ${p.room} (RETIE)`, copMat, `EL${p.x},${p.y},${lvl},${p.kind}`);
    }
    for (const p of plan.hydro?.points ?? []) {
      if (p.level !== lvl) continue;
      const b = MEP_BLOCKS[p.kind] ?? MEP_BLOCKS.punto_hidraulico;
      proxy(p.x, p.y, b.z, b.w, b.d, b.h, `[HIDROSANITARIO] ${b.kind} — ${p.room} (RAS)`, pvcMat, `HY${p.x},${p.y},${lvl},${p.kind}`);
    }

    allProducts.push(...products);
    relContains(storey, products, `ST${lvl}`);
  }

  relContains(proj, [site], "PRS");
  relContains(site, [bldg], "SIB");
  relContains(bldg, storeys, "BLST");

  lines.push("ENDSEC;", "END-ISO-10303-21;");
  return lines.join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────────
const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const esc = (s: string) => s.replace(/'/g, "''").slice(0, 90);
const keyOf = (s: string) => s.toLowerCase().replace(/\s+/g, "");



/** GUID determinista legible (22 chars base64-ish, estable por semilla). */
let guidCounter = 0;
function guid(seed: string): string {
  guidCounter++;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const g = (h.toString(36) + guidCounter.toString(36) + "00000000000000000").slice(0, 18);
  return g.toUpperCase().padEnd(22, "0");
}

const extThickness = (asm: { ext: { layers: Array<{ thickness: number }> } }) =>
  asm.ext.layers.reduce((s, l) => s + l.thickness, 0);
const intThickness = (asm: { int: { layers: Array<{ thickness: number }> } }) =>
  Math.max(asm.int.layers.reduce((s, l) => s + l.thickness, 0), 0.07);

/** Aristas interiores compartidas entre espacios (dedup + fusión simple). */
function interiorEdges(rooms: Room[], W: number, D: number, te: number): Array<{ cx: number; cy: number; len: number; along: "x" | "y" }> {
  const out: Array<{ cx: number; cy: number; len: number; along: "x" | "y" }> = [];
  const seen = new Set<string>();
  for (const r of rooms) {
    // Aristas verticales (compartidas si otro espacio toca el mismo x en rango y).
    for (const [x, y1, y2] of [[r.x, r.y, r.y + r.depth], [r.x + r.width, r.y, r.y + r.depth]] as const) {
      if (x <= te + 0.01 || x >= W - te - 0.01) continue;
      const shared = rooms.some((o) => o !== r && ((Math.abs(o.x + o.width - x) < 0.02 && overlap(o.y, o.depth, y1, y2 - y1)) || (Math.abs(o.x - x) < 0.02 && overlap(o.y, o.depth, y1, y2 - y1))));
      if (!shared) continue;
      const key = `V${x.toFixed(2)},${y1.toFixed(2)},${y2.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cx: x, cy: (y1 + y2) / 2, len: y2 - y1, along: "y" });
    }
    // Aristas horizontales.
    for (const [y, x1, x2] of [[r.y, r.x, r.x + r.width], [r.y + r.depth, r.x, r.x + r.width]] as const) {
      if (y <= te + 0.01 || y >= D - te - 0.01) continue;
      const shared = rooms.some((o) => o !== r && ((Math.abs(o.y + o.depth - y) < 0.02 && overlap(o.x, o.width, x1, x2 - x1)) || (Math.abs(o.y - y) < 0.02 && overlap(o.x, o.width, x1, x2 - x1))));
      if (!shared) continue;
      const key = `H${y.toFixed(2)},${x1.toFixed(2)},${x2.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cx: (x1 + x2) / 2, cy: y, len: x2 - x1, along: "x" });
    }
  }
  return out;
}

const overlap = (a: number, la: number, b: number, lb: number) =>
  Math.min(a + la, b + lb) - Math.max(a, b) > 0.05;
