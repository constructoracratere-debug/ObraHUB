/**
 * ✏️ Diseño IA — Librería de SÍMBOLOS de mobiliario y aparatos.
 *
 * Dimensiones de Neufert "Datos de proyecto" y Panero "Las dimensiones
 * humanas en los espacios interiores". Todo determinista: mismas entradas,
 * mismo dibujo. Los símbolos son primitivas (Prim) que consumen los DOS
 * renderizadores (SVG en pantalla y DXF por capas).
 *
 * Convenciones Ching §simbología:
 *  · Mobiliario en línea MEDIA (no compite con el muro cortado).
 *  · Aparatos sanitarios con su trazo característico (taza, sifón, desagüe).
 *  · Cocina: mostrador continuo + estufa (4 quemadores) + nevera.
 */

import type { Prim } from "./views";

const L = "MOBILIARIO";   // capa general de mobiliario
const S = "SANITARIOS";   // aparatos sanitarios (hidrosanitario)

function lines(out: Prim[], x: number, y: number, w: number, h: number, layer = L) {
  out.push({ t: "H", l: layer, x, y, w, h });
}

/** Inodoro (WC) — 0.35×0.60: tanque + taza (Neufert). */
export function wc(out: Prim[], x: number, y: number, dir: "n" | "s" | "e" | "o" = "n") {
  const vert = dir === "n" || dir === "s";
  const w = vert ? 0.36 : 0.62, h = vert ? 0.62 : 0.36;
  const yy = dir === "n" ? y + h - 0.18 : y; // tanque pegado al muro
  lines(out, x, yy, w, 0.18, S);             // tanque
  lines(out, vert ? x + 0.03 : x + 0.18, vert ? (dir === "n" ? y : y + 0.18) : y + 0.03,
        vert ? 0.3 : 0.44, vert ? 0.44 : 0.3, S); // taza
  out.push({ t: "L", l: S, x1: x + (vert ? 0.18 : 0.4), y1: y + (vert ? (dir === "n" ? 0.1 : h - 0.1) : 0.18),
             x2: x + (vert ? 0.18 : 0.4), y2: y + (vert ? (dir === "n" ? 0.44 : h - 0.44) : 0.18) }); // sifón
}

/** Lavamanos 0.50×0.40 sobre muro. */
export function lavamanos(out: Prim[], x: number, y: number, dir: "n" | "s" | "e" | "o" = "n") {
  const vert = dir === "n" || dir === "s";
  const w = vert ? 0.5 : 0.4, h = vert ? 0.4 : 0.5;
  lines(out, x, y, w, h, S);
  lines(out, x + 0.07, y + 0.07, w - 0.14, h - 0.14, S); // cuenca
  // grifería: tick al muro
  const gx = dir === "n" ? x + w / 2 : dir === "s" ? x + w / 2 : dir === "e" ? x + w - 0.06 : x + 0.06;
  const gy = dir === "n" ? y + h - 0.06 : dir === "s" ? y + 0.06 : y + h / 2;
  out.push({ t: "L", l: S, x1: gx, y1: gy, x2: gx, y2: gy - 0.08 });
}

/** Ducha 0.90×0.90 con desagüe y rejilla. */
export function ducha(out: Prim[], x: number, y: number, size = 0.9) {
  lines(out, x, y, size, size, S);
  out.push({ t: "H", l: S, x: x + size / 2 - 0.12, y: y + size / 2 - 0.12, w: 0.24, h: 0.24 }); // desagüe
  out.push({ t: "L", l: S, x1: x + size / 2 - 0.12, y1: y + size / 2, x2: x + size / 2 + 0.12, y2: y + size / 2, thin: true });
}

/** Lavaplatos doble 0.80×0.50. */
export function lavaplatos(out: Prim[], x: number, y: number) {
  lines(out, x, y, 0.8, 0.5, S);
  lines(out, x + 0.06, y + 0.07, 0.32, 0.36, S);
  lines(out, x + 0.42, y + 0.07, 0.32, 0.36, S);
}

