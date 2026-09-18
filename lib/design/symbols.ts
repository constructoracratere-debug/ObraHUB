/**
 * ✏️ Diseño IA — Librería de SÍMBOLOS + MOTOR DE COLOCACIÓN.
 *
 * Dimensiones de Neufert "Datos de proyecto" y Panero "Las dimensiones
 * humanas en los espacios interiores". Todo determinista: mismas entradas,
 * mismo dibujo. Los símbolos son primitivas (Prim) que consumen los DOS
 * renderizadores (SVG en pantalla y DXF por capas).
 *
 * ── MOTOR ANTI-AMONTONAMIENTO ─────────────────────────────────────────────
 * La 1ª versión pegaba muebles a anclas fijas sin mirar nada: camas sobre
 * puertas, WC sobre ducha, etiquetas tapadas. Ahora `layoutFurniture` es un
 * mini-solver:
 *  1. Calcula las ZONAS EXCLUIDAS del espacio: vanos de puertas (paso) y el
 *     cuarto de círculo de giro de cada hoja que abre hacia dentro.
 *  2. Por cada mueble (en orden de prioridad del programa) escanea anclas
 *     deterministas contra cada muro (esquinas → centro → barrido de 15 cm).
 *  3. Acepta la primera posición que no choque con zonas ni con muebles ya
 *     puestos (holgura 4 cm). Si NINGUNA vale, el mueble NO se dibuja: un
 *     espacio pequeño muestra menos mobiliario, nunca mobiliario amontonado.
 *  4. `labelSpot` hace lo mismo con las etiquetas nombre/área: buscan hueco
 *     libre (centro → arriba → abajo → esquinas).
 * El 2D (furnishRoom) y el 3D (furniture3D) consumen el MISMO resultado del
 * solver — plano y modelo cuentan la misma historia.
 */

import type { Prim } from "./views";
import type { FloorPlan } from "./schema";

const L = "MOBILIARIO";   // capa general de mobiliario
const S = "SANITARIOS";   // aparatos sanitarios (hidrosanitario)

/** Rectángulo en coordenadas de espacio (metros). */
export type Rect = { x: number; y: number; w: number; d: number };

const intersects = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
  a.y < b.y + b.d + pad && a.y + a.d + pad > b.y;

type Door = FloorPlan["doors"][number];
type Room = { name: string; type: string; x: number; y: number; width: number; depth: number; level: number };

/** Mueble colocado por el solver (bbox + kind + muro de respaldo). */
export type PlacedFurniture = Rect & { kind: string; wall: "N" | "S" | "E" | "W" | "C" };

/** Zonas donde NO se puede poner mobiliario: paso de vanos (ambos lados,
 *  0.45 m) + bbox del giro de la hoja en el espacio hacia el que abre.
 *  Usa la geometría DERIVADA del sanitizador (axis + swingDir) — exacta. */
export function doorZones(room: Room, doors: Door[]): Rect[] {
  const zones: Rect[] = [];
  const roomKey = room.name.toLowerCase().replace(/\s+/g, "");
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const tol = 0.06;
  for (const d of doors) {
    // ¿El vano está sobre un borde de ESTE espacio?
    let onEdge = false;
    if (d.axis !== "y") {
      onEdge = (Math.abs(d.y - room.y) < tol || Math.abs(d.y - (room.y + room.depth)) < tol) &&
        d.x >= room.x - tol && d.x <= room.x + room.width + tol;
    } else {
      onEdge = (Math.abs(d.x - room.x) < tol || Math.abs(d.x - (room.x + room.width)) < tol) &&
        d.y >= room.y - tol && d.y <= room.y + room.depth + tol;
    }
    if (!onEdge) continue;
    const half = d.width / 2;
    // Paso: banda del vano ±0.45 a cada lado del muro.
    if (d.axis !== "y") zones.push({ x: d.x - half, y: d.y - 0.45, w: d.width, d: 0.9 });
    else zones.push({ x: d.x - 0.45, y: d.y - half, w: 0.9, d: d.width });
    // Giro de la hoja: SOLO en el espacio destino (hacia donde abre).
    if (key(d.to) !== roomKey) continue;
    const sd = d.swingDir ?? 1;
    if (d.axis !== "y") {
      const y = sd === 1 ? d.y : d.y - d.width;
      zones.push({ x: d.hinge === "left" ? d.x - half : d.x, y, w: d.width, d: d.width });
    } else {
      const x = sd === 1 ? d.x : d.x - d.width;
      zones.push({ x, y: d.hinge === "left" ? d.y - half : d.y, w: d.width, d: d.width });
    }
  }
  return zones;
}

/** Anclas deterministas para un mueble de ancho w sobre un muro:
 *  esquina izquierda → derecha → centro → barrido cada 0.15 m. */
