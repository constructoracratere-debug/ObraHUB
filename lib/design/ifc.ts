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
import { furniture3D } from "./symbols";

type Line = string;

export function planToIfc(plan: FloorPlan, opts: { includeFoundations?: boolean } = {}): string {
  /** includeFoundations=false → modelo CAJA LIMPIA en 000: nada por debajo
   *  de N+0.00 ni por encima del último nivel (la vista vivo y el editor
   *  trabajan así; el export/descarga lleva zapatas y contrapiso). */
  const FOUND = opts.includeFoundations !== false;
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

  // Relaciones espaciales: AGGREGATES SOLO para el árbol espacial
  // (Project → Site → Building → Storeys → Spaces); los PRODUCTOS van por
  // CONTAINEDINSPATIALSTRUCTURE (patrón buildingSMART).
  const relContains = (parent: number, children: number[], tag: string) =>
    ent(`REL:${tag}`, (n) => `#${n}= IFCRELAGGREGATES('${guid(tag)}',#${owner},$,$,#${parent},(${children.map((c) => `#${c}`).join(",")}));`);
  const relContained = (storey: number, children: number[], tag: string) =>
    ent(`RCS:${tag}`, (n) => `#${n}= IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(tag)}',#${owner},$,$,(${children.map((c) => `#${c}`).join(",")}),#${storey});`);

  // ── Materiales (IfcMaterial + LayerSets) ─────────────────────────────────
  const material = (name: string) => ent(`MAT:${name}`, (n) => `#${n}= IFCMATERIAL('${esc(name)}',$,$);`);
  const layerSet = (label: string, layers: Array<{ name: string; thickness: number }>) => {
    const ls = ent(`MLS:${label}`, (n) => `#${n}= IFCMATERIALLAYERSET((#${layers.map((l) => layer(l.name, l.thickness)).join(",#")}), '${esc(label)}');`);
    return ls;
  };
  const layer = (name: string, t: number) => ent(`LY:${name}:${t}`, (n) => `#${n}= IFCMATERIALLAYER(#${material(name)},${f(t)},$,'${esc(name)}',$,$,$);`);

  /** Pset 5D/6D: carbono y clasificación por elemento. Números como
   *  IFCREAL (legibles por máquina — no IFCLABEL), textos como IFCLABEL.
   *  Fuentes de los factores: EPD LATAM versionado en la KB del pasaporte
   *  (lib/passport/prices); acero estimado a 100 kg/m³ de concreto (práctica
   *  estructural CO para 3000 PSI con cuantía media). */
  const propSingle = (name: string, value: number | string, tag: string) =>
    typeof value === "number"
      ? ent(`PSV:${tag}`, (n) => `#${n}= IFCPROPERTYSINGLEVALUE('${esc(name)}',$,IFCREAL(${f(value)}),$);`)
      : ent(`PSV:${tag}`, (n) => `#${n}= IFCPROPERTYSINGLEVALUE('${esc(name)}',$,IFCLABEL('${esc(String(value))}'),$);`);
  const pset = (product: number, setName: string, props: Array<[string, number | string]>, tag: string) => {
    const propsN = props.map(([k, v]) => propSingle(k, v, tag + ":" + k));
    const ps = ent(`PS:${tag}`, (n) => `#${n}= IFCPROPERTYSET('${guid(tag)}',#${owner},'${esc(setName)}',$,(#${propsN.join(",#")}));`);
    ent(`RDP:${tag}`, (n) => `#${n}= IFCRELDEFINESBYPROPERTIES('${guid("RD" + tag)}',#${owner},$,$,(#${product}),#${ps});`);
  };

  /** Cantidades TIPADAS (Qto): IFCQUANTITYLENGTH/AREA/VOLUME/WEIGHT en
   *  unidades SI del modelo — lo que un lector BIM espera para 5D. */
  type QKind = "L" | "A" | "V" | "W";
  const qto = (product: number, items: Array<[QKind, string, number]>, tag: string) => {
    if (items.length === 0) return;
    const qs = items.map(([kind, nm, v]) => {
      const val = f(v);
      const entName = kind === "L" ? "IFCQUANTITYLENGTH" : kind === "A" ? "IFCQUANTITYAREA" : kind === "V" ? "IFCQUANTITYVOLUME" : "IFCQUANTITYWEIGHT";
      return ent(`QT:${tag}:${nm}`, (n) => `#${n}= ${entName}('${esc(nm)}',$,$,${val},$);`);
    });
    const eq = ent(`EQT:${tag}`, (n) => `#${n}= IFCELEMENTQUANTITY('${guid(tag)}',#${owner},'Qto_ObraHubBaseQuantities',$,'OBRAHUB',(#${qs.join(",#")}));`);
    ent(`RQT:${tag}`, (n) => `#${n}= IFCRELDEFINESBYPROPERTIES('${guid("RQ" + tag)}',#${owner},$,$,(#${product}),#${eq});`);
  };
  const CO2_CONCRETO = 305, CO2_ACERO = 1.9; // kgCO2e — EPD LATAM (KB passport)

  const extSet = layerSet(asm.ext.label, asm.ext.layers);
  const intSet = layerSet(asm.int.label, asm.int.layers);
  const relAssoc = (product: number, matOrSet: number, tag: string, isSet = false) =>
    ent(`RA:${tag}:${product}:${matOrSet}`, (n) =>
      isSet
        ? `#${n}= IFCRELASSOCIATESMATERIAL('${guid(tag)}',#${owner},$,$,(#${product}),#${matOrSet});`
        : `#${n}= IFCRELASSOCIATESMATERIAL('${guid(tag)}',#${owner},$,$,(#${product}),#${matOrSet});`);

  // ── Sólidos: caja extruida en (x,y,z) con base w×d y altura h ────────────
  // along="y": el RefDirection del sólido gira el perfil 90° (X local → Y
  // mundo). Así el muro este/oeste queda orientado de verdad — cualquier
  // visor (web-ifc, BIMvision, Revit) lo dibuja en su sitio.
  const solidBox = (x: number, y: number, z: number, w: number, d: number, h: number, along: "x" | "y") => {
    // Perfil SIEMPRE con la longitud sobre X local (la rotación la pone el placement).
    const prof = ent(`RPX:${w},${d}`, (n) => `#${n}= IFCRECTANGLEPROFILEDEF(.AREA.,$,#${axis2(0, 0)},${f(along === "x" ? w : d)},${f(along === "x" ? d : w)});`);
    const ref = along === "x" ? dir3(1, 0, 0) : dir3(0, 1, 0);
    const pl = ent(`SP:${x},${y},${z},${along}`, (n) => `#${n}= IFCAXIS2PLACEMENT3D(#${pt3(x, y, z)},#${dir3(0, 0, 1)},#${ref});`);
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

    // Vanos como APERTURAS BIM formales: registro para que puertas/ventanas
    // se hospeden (RelFillsElement) en su opening correspondiente.
    const openingRegistry: Array<{ kind: "door" | "window"; at: number; along: "x" | "y"; w: number; sill: number; op: number; openingPl: number }> = [];

    const wall = (x: number, y: number, w: number, d: number, along: "x" | "y", setName: number, name: string, zBot = 0, h = fft): { prod: number; pl: number } => {
      // Z nivel-local (el storey ya suma z0): zBot/h reales del SEGMENTO
      // (antes todo muro nacía en z=0 a altura completa — los antepechos y
      // dinteles quedaban como muros duplicados de piso a techo).
      const solid = solidBox(x, y, zBot, w, d, h, along);
      const prd = shapeRep(solid, `W${x},${y},${z0},${zBot},${h},${w},${d},${along}`);
      const pl = ent(`WPL:${x},${y},${z0},${zBot}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCWALLSTANDARDCASE('${guid(name)}',#${owner},'${esc(name)}',$,$,#${pl},#${prd},$,.STANDARD.);`);
      relAssoc(prod, setName, `WA${name}`, true);
      pset(prod, "Pset_ObraHub_5D6D", [["Fase", "Obra gris"], ["Codigo", "A-MUROS"], ["Fuente_CO2", "EPD LATAM · KB passport"]], `P5W:${name}`);
      qto(prod, [["A", "Área neta muro", Math.max(w, d) * h], ["V", "Volumen muro", Math.max(w, d) * h * Math.min(w, d)]], `Q5W:${name}`);
      products.push(prod);
      return { prod, pl };
    };

    // Muro con VANOS REALES: segmentos entre vanos + antepecho bajo ventana +
    // dintel sobre vano, cada uno con SU zBot/h verdadero, más el
    // IFCOPENINGELEMENT formal del vano (RelVoidsElement) donde se hospedan
    // puertas/ventanas (RelFillsElement). at = coordenada ABSOLUTA de plano
    // del centro del vano (misma convención en exterior e interior).
    const wallWithOpenings = (
      cx: number, cy: number, len: number, th: number, along: "x" | "y",
      setName: number, name: string,
      openings: Array<{ at: number; w: number; sill: number; head: number; kind?: "door" | "window" }>,
    ) => {
      const s0 = (along === "x" ? cx : cy) - len / 2;
      const os = openings
        .filter((o) => o.at - o.w / 2 > s0 + 0.02 && o.at + o.w / 2 < s0 + len - 0.02)
        .sort((a, b) => a.at - b.at);
      let segN = 0;
      let hostSeg: { prod: number; pl: number } | null = null;
      const seg = (a: number, b: number, zBot: number, h: number, tag: string) => {
        const L = b - a;
        if (L < 0.03 || h < 0.03) return null;
        const mid = a + L / 2;
        const x = along === "x" ? mid : cx;
        const y = along === "x" ? cy : mid;
        const r = wall(x, y, along === "x" ? L : th, along === "x" ? th : L, along, setName, `${name} ${tag}${segN}`, zBot, h);
        segN++;
        return r;
      };
      let cursor = s0;
      for (const o of os) {
        seg(cursor, o.at - o.w / 2, 0, fft, "tramo");
        const ante = o.sill > 0.02 ? seg(o.at - o.w / 2, o.at + o.w / 2, 0, o.sill, "antepecho") : null;
        const dinte = o.head < fft - 0.02 ? seg(o.at - o.w / 2, o.at + o.w / 2, o.head, fft - o.head, "dintel") : null;
        cursor = o.at + o.w / 2;
        // Opening formal: geometría = el volumen del vano (coincide con los
        // sólidos), hospedado en el dintel (o antepecho) del propio muro.
        hostSeg = dinte ?? ante ?? hostSeg;
        const host = hostSeg;
        if (host) {
          const ox = along === "x" ? o.at : cx;
          const oy = along === "x" ? cy : o.at;
          const hgt = o.head - o.sill;
          const osolid = solidBox(ox, oy, o.sill, along === "x" ? o.w : th + 0.02, along === "x" ? th + 0.02 : o.w, hgt, along);
          const oprd = shapeRep(osolid, `OP${ox},${oy},${o.sill},${z0}`);
          const opl = ent(`OPPL:${ox},${oy},${o.sill},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${host.pl},#${axisZ});`);
          const op = id();
          lines.push(`#${op}= IFCOPENINGELEMENT('${guid(`OP${name}${o.at}`)}',#${owner},'Vano ${f(o.w)}m en ${esc(name)}',$,$,#${opl},#${oprd},$);`);
          ent(`RV:${name}:${o.at}`, (n) => `#${n}= IFCRELVOIDSELEMENT('${guid(`RV${name}${o.at}`)}',#${owner},$,$,#${host.prod},#${op});`);
          openingRegistry.push({ kind: o.kind ?? "window", at: o.at, along, w: o.w, sill: o.sill, op, openingPl: opl });
        }
      }
      seg(cursor, s0 + len, 0, fft, "tramo");
      if (segN === 0) wall(cx, cy, along === "x" ? len : th, along === "x" ? th : len, along, setName, name);
    };

    // Muros exteriores (anillo) e interiores (bordes compartidos dedup).
    const te = extThickness(asm);

    // Vanos por muro exterior: puertas (sill 0, head 2.10) + ventanas (sill/head
    // del JSON), solo si el espacio toca la envolvente (como en fachadas).
    const extOpenings = (side: "sur" | "norte" | "oeste" | "este") => {
      const ops: Array<{ at: number; w: number; sill: number; head: number; kind: "door" | "window" }> = [];
      for (const d of plan.doors.filter((x) => x.level === lvl)) {
        let doorSide: "sur" | "norte" | "oeste" | "este" | null = null;
        if (d.y < 0.35) doorSide = "sur";
        else if (d.y > D - 0.35) doorSide = "norte";
        else if (d.x < 0.35) doorSide = "oeste";
        else if (d.x > W - 0.35) doorSide = "este";
        if (doorSide !== side) continue;
        ops.push({ at: side === "oeste" || side === "este" ? d.y : d.x, w: d.width, sill: 0, head: 2.1, kind: "door" });
      }
      for (const w of plan.windows.filter((x) => x.level === lvl)) {
        if (w.wall !== side) continue;
        const room = plan.rooms.find((r) => r.level === lvl && keyOf(r.name) === keyOf(w.room));
        if (!room) continue;
        const edgePos = side === "norte" ? room.y + room.depth : side === "sur" ? room.y : side === "este" ? room.x + room.width : room.x;
        const buildingEdge = side === "norte" ? D : side === "sur" ? 0 : side === "este" ? W : 0;
        if (Math.abs(edgePos - buildingEdge) > 0.35) continue;
        ops.push({ at: w.x, w: w.width, sill: w.sill, head: w.sill + w.height, kind: "window" });
      }
      return ops;
    };

    // Exterior: 4 bandas centradas en el eje medio del muro — CON VANOS.
    wallWithOpenings(W / 2, te / 2, W, te, "x", extSet, `Muro exterior sur N${lvl + 1}`, extOpenings("sur"));
    wallWithOpenings(W / 2, D - te / 2, W, te, "x", extSet, `Muro exterior norte N${lvl + 1}`, extOpenings("norte"));
    wallWithOpenings(te / 2, D / 2, D, te, "y", extSet, `Muro exterior oeste N${lvl + 1}`, extOpenings("oeste"));
    wallWithOpenings(W - te / 2, D / 2, D, te, "y", extSet, `Muro exterior este N${lvl + 1}`, extOpenings("este"));

    // Interiores: aristas compartidas — cortadas en las puertas que las cruzan.
    const edges = interiorEdges(plan.rooms.filter((r) => r.level === lvl), W, D, te);
    const ti = intThickness(asm);
    for (const e of edges) {
      const name = `División N${lvl + 1} ${e.along === "x" ? `y=${f(e.cy)}` : `x=${f(e.cx)}`}`;
      // at = coordenada ABSOLUTA de plano a lo largo del eje del muro —
      // la MISMA convención de wallWithOpenings (antes se restaba s0 y el
      // bounds-check del vano leía un offset como absoluto: puertas corridas
      // o descartadas en muros con inicio > 0).
      const ops2 = plan.doors
        // Consistencia axis↔arista: muro "x" se corta con puertas axis "x".
        .filter((d) => d.level === lvl && (e.along === "x") === (d.axis !== "y") && (e.along === "x" ? Math.abs(d.y - e.cy) < 0.15 : Math.abs(d.x - e.cx) < 0.15))
        .map((d) => ({ at: e.along === "x" ? d.x : d.y, w: d.width, sill: 0, head: 2.1, kind: "door" as const }));
      if (ops2.length === 0) {
        wall(e.cx, e.cy, e.along === "x" ? e.len : ti, e.along === "x" ? ti : e.len, e.along === "x" ? "x" : "y", intSet, name);
      } else {
        wallWithOpenings(e.cx, e.cy, e.len, ti, e.along === "x" ? "x" : "y", intSet, name, ops2);
      }
    }

    // Columnas en intersecciones de la retícula + vigas sobre ejes.
    const axes = plan.structure?.axes ?? [];
    const vs = axes.filter((a) => a.orientation === "vertical").map((a) => a.at);
    const hs = axes.filter((a) => a.orientation === "horizontal").map((a) => a.at);
    const colDim = system === "acero_liviano" ? CONCRETE.columnLigero : CONCRETE.column;
    const colMat = material(system === "concreto" || system === "mixto" ? MATERIALS.concreto : system === "acero_liviano" ? MATERIALS.acero : MATERIALS.maderaMat);

    const columnAt = (x: number, y: number) => {
      const solid = solidBox(x, y, 0, colDim.w, colDim.d, fft, "x");
      const prd = shapeRep(solid, `C${x},${y},${z0}`);
      const pl = ent(`CPL:${x},${y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCCOLUMN('${guid(`C${x},${y},${lvl}`)}',#${owner},'Columna eje (${f(x)},${f(y)}) N${lvl + 1} — ${system === "acero_liviano" ? "poste metálico" : "concreto 3000 PSI"}',$,$,#${pl},#${prd},$,.COLUMN.);`);
      relAssoc(prod, colMat, `CM${x},${y},${lvl}`);
      const colVol = colDim.w * colDim.d * fft;
      pset(prod, "Pset_ObraHub_5D6D", [["Fase", "Estructura"], ["Codigo", "S-COLUMNA"], ["CO2e_kg", Math.round(colVol * (CO2_CONCRETO + 100 * CO2_ACERO))], ["Fuente_CO2", "EPD LATAM · acero 100 kg/m3"]], `P5C:${x},${y},${lvl}`);
      qto(prod, [["L", "Altura", fft], ["V", "Concreto m3", colVol], ["W", "Acero kg", colVol * 100]], `Q5C:${x},${y},${lvl}`);
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
      const solid = solidBox(W / 2, y, fft - CONCRETE.beam.d, W - 2 * te, CONCRETE.beam.w, CONCRETE.beam.d, "x");
      const prd = shapeRep(solid, `BMx${y},${z0}`);
      const pl = ent(`BMPLx:${y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCBEAM('${guid(`BMx${y},${lvl}`)}',#${owner},'Viga eje y=${f(y)} N${lvl + 1} — concreto 3000 PSI',$,$,#${pl},#${prd},$,.BEAM.);`);
      relAssoc(prod, beamMat, `BMx${y},${lvl}`);

      // Volumen = (longitud LIBRE) × sección — primero el producto, luego el
      // redondeo (antes el paréntesis mal puesto daba volúmenes absurdos).
      const bv = (W - 2 * te) * CONCRETE.beam.w * CONCRETE.beam.d;
      pset(prod, "Pset_ObraHub_5D6D", [["Fase", "Estructura"], ["Codigo", "S-VIGA"], ["CO2e_kg", Math.round(bv * (CO2_CONCRETO + 100 * CO2_ACERO))], ["Fuente_CO2", "EPD LATAM · acero 100 kg/m3"]], `P5BMx:${z0}`);
      qto(prod, [["L", "Longitud", W - 2 * te], ["V", "Concreto m3", bv], ["W", "Acero kg", bv * 100]], `Q5BMx:${z0}`);
      products.push(prod);
    }
    for (const x of vs.length ? vs : []) {
      if (x < 0.05 || x > W - 0.05) continue;
      const solid = solidBox(x, D / 2, fft - CONCRETE.beam.d, CONCRETE.beam.w, D - 2 * te, CONCRETE.beam.d, "y");
      const prd = shapeRep(solid, `BMy${x},${z0}`);
      const pl = ent(`BMPLy:${x},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const prod = id();
      lines.push(`#${prod}= IFCBEAM('${guid(`BMy${x},${lvl}`)}',#${owner},'Viga eje x=${f(x)} N${lvl + 1} — concreto 3000 PSI',$,$,#${pl},#${prd},$,.BEAM.);`);
      relAssoc(prod, beamMat, `BMy${x},${lvl}`);

      const bv = (D - 2 * te) * CONCRETE.beam.w * CONCRETE.beam.d;
      pset(prod, "Pset_ObraHub_5D6D", [["Fase", "Estructura"], ["Codigo", "S-VIGA"], ["CO2e_kg", Math.round(bv * (CO2_CONCRETO + 100 * CO2_ACERO))], ["Fuente_CO2", "EPD LATAM · acero 100 kg/m3"]], `P5BMy:${z0}`);
      qto(prod, [["L", "Longitud", D - 2 * te], ["V", "Concreto m3", bv], ["W", "Acero kg", bv * 100]], `Q5BMy:${z0}`);
      products.push(prod);
    }

    // Losa de pisotecho (encima del nivel).
    const slabT = system === "acero_liviano" ? CONCRETE.slabLigera.thickness : CONCRETE.slab.thickness;
    const slabSolid = solidBox(W / 2, D / 2, fft, W, D, slabT, "x");
    const slabPrd = shapeRep(slabSolid, `SL${z0}`);
    const slabPl = ent(`SLPL:${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
    const slab = id();
    lines.push(`#${slab}= IFCSLAB('${guid(`SL${lvl}`)}',#${owner},'Losa N${lvl + 1} — ${slabT === 0.1 ? "ligera e=10cm" : "concreto e=12cm"}',$,$,#${slabPl},#${slabPrd},$,.FLOOR.);`);
    relAssoc(slab, material(slabT === 0.1 ? "Losa ligera steel deck" : MATERIALS.losa), `SLM${lvl}`);
    const slabVol = W * D * slabT;
    pset(slab, "Pset_ObraHub_5D6D", [["Fase", "Estructura"], ["Codigo", "S-LOSA"], ["CO2e_kg", Math.round(slabVol * CO2_CONCRETO + slabVol * 100 * CO2_ACERO)], ["Fuente_CO2", "EPD LATAM · acero 100 kg/m3"]], `P5SL:${lvl}`);
    qto(slab, [["A", "Área losa", W * D], ["V", "Concreto m3", slabVol], ["W", "Acero kg", slabVol * 100]], `Q5SL:${lvl}`);
    products.push(slab);

    // Placa de piso nivel 0.
    if (lvl === 0 && FOUND) {
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

    // Puertas (hoja de madera en el vano) y ventanas (vidrio). Se hospedan
    // en su IFCOPENINGELEMENT cuando existe (RelFillsElement — patrón
    // buildingSMART); el ancho viene del PLAN (no hardcodeado).
    const fillOpening = (kind: "door" | "window", along: "x" | "y", at: number, w: number, sill: number, el: number, tag: string) => {
      const hit = openingRegistry.find((o) => o.kind === kind && o.along === along && Math.abs(o.at - at) < 0.05 && Math.abs(o.w - w) < 0.02 && Math.abs(o.sill - sill) < 0.02);
      if (!hit) return;
      ent(`RF:${tag}`, (n) => `#${n}= IFCRELFILLESELEMENT('${guid(`RF${tag}`)}',#${owner},$,$,#${hit.op},#${el});`);
    };
    for (const d of plan.doors.filter((x) => x.level === lvl)) {
      const alongD = d.axis === "y";
      const s3 = solidBox(d.x, d.y, 0, alongD ? 0.06 : Math.max(d.width - 0.04, 0.3), alongD ? Math.max(d.width - 0.04, 0.3) : 0.06, 2.1, "x");
      const pr3 = shapeRep(s3, `DR${d.x},${d.y},${z0}`);
      const host3 = openingRegistry.find((o) => o.kind === "door" && o.along === (alongD ? "y" : "x") && Math.abs(o.at - (alongD ? d.y : d.x)) < 0.05 && Math.abs(o.w - d.width) < 0.02);
      const pl3 = ent(`DRPL:${d.x},${d.y},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${host3 ? host3.openingPl : storeyPlace},#${axisZ});`);
      const dr = id();
      lines.push(`#${dr}= IFCDOOR('${guid(`DR${d.x},${d.y},${lvl}`)}',#${owner},'Puerta ${esc(d.from)}→${esc(d.to)} ${f(d.width)}m madera',$,$,#${pl3},#${pr3},$,2.1,${f(d.width)},.DOOR.,.SINGLE_SWING_LEFT.,$);`);
      relAssoc(dr, material(MATERIALS.hojaPuerta), `DRM${d.x},${d.y},${lvl}`);
      qto(dr, [["L", "Ancho", d.width], ["L", "Alto", 2.1], ["A", "Área vano", d.width * 2.1]], `Q5DR:${d.x},${d.y},${lvl}`);
      fillOpening("door", alongD ? "y" : "x", alongD ? d.y : d.x, d.width, 0, dr, `DR${d.x},${d.y},${z0}`);
      products.push(dr);
    }
    for (const w of plan.windows.filter((x) => x.level === lvl)) {
      const room = plan.rooms.find((r) => r.level === lvl && keyOf(r.name) === keyOf(w.room));
      if (!room) continue;
      const y2 = w.wall === "norte" ? room.y + room.depth : w.wall === "sur" ? room.y : w.x;
      const x2 = w.wall === "este" ? room.x + room.width : w.wall === "oeste" ? room.x : w.x;
      const along = w.wall === "norte" || w.wall === "sur" ? "x" : "y";
      const s4 = solidBox(x2, y2, w.sill, along === "x" ? w.width : 0.06, along === "x" ? 0.06 : w.width, w.height, along);
      const pr4 = shapeRep(s4, `WN${x2},${y2},${z0}`);
      const host4 = openingRegistry.find((o) => o.kind === "window" && o.along === along && Math.abs(o.at - w.x) < 0.05 && Math.abs(o.sill - w.sill) < 0.02);
      const pl4 = ent(`WNPL:${x2},${y2},${z0}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${host4 ? host4.openingPl : storeyPlace},#${axisZ});`);
      const wn = id();
      lines.push(`#${wn}= IFCWINDOW('${guid(`WN${x2},${y2},${lvl}`)}',#${owner},'Ventana ${esc(w.room)} ${esc(w.wall)} ${f(w.width)}m vidrio 6mm',$,$,#${pl4},#${pr4},$,${f(w.height)},${f(w.width)},.WINDOW.,.SINGLE_PANEL.,$);`);
      relAssoc(wn, material(MATERIALS.vidrio), `WNM${x2},${y2},${lvl}`);
      qto(wn, [["L", "Ancho", w.width], ["L", "Alto", w.height], ["A", "Área vano", w.width * w.height]], `Q5WN:${x2},${y2},${lvl}`);
      fillOpening("window", along, w.x, w.width, w.sill, wn, `WN${x2},${y2},${z0}`);
      products.push(wn);
    }

    // Instalaciones — CLASES IFC de distribución reales (no proxies
    // genéricos): seleccionables en el visor con su nombre y tipadas para
    // coordinación MEP (RETIE/RAS).
    const MEP_CLASS: Record<string, { entity: string; pre: string }> = {
      tablero: { entity: "IFCELECTRICDISTRIBUTIONBOARD", pre: ".DISTRIBUTIONBOARD." },
      iluminacion: { entity: "IFCLIGHTFIXTURE", pre: ".POINTSOURCE." },
      sanitario: { entity: "IFCSANITARYTERMINAL", pre: ".TOILETPAN." },
      lavamanos: { entity: "IFCSANITARYTERMINAL", pre: ".WASHHANDBASIN." },
      ducha: { entity: "IFCSANITARYTERMINAL", pre: ".SHOWER." },
      lavaplatos: { entity: "IFCSANITARYTERMINAL", pre: "$" },
      lavadero: { entity: "IFCSANITARYTERMINAL", pre: "$" },
      calentador: { entity: "IFCFLOWSTORAGEDEVICE", pre: ".HEATER." },
    };
    const mep = (x: number, y: number, z: number, w: number, d: number, h: number, name: string, mat: number, tag: string, kind: string, along: "x" | "y" = "x") => {
      const s5 = solidBox(x, y, z, w, d, h, along);
      const pr5 = shapeRep(s5, tag);
      const pl5 = ent(`PXPL:${tag}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const px = id();
      const cls = MEP_CLASS[kind] ?? { entity: "IFCDISTRIBUTIONELEMENT", pre: "" };
      // IFCDISTRIBUTIONELEMENT no tiene PredefinedType (8 atributos) — los
      // terminales sí; se emite sólo si la clase lo define.
      lines.push(`#${px}= ${cls.entity}('${guid(tag)}',#${owner},'${esc(name)}',$,$,#${pl5},#${pr5},$${cls.pre ? `,${cls.pre}` : ""});`);
      relAssoc(px, mat, `PXM${tag}`);
      products.push(px);
    };

    const copMat = material(MATERIALS.cobre);
    const pvcMat = material(MATERIALS.griferia);
    for (const p of plan.electrical?.points ?? []) {
      if (p.level !== lvl) continue;
      const b = MEP_BLOCKS[p.kind] ?? MEP_BLOCKS.tomacorriente;
      mep(p.x, p.y, b.z < 0 ? fft + b.z : b.z, b.w, b.d, b.h, `[ELÉCTRICO] ${b.kind} — ${p.room} (RETIE)`, copMat, `EL${p.x},${p.y},${lvl},${p.kind}`, p.kind);
    }
    for (const p of plan.hydro?.points ?? []) {
      if (p.level !== lvl) continue;
      const b = MEP_BLOCKS[p.kind] ?? MEP_BLOCKS.punto_hidraulico;
      mep(p.x, p.y, b.z, b.w, b.d, b.h, `[HIDROSANITARIO] ${b.kind} — ${p.room} (RAS)`, pvcMat, `HY${p.x},${p.y},${lvl},${p.kind}`, p.kind);
    }

    // Mobiliario BIM (mismo anclaje que el 2D — la planta amueblada y el
    // modelo cuentan la misma historia; dimensiones Neufert/Panero).
    const maderaMat = material(MATERIALS.maderaMat);
    for (const r of plan.rooms.filter((r) => r.level === lvl)) {
      for (const fu of furniture3D(r, plan.doors.filter((d) => d.level === lvl), r.name.toLowerCase().includes("principal"))) {
        const s6 = solidBox(fu.x, fu.y, 0, fu.w, fu.d, fu.h, "x");
        const pr6 = shapeRep(s6, `FU${fu.x},${fu.y},${lvl}`);
        const pl6 = ent(`FUPL:${fu.x},${fu.y},${lvl}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
        const fu6 = id();
        lines.push(`#${fu6}= IFCFURNISHINGELEMENT('${guid(`FU${fu.x},${fu.y},${lvl}`)}',#${owner},'${esc(fu.name)} (Neufert)',$,$,#${pl6},#${pr6},$,.ELEMENT.);`);
        relAssoc(fu6, maderaMat, `FUM${fu.x},${fu.y},${lvl}`);
        products.push(fu6);
      }
    }

    // ESPACIOS BIM (IFCSPACE por cuarto): la unidad de programación —
    // cuadraturas, cronogramas y coordinación MEP se leen por espacio.
    const spaces: number[] = [];
    for (const r of plan.rooms.filter((r) => r.level === lvl)) {
      const s7 = solidBox(r.x + r.width / 2, r.y + r.depth / 2, 0, r.width, r.depth, fft, "x");
      const p7 = shapeRep(s7, `SPR${r.x},${r.y},${lvl}`);
      const spl = ent(`SPPL:${r.x},${r.y},${lvl}`, (n) => `#${n}= IFCLOCALPLACEMENT(#${storeyPlace},#${axisZ});`);
      const sp = id();
      lines.push(`#${sp}= IFCSPACE('${guid(`SP${r.x},${r.y},${lvl}`)}',#${owner},'${esc(r.name)} — ${esc(r.type)}',$,$,#${spl},#${p7},$,.ELEMENT.,.INTERNAL.,$);`);
      pset(sp, "Pset_ObraHub_5D6D", [["Fase", "Programación"], ["Tipo", r.type]], `P5SP:${r.x},${r.y},${lvl}`);
      qto(sp, [["A", "Área espacio", r.width * r.depth], ["V", "Volumen espacio", r.width * r.depth * fft]], `Q5SP:${r.x},${r.y},${lvl}`);
      spaces.push(sp);
    }

    allProducts.push(...products);
    // Productos CONTENIDOS en el storey (patrón espacial buildingSMART);
    // los espacios se AGREGAN al storey (decomposición espacial).
    relContained(storey, products, `ST${lvl}`);
    if (spaces.length) relContains(storey, spaces, `SP${lvl}`);
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



/** ── GUID buildingSMART (IfcGloballyUniqueId) ───────────────────────────────
 *  22 chars, alfabeto 0-9A-Za-z_$, PRIMER CARÁCTER 0-3 (versión). 128 bits:
 *  nibble0 → 1 char; 5 grupos de 6 nibbles (24 bits) → 4 chars c/u; nibble31
 *  → 1 char. Determinista (hash de semilla + contador reiniciado por export)
 *  — misma entrada, mismo GUID, y todos ÚNICOS. */
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
let guidCounter = 0;
function guid(seed: string): string {
  guidCounter++;
  const s = `${seed}#${guidCounter}`;
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ((h1 >>> 13) + s.charCodeAt(i)), 2246822519) >>> 0;
  }
  const h3 = Math.imul(h1 ^ h2, 2654435761) >>> 0;
  const h4 = Math.imul(h2 ^ h1, 40503) >>> 0;
  // 32 nibbles: la primera ∈ 0-3 (el requisito del primer carácter).
  const hex = (h1 & 3).toString(16)
    + ((h1 >>> 2).toString(16).padStart(7, "0"))
    + h2.toString(16).padStart(8, "0")
    + h3.toString(16).padStart(8, "0")
    + h4.toString(16).padStart(8, "0");
  let out = B64[parseInt(hex[0], 16)];
  for (let i = 1; i < 31; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j++) v = v * 16 + parseInt(hex[i + j], 16);
    for (let j = 3; j >= 0; j--) out += B64[(v >>> (6 * j)) & 63];
  }
  return out + B64[parseInt(hex[31], 16)];
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