/** Estufa 0.60×0.55 con 4 quemadores. */
export function estufa(out: Prim[], x: number, y: number) {
  lines(out, x, y, 0.6, 0.55, L);
  const q = 0.16;
  for (const [dx, dy] of [[0.09, 0.09], [0.35, 0.09], [0.09, 0.31], [0.35, 0.31]]) {
    lines(out, x + dx, y + dy, q, q, L);
    out.push({ t: "L", l: L, x1: x + dx + q / 2 - 0.04, y1: y + dy + q / 2, x2: x + dx + q / 2 + 0.04, y2: y + dy + q / 2, thin: true });
  }
}

/** Nevera 0.70×0.68 con línea de puerta. */
export function nevera(out: Prim[], x: number, y: number) {
  lines(out, x, y, 0.7, 0.68, L);
  out.push({ t: "L", l: L, x1: x, y1: y + 0.46, x2: x + 0.7, y2: y + 0.46, thin: true });
}

/** Mostrador de cocina en L (0.60 de fondo) esquina noroeste del espacio. */
export function mostradorL(out: Prim[], x: number, y: number, w: number, d: number) {
  const f = 0.6;
  if (w < 1.4 || d < 1.4) { lines(out, x, y, Math.min(w, 2.4), f, L); return; }
  lines(out, x, y, w, f, L);          // tramo norte
  lines(out, x, y + f, f, d - f, L);  // tramo oeste
}

/** Cama — doble 1.40×1.90 / individual 0.90×1.90, con almohadas. */
export function cama(out: Prim[], x: number, y: number, doble = true) {
  const w = doble ? 1.4 : 0.9;
  lines(out, x, y, w, 1.9, L);
  const pw = doble ? 0.56 : 0.36; // almohadas
  lines(out, x + 0.08, y + 1.9 - 0.42, pw, 0.3, L);
  if (doble) lines(out, x + 0.08 + pw + 0.08, y + 1.9 - 0.42, pw, 0.3, L);
  out.push({ t: "L", l: L, x1: x + 0.12, y1: y + 1.9 - 0.62, x2: x + w - 0.12, y2: y + 1.9 - 0.62, thin: true }); // sábana
}

/** Sofá 3 puestos 1.90×0.85 con respaldo y brazos. */
export function sofa(out: Prim[], x: number, y: number) {
  lines(out, x, y, 1.9, 0.85, L);
  lines(out, x + 0.14, y + 0.14, 1.62, 0.71, L); // asiento
  out.push({ t: "L", l: L, x1: x + 0.14, y1: y + 0.14, x2: x + 0.14, y2: y + 0.85, thin: true }); // brazo
  out.push({ t: "L", l: L, x1: x + 1.76, y1: y + 0.14, x2: x + 1.76, y2: y + 0.85, thin: true });
  for (const dx of [0.32, 0.76, 1.2]) out.push({ t: "L", l: L, x1: x + dx, y1: y + 0.14, x2: x + dx, y2: y + 0.5, thin: true });
}

/** Comedor: mesa 1.20×0.80 + 4 sillas 0.45². */
export function comedor(out: Prim[], x: number, y: number) {
  const mw = 1.2, mh = 0.8;
  const cx = x - mw / 2, cy = y - mh / 2;
  lines(out, cx, cy, mw, mh, L);
  for (const [dx, dy] of [[-0.58, 0.08], [mw + 0.13, 0.08], [-0.58, mh - 0.53], [mw + 0.13, mh - 0.53]]) {
    lines(out, cx + dx, cy + dy, 0.45, 0.45, L);
  }
}