function anchors(from: number, to: number, size: number): number[] {
  const lo = from + 0.04, hi = to - size - 0.04;
  if (hi < lo) return [];
  const list = [lo, hi, (from + to - size) / 2];
  for (let p = lo; p <= hi; p += 0.15) list.push(p);
  return list;
}

/** ── EL SOLVER ──────────────────────────────────────────────────────────── */
export function layoutFurniture(room: Room, doors: Door[], isPrincipal = false): PlacedFurniture[] {
  const zones = doorZones(room, doors);
  const placed: PlacedFurniture[] = [];

  const tryPlace = (kind: string, w: number, d: number, prefs: Array<"N" | "S" | "E" | "W" | "C">): boolean => {
    // Mueble que no cabe ni en el espacio: fuera (mejor vacío que amontonado).
    if (w > room.width - 0.08 || d > room.depth - 0.08) return false;
    for (const p of prefs) {
      const cands: Rect[] = [];
      if (p === "N") for (const x of anchors(room.x, room.x + room.width, w)) cands.push({ x, y: room.y + 0.04, w, d });
      else if (p === "S") for (const x of anchors(room.x, room.x + room.width, w)) cands.push({ x, y: room.y + room.depth - d - 0.04, w, d });
      else if (p === "W") for (const y of anchors(room.y, room.y + room.depth, d)) cands.push({ x: room.x + 0.04, y, w, d });
      else if (p === "E") for (const y of anchors(room.y, room.y + room.depth, d)) cands.push({ x: room.x + room.width - w - 0.04, y, w, d });
      else cands.push({ x: room.x + (room.width - w) / 2, y: room.y + (room.depth - d) / 2, w, d });
      for (const c of cands) {
        if (c.x < room.x - 0.01 || c.y < room.y - 0.01 ||
            c.x + c.w > room.x + room.width + 0.01 || c.y + c.d > room.y + room.depth + 0.01) continue;
        if (zones.some((z) => intersects(c, z, 0.02))) continue;
        if (placed.some((pf) => intersects(c, pf, 0.04))) continue;
        placed.push({ kind, ...c, wall: p });
        return true;
      }
    }
    return false;
  };

  const t = room.type;
  const nm = room.name.toLowerCase();
  if (t === "baño" || /ba[nñ]o|bano/.test(nm)) {
    tryPlace("wc", 0.36, 0.62, ["W", "N", "E", "S"]);
    tryPlace("lavamanos", 0.5, 0.4, ["N", "E", "W", "S"]);
    tryPlace("ducha", 0.9, 0.9, ["E", "W", "N", "S"]); // solo si queda hueco
  } else if (t === "cocina" || /cocina/.test(nm)) {
    // Mostrador en módulos estándar descendentes (2.40→2.00→1.60→1.20→0.80):
    // si el ancho completo choca con una puerta, una cocina de módulo corto
    // sí cabe — mejor que quedarse sin mostrador.
    for (const len of [2.4, 2.0, 1.6, 1.2, 0.8]) {
      if (tryPlace("mostrador", Math.min(room.width - 0.08, len), 0.6, ["N", "E", "W", "S"])) break;
    }
    tryPlace("estufa", 0.6, 0.55, ["N", "W", "E", "S"]);
    tryPlace("nevera", 0.7, 0.68, ["E", "W", "N", "S"]);
    tryPlace("lavaplatos", 0.8, 0.5, ["N", "W", "E", "S"]);
  } else if (t === "habitacion" || /alcoba|habita|dormitorio|recamara/.test(nm)) {
    const doble = isPrincipal || room.width >= 2.9;
    // Cama: cabecero contra muro; holgura de circulación 60 cm (Neufert).
    const bw = doble ? 1.4 : 0.9;
    tryPlace("cama", bw, 1.9, ["N", "E", "W", "S"]);
    tryPlace("closet", Math.max(0.8, Math.min(room.width - 0.2, 1.6)), 0.55, ["S", "E", "W", "N"]);
    if (!doble && room.width > 2.6) tryPlace("escritorio", 1.0, 0.5, ["W", "E", "N"]);
  } else if (t === "sala" || /sala|estar/.test(nm)) {
    tryPlace("sofa", 1.9, 0.85, ["S", "N", "W", "E"]);
    tryPlace("mesa_centro", 0.9, 0.5, ["C"]);
    tryPlace("tv", 1.2, 0.35, ["N", "S", "E", "W"]);
  } else if (t === "comedor" || /comedor/.test(nm)) {
    tryPlace("comedor", 1.2, 0.8, ["C", "N", "S"]);
  } else if (t === "lavanderia" || /lavander/.test(nm)) {
    tryPlace("lavadora", 0.62, 0.62, ["W", "N", "E", "S"]);
    tryPlace("lavadero", 0.6, 0.5, ["N", "E", "W", "S"]);
  } else if (t === "estudio" || /estudio|oficina/.test(nm)) {
    tryPlace("escritorio", 1.4, 0.6, ["N", "W", "E"]);
    tryPlace("silla", 0.45, 0.45, ["C"]);
  } else if (t === "garaje" || /garaje|parqueadero|estacionamiento/.test(nm)) {
    tryPlace("auto", 1.8, Math.min(4.5, room.depth - 0.2), ["N", "S"]);
  }
  return placed;
}

/** Hueco libre para la etiqueta nombre/área del espacio (centro → bordes). */
export function labelSpot(room: Room, furniture: PlacedFurniture[]): { x: number; y: number } {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.depth / 2;
  const labelBox = (x: number, y: number): Rect => ({ x: x - 0.6, y: y - 0.3, w: 1.2, d: 0.6 });
  const cands: Array<{ x: number; y: number }> = [
    { x: cx, y: cy },
    { x: cx, y: room.y + 0.42 },
    { x: cx, y: room.y + room.depth - 0.42 },
    { x: room.x + 0.75, y: room.y + 0.45 },
    { x: room.x + room.width - 0.75, y: room.y + room.depth - 0.45 },
    { x: room.x + 0.75, y: room.y + room.depth - 0.45 },
    { x: room.x + room.width - 0.75, y: room.y + 0.45 },
  ];
  for (const c of cands) {
    if (!furniture.some((f) => intersects(labelBox(c.x, c.y), f, 0.05))) return c;
  }
  return { x: cx, y: cy }; // espacio saturado: centro (la etiqueta manda)
}

// ── Símbolos 2D (Ching §simbología) ─────────────────────────────────────────

function box(out: Prim[], r: Rect, layer = L) {
  out.push({ t: "H", l: layer, x: r.x, y: r.y, w: r.w, h: r.d });
}