/** Closet: rectángulo + barra de colgado + divisiones cada 0.80. */
export function closet(out: Prim[], x: number, y: number, w: number, d: number) {
  lines(out, x, y, w, d, L);
  const vert = d >= w;
  if (vert) {
    out.push({ t: "L", l: L, x1: x + w / 2, y1: y + 0.06, x2: x + w / 2, y2: y + d - 0.06, thin: true });
    for (let yy = y + 0.8; yy < y + d - 0.1; yy += 0.8) out.push({ t: "L", l: L, x1: x + 0.05, y1: yy, x2: x + w - 0.05, y2: yy, thin: true });
  } else {
    out.push({ t: "L", l: L, x1: x + 0.06, y1: y + d / 2, x2: x + w - 0.06, y2: y + d / 2, thin: true });
    for (let xx = x + 0.8; xx < x + w - 0.1; xx += 0.8) out.push({ t: "L", l: L, x1: xx, y1: y + 0.05, x2: xx, y2: y + d - 0.05, thin: true });
  }
}

/** Lavadora 0.62×0.62 con tambor. */
export function lavadora(out: Prim[], x: number, y: number) {
  lines(out, x, y, 0.62, 0.62, S);
  lines(out, x + 0.1, y + 0.1, 0.42, 0.42, S);
  out.push({ t: "L", l: S, x1: x + 0.31, y1: y + 0.1, x2: x + 0.31, y2: y + 0.52, thin: true });
}

/** Escalera: peldaños de 0.28 + flecha SUBE + línea de corte (Ching). */
export function escalera(out: Prim[], x: number, y: number, w: number, length: number, sube = true) {
  const n = Math.max(3, Math.floor(length / 0.28));
  for (let i = 0; i <= n; i++) {
    const yy = y + (i * length) / n;
    out.push({ t: "L", l: L, x1: x, y1: yy, x2: x + w, y2: yy, thin: i > n - 3 });
  }
  // Flecha direccional (siempre — Ching).
  const cx = x + w / 2;
  out.push({ t: "L", l: L, x1: cx, y1: y + 0.15, x2: cx, y2: y + length - 0.3, thin: true });
  out.push({ t: "L", l: L, x1: cx - 0.1, y1: y + length - 0.42, x2: cx, y2: y + length - 0.3, thin: true });
  out.push({ t: "L", l: L, x1: cx + 0.1, y1: y + length - 0.42, x2: cx, y2: y + length - 0.3, thin: true });
  out.push({ t: "T", l: "TEXTOS", x: cx + 0.12, y: y + 0.35, h: 0.14, s: sube ? "SUBE" : "BAJA" });
  // Línea de corte diagonal (convención planta).
  out.push({ t: "L", l: L, x1: x + 0.05, y1: y + length * 0.72, x2: x + w - 0.05, y2: y + length * 0.62, dash: true, thin: true });
}

/** Mobiliario completo de un espacio según su tipo (dimensiones Neufert/Panero).
 *  Colocación determinista: pegado a muros, puertas despejadas. */
export function furnishRoom(out: Prim[], r: { name: string; type: string; x: number; y: number; width: number; depth: number }, isPrincipal = false) {
  const { x, y, width: w, depth: d } = r;
  const t = r.type;
  if (t === "baño" || /ba[nñ]o|bano/i.test(r.name)) {
    wc(out, x + 0.12, y + 0.12, "n");
    lavamanos(out, x + w - 0.62, y + 0.12, "n");
    if (w > 1.8 && d > 1.4) ducha(out, x + w - 1.02, y + d - 1.02, Math.min(0.9, w - 1, d - 0.5));
  } else if (t === "cocina" || /cocina/i.test(r.name)) {
    mostradorL(out, x, y, w, d);
    estufa(out, x + Math.min(w - 0.62, 0.75), y + 0.03);
    if (w > 2.2) nevera(out, x + w - 0.74, y + 0.03);
    lavaplatos(out, x + 0.7, y + 0.06);
  } else if (t === "habitacion" || /alcoba|habita|dormitorio|recamara/i.test(r.name)) {
    const doble = isPrincipal || w >= 2.9;
    cama(out, x + (w - (doble ? 1.4 : 0.9)) / 2, y + 0.1, doble);
    if (d > 2.6) closet(out, x + 0.1, y + d - 0.62, Math.max(w - 0.2, 0.8), 0.55);
  } else if (t === "sala" || /sala|estar/i.test(r.name)) {
    sofa(out, x + Math.max(0.1, (w - 1.9) / 2), y + 0.12);
  } else if (t === "comedor" || /comedor/i.test(r.name)) {
    comedor(out, x + w / 2, y + d / 2);
  } else if (t === "lavanderia" || /lavander/i.test(r.name)) {
    lavadora(out, x + 0.12, y + 0.12);
    lines(out, x + w - 0.75, y + 0.12, 0.6, 0.5, S); // lavadero
  } else if (t === "estudio" || /estudio|oficina/i.test(r.name)) {
    lines(out, x + 0.12, y + 0.12, Math.min(1.4, w - 0.24), 0.6, L); // escritorio
  } else if (t === "garaje" || /garaje|parqueadero|estacionamiento/i.test(r.name)) {
    // Auto simbólico 1.80×4.50 (Panero)
    lines(out, x + (w - 1.8) / 2, y + Math.max(0.1, (d - 4.5) / 2), 1.8, Math.min(4.5, d - 0.2), L);
  }
}