/** Dibuja los muebles colocados por el solver — 2D simbólico. */
export function furnishRoom(out: Prim[], room: Room, doors: Door[], isPrincipal = false) {
  const placed = layoutFurniture(room, doors, isPrincipal);
  for (const f of placed) {
    switch (f.kind) {
      case "wc": {
        const vert = f.wall === "N" || f.wall === "S";
        box(out, vert ? { x: f.x + (f.w - 0.36) / 2, y: f.wall === "N" ? f.y : f.y + f.d - 0.18, w: 0.36, d: 0.18 } : { x: f.wall === "W" ? f.x : f.x + f.w - 0.18, y: f.y + (f.d - 0.36) / 2, w: 0.18, d: 0.36 }, S);
        box(out, f, S); // taza (bbox)
        out.push({ t: "L", l: S, x1: f.x + f.w / 2, y1: f.y + f.d / 2 - 0.12, x2: f.x + f.w / 2, y2: f.y + f.d / 2 + 0.12, thin: true });
        break;
      }
      case "lavamanos": {
        box(out, f, S);
        box(out, { x: f.x + 0.06, y: f.y + 0.06, w: f.w - 0.12, d: f.d - 0.12 }, S);
        break;
      }
      case "ducha": {
        box(out, f, S);
        box(out, { x: f.x + f.w / 2 - 0.12, y: f.y + f.d / 2 - 0.12, w: 0.24, d: 0.24 }, S);
        out.push({ t: "L", l: S, x1: f.x + f.w / 2 - 0.12, y1: f.y + f.d / 2, x2: f.x + f.w / 2 + 0.12, y2: f.y + f.d / 2, thin: true });
        break;
      }
      case "lavaplatos": {
        box(out, f, S);
        box(out, { x: f.x + 0.06, y: f.y + 0.07, w: f.w / 2 - 0.1, d: f.d - 0.14 }, S);
        box(out, { x: f.x + f.w / 2 + 0.04, y: f.y + 0.07, w: f.w / 2 - 0.1, d: f.d - 0.14 }, S);
        break;
      }
      case "estufa": {
        box(out, f, L);
        const q = Math.min(0.16, f.w / 4);
        for (const [dx, dy] of [[0.09, 0.09], [f.w - q - 0.09, 0.09], [0.09, f.d - q - 0.09], [f.w - q - 0.09, f.d - q - 0.09]]) {
          box(out, { x: f.x + dx, y: f.y + dy, w: q, d: q }, L);
        }
        break;
      }
      case "cama": {
        box(out, f, L);
        const pw = Math.min(0.56, (f.w - 0.24) / 2);
        // almohadas al cabecero (pared de respaldo)
        const headN = f.wall === "N";
        const py = headN ? f.y + f.d - 0.42 : f.y + 0.12;
        box(out, { x: f.x + 0.08, y: py, w: pw, d: 0.3 }, L);
        if (f.w >= 1.3) box(out, { x: f.x + f.w - pw - 0.08, y: py, w: pw, d: 0.3 }, L);
        const ly = headN ? f.y + f.d - 0.62 : f.y + 0.62;
        out.push({ t: "L", l: L, x1: f.x + 0.1, y1: ly, x2: f.x + f.w - 0.1, y2: ly, thin: true });
        break;
      }
      case "closet": {
        box(out, f, L);
        const vert = f.d >= f.w;
        if (vert) out.push({ t: "L", l: L, x1: f.x + f.w / 2, y1: f.y + 0.05, x2: f.x + f.w / 2, y2: f.y + f.d - 0.05, thin: true });
        else out.push({ t: "L", l: L, x1: f.x + 0.05, y1: f.y + f.d / 2, x2: f.x + f.w - 0.05, y2: f.y + f.d / 2, thin: true });
        break;
      }
      case "sofa": {
        box(out, f, L);
        box(out, { x: f.x + 0.14, y: f.y + 0.14, w: f.w - 0.28, d: f.d - 0.14 }, L);
        break;
      }
      case "comedor": {
        box(out, f, L);
        for (const [dx, dy] of [[-0.58, 0.08], [f.w + 0.13, 0.08], [-0.58, f.d - 0.53], [f.w + 0.13, f.d - 0.53]]) {
          const c = { x: f.x + dx, y: f.y + dy, w: 0.45, d: 0.45 };
          if (c.x >= room.x && c.y >= room.y && c.x + 0.45 <= room.x + room.width && c.y + 0.45 <= room.y + room.depth) box(out, c, L);
        }
        break;
      }
      case "lavadora": {
        box(out, f, S);
        box(out, { x: f.x + 0.1, y: f.y + 0.1, w: f.w - 0.2, d: f.d - 0.2 }, S);
        out.push({ t: "L", l: S, x1: f.x + f.w / 2, y1: f.y + 0.1, x2: f.x + f.w / 2, y2: f.y + f.d - 0.1, thin: true });
        break;
      }
      case "lavadero":
      case "escritorio":
      case "mesa_centro":
      case "tv":
      case "silla":
      case "nevera": {
        box(out, f, L);
        if (f.kind === "nevera") out.push({ t: "L", l: L, x1: f.x, y1: f.y + f.d * 0.68, x2: f.x + f.w, y2: f.y + f.d * 0.68, thin: true });
        break;
      }
      case "mostrador": {
        box(out, f, L);
        for (let xx = f.x + 0.45; xx < f.x + f.w - 0.1; xx += 0.6) {
          out.push({ t: "L", l: L, x1: xx, y1: f.y + 0.04, x2: xx, y2: f.y + f.d - 0.04, thin: true });
        }
        break;
      }
      case "auto": {
        box(out, f, L);
        box(out, { x: f.x + 0.25, y: f.y + 0.7, w: f.w - 0.5, d: Math.min(1.1, f.d - 1.5) }, L); // cabina
        break;
      }
    }
  }
  return placed;
}

/** El mismo mobiliario como VOLÚMENES para el IFC (desde el solver). */
export function furniture3D(room: Room, doors: Door[], isPrincipal = false): Array<{ x: number; y: number; w: number; d: number; h: number; name: string }> {
  const H: Record<string, number> = {
    wc: 0.42, lavamanos: 0.85, ducha: 0.05, lavaplatos: 0.9, estufa: 0.95,
    nevera: 1.75, mostrador: 0.9, cama: 0.45, closet: 2.1, sofa: 0.75,
    comedor: 0.75, mesa_centro: 0.42, tv: 0.5, lavadora: 0.85, lavadero: 0.9,
    escritorio: 0.75, silla: 0.85, auto: 1.5,
  };
  const NAMES: Record<string, string> = {
    wc: "Inodoro", lavamanos: "Lavamanos", ducha: "Zona de ducha", lavaplatos: "Lavaplatos",
    estufa: "Estufa 4 quemadores", nevera: "Nevera", mostrador: "Mostrador de cocina",
    cama: "Cama", closet: "Closet", sofa: "Sofá", comedor: "Comedor", mesa_centro: "Mesa de centro",
    tv: "Mueble TV", lavadora: "Lavadora", lavadero: "Lavadero", escritorio: "Escritorio",
    silla: "Silla", auto: "Parqueadero",
  };
  return layoutFurniture(room, doors, isPrincipal)
    .filter((f) => f.kind !== "ducha") // la ducha es zona, no volumen
    .map((f) => ({
      x: f.x + f.w / 2, y: f.y + f.d / 2, w: f.w, d: f.d,
      h: H[f.kind] ?? 0.75,
      name: `${NAMES[f.kind] ?? f.kind} — ${room.name}`,
    }));
}