/** El mismo mobiliario como VOLÚMENES para el modelo IFC (mismo anclaje
 *  determinista que furnishRoom — el 2D y el 3D cuentan la misma historia). */
export function furniture3D(
  r: { name: string; type: string; x: number; y: number; width: number; depth: number },
  isPrincipal = false,
): Array<{ x: number; y: number; w: number; d: number; h: number; name: string }> {
  const { x, y, width: w, depth: d } = r;
  const t = r.type;
  if (t === "baño" || /ba[nñ]o|bano/i.test(r.name)) {
    return [
      { x: x + 0.3, y: y + 0.43, w: 0.36, d: 0.62, h: 0.42, name: `Inodoro — ${r.name}` },
      { x: x + w - 0.37, y: y + 0.32, w: 0.5, d: 0.4, h: 0.85, name: `Lavamanos — ${r.name}` },
    ];
  }
  if (t === "cocina" || /cocina/i.test(r.name)) {
    const out = [
      { x: x + w / 2, y: y + 0.3, w: Math.min(w, 2.4), d: 0.6, h: 0.9, name: "Mostrador de cocina" },
      { x: x + 1.05, y: y + 0.3, w: 0.6, d: 0.55, h: 0.95, name: "Estufa 4 quemadores" },
    ];
    if (w > 2.2) out.push({ x: x + w - 0.39, y: y + 0.37, w: 0.7, d: 0.68, h: 1.75, name: "Nevera" });
    return out;
  }
  if (t === "habitacion" || /alcoba|habita|dormitorio|recamara/i.test(r.name)) {
    const doble = isPrincipal || w >= 2.9;
    return [{ x: x + w / 2, y: y + 0.1 + 1.9 / 2, w: doble ? 1.4 : 0.9, d: 1.9, h: 0.45, name: `Cama ${doble ? "doble" : "sencilla"} — ${r.name}` }];
  }
  if (t === "sala" || /sala|estar/i.test(r.name)) {
    return [{ x: x + w / 2, y: y + 0.55, w: 1.9, d: 0.85, h: 0.75, name: "Sofá 3 puestos" }];
  }
  if (t === "comedor" || /comedor/i.test(r.name)) {
    return [{ x: x + w / 2, y: y + d / 2, w: 1.2, d: 0.8, h: 0.75, name: "Comedor 4 puestos" }];
  }
  if (t === "lavanderia" || /lavander/i.test(r.name)) {
    return [{ x: x + 0.43, y: y + 0.43, w: 0.62, d: 0.62, h: 0.85, name: "Lavadora" }];
  }
  if (t === "estudio" || /estudio|oficina/i.test(r.name)) {
    return [{ x: x + 0.12 + Math.min(1.4, w - 0.24) / 2, y: y + 0.42, w: Math.min(1.4, w - 0.24), d: 0.6, h: 0.75, name: "Escritorio" }];
  }
  return [];
}
