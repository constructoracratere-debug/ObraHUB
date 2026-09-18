/**
 * Test offline del SOLVER de mobiliario (anti-amontonamiento).
 * Casos límite: muebles sobre puertas, muebles sobre muebles, espacios
 * demasiado pequeños, etiquetas tapadas. Determinista.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

execSync("npx tsc lib/design/symbols.ts lib/design/views.ts lib/design/schema.ts --outDir .tmp-symcheck --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });

const require2 = createRequire(import.meta.url);
const root = path.resolve(process.cwd());
const { layoutFurniture, labelSpot, furnishRoom } = require2(path.join(root, ".tmp-symcheck", "symbols.js"));
const { sanitizeFloorPlan } = require2(path.join(root, ".tmp-symcheck", "schema.js"));

let pass = 0, fail = 0;
const check = (label, ok) => { console.log(`${ok ? "✓" : "✗"} ${label}`); ok ? pass++ : fail++; };

const inter = (a, b, pad = 0) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.d + pad && a.y + a.d + pad > b.y;

const mkRoom = (name, type, x, y, w, d) => ({ name, type, x, y, width: w, depth: d, level: 0 });
const mkDoor = (over) => ({ from: "exterior", to: over.to ?? "Sala", x: over.x, y: over.y, width: over.width ?? 0.9, hinge: over.hinge ?? "left", swing: over.swing ?? "in", level: 0 });

// ── 1. Alcoba con puerta al sur: la cama NUNCA puede pisar el giro ─────────
{
  const room = mkRoom("Alcoba", "habitacion", 0, 0, 3.2, 3.4);
  const doors = [mkDoor({ to: "Alcoba", x: 1.0, y: 0, hinge: "left", swing: "in" })]; // giro 0.9×0.9 en (0.55,0)
  const placed = layoutFurniture(room, doors, false);
  const bed = placed.find((p) => p.kind === "cama");
  check("alcoba: cama colocada", !!bed);
  const swing = { x: 0.55, y: 0, w: 0.9, d: 0.9 };
  check("alcoba: cama NO pisa el giro de la puerta", !bed || !inter(bed, swing, 0.02));
  check("alcoba: cama dentro del espacio", !bed || (bed.x >= 0 && bed.y >= 0 && bed.x + bed.w <= 3.2 && bed.y + bed.d <= 3.4));
}

// ── 2. Baño diminuto (1.0×1.2): ducha fuera, WC puede ──────────────────────
{
  const room = mkRoom("Baño", "baño", 0, 0, 1.0, 1.2);
  const doors = [mkDoor({ to: "Baño", x: 0.5, y: 0, width: 0.6, hinge: "left", swing: "in" })];
  const placed = layoutFurniture(room, doors, false);
  check("baño 1.0×1.2: sin ducha (no cabe)", !placed.some((p) => p.kind === "ducha"));
  const pairs = placed.flatMap((a, i) => placed.slice(i + 1).map((b) => [a, b]));
  check("baño: sin traslape entre muebles", pairs.every(([a, b]) => !inter(a, b, 0.02)));
}

// ── 3. Cocina 2.4×2.0 con puerta al este: sin choques mostrador/nevera ─────
{
  const room = mkRoom("Cocina", "cocina", 0, 0, 2.4, 2.0);
  const doors = [mkDoor({ to: "Cocina", x: 2.4, y: 1.0, hinge: "left", swing: "in" })];
  const placed = layoutFurniture(room, doors, false);
  check("cocina: mostrador colocado", placed.some((p) => p.kind === "mostrador"));
  const pairs = placed.flatMap((a, i) => placed.slice(i + 1).map((b) => [a, b]));
  check("cocina: sin traslapes", pairs.every(([a, b]) => !inter(a, b, 0.02)));
}

// ── 4. Alcoba mínima imposible (1.2×1.4): sin cama → la gate la reporta ────
{
  const room = mkRoom("Alcoba", "habitacion", 0, 0, 1.2, 1.4);
  const placed = layoutFurniture(room, [], false);
  check("alcoba 1.2×1.4: cama NO colocada (gate la marcará)", !placed.some((p) => p.kind === "cama"));
}

// ── 5. Etiquetas: en alcoba amueblada, el spot no cae sobre la cama ─────────
{
  const room = mkRoom("Alcoba Principal", "habitacion", 0, 0, 3.4, 3.6);
  const doors = [mkDoor({ to: "Alcoba Principal", x: 3.4, y: 1.2, hinge: "left", swing: "in" })];
  const placed = layoutFurniture(room, doors, true);
  const spot = labelSpot(room, placed);
  const labelBox = { x: spot.x - 0.6, y: spot.y - 0.3, w: 1.2, d: 0.6 };
  const bed = placed.find((p) => p.kind === "cama");
  check("etiqueta: spot libre de muebles", !placed.some((f) => inter(labelBox, f, 0.05)) || placed.length === 0);
  check("etiqueta: si hay cama, el spot la esquiva o el espacio está saturado", !bed || !inter(labelBox, bed, 0.05) || placed.length > 4);
}

// ── 6. Determinismo ──────────────────────────────────────────────────────────
{
  const room = mkRoom("Sala", "sala", 0, 0, 4.0, 3.5);
  const doors = [mkDoor({ to: "Sala", x: 0, y: 1.5, hinge: "left", swing: "in" })];
  const a = JSON.stringify(layoutFurniture(room, doors, false));
  const b = JSON.stringify(layoutFurniture(room, doors, false));
  check("solver determinista", a === b);
}

// ── 7. furnishRoom no explota con espacios raros ────────────────────────────
{
  const rooms = [
    mkRoom("Baño", "baño", 0, 0, 0.8, 0.9),
    mkRoom("Cocina", "cocina", 0, 0, 1.0, 1.0),
    mkRoom("Sala", "sala", 0, 0, 6.0, 5.0),
  ];
  const out = [];
  for (const r of rooms) furnishRoom(out, r, [], false);
  check("furnishRoom robusto en espacios extremos", out.length > 0);
}

// ── 8. DERIVACIÓN de puertas: geometría desde aristas compartidas ─────────
{
  const raw = {
    version: 1, name: "T Puertas", units: "m", levels: 1, floorToFloor: 2.6,
    outline: { width: 8, depth: 6 },
    wallThickness: { exterior: 0.15, interior: 0.1 },
    rooms: [
      { name: "Sala", type: "sala", x: 0.15, y: 0.15, width: 3.7, depth: 2.85 },
      { name: "Cocina", type: "cocina", x: 3.85, y: 0.15, width: 4.0, depth: 2.85 },
      { name: "Alcoba", type: "habitacion", x: 1.95, y: 3.0, width: 5.9, depth: 2.85 },
    ],
    // x/y deliberadamente INSERVIBLES (random) — la derivación los ignora
    doors: [
      { from: "exterior", to: "Sala", x: 6.9, y: 5.9, width: 0.9, hinge: "right", swing: "out" },
      { from: "Sala", to: "Cocina", x: 0.3, y: 4.1, width: 0.8 },
      { from: "Sala", to: "Alcoba", x: 7.5, y: 1.0, width: 0.7 },
      { from: "Fantasma", to: "Nada", x: 1, y: 1, width: 0.7 }, // alucinada → fuera
    ],
    windows: [],
  };
  const p = sanitizeFloorPlan(raw);
  check("puertas: conexión alucinada descartada", p.doors.length === 3);

  const ext = p.doors.find((d) => d.from === "exterior");
  check("puerta principal: sobre cara interior del muro sur (y≈0.15)", ext && Math.abs(ext.y - 0.15) < 0.02);
  check("puerta principal: dentro del ancho de Sala", ext && ext.x > 0.2 && ext.x < 3.8);
  check("puerta principal: bisagra y swing derivados", ext && ext.swing === "in" && (ext.axis === "x" || ext.axis === "y"));

  const sc = p.doors.find((d) => (d.from === "Sala" && d.to === "Cocina") || (d.from === "Cocina" && d.to === "Sala"));
  // Arista compartida Sala/Cocina: muro vertical x≈3.85, y∈[0.15,3.0]
  check("Sala→Cocina: sobre la arista compartida x≈3.85", sc && Math.abs(sc.x - 3.85) < 0.01);
  check("Sala→Cocina: axis y (muro vertical)", sc && sc.axis === "y");
  check("Sala→Cocina: centrada en el solape con margen", sc && sc.y > 0.15 + 0.1 && sc.y < 3.0 - 0.1);

  const sa = p.doors.find((d) => (d.from === "Sala" && d.to === "Alcoba") || (d.from === "Alcoba" && d.to === "Sala"));
  // Arista compartida Sala/Alcoba: muro horizontal y≈3.0, x∈[1.95,3.85]
  check("Sala→Alcoba: sobre la arista compartida y≈3.0", sa && Math.abs(sa.y - 3.0) < 0.01);
  check("Sala→Alcoba: axis x (muro horizontal)", sa && sa.axis === "x");
  check("Sala→Alcoba: swingDir hacia Alcoba (+1 norte)", sa && sa.swingDir === 1);

  // Bisagra hacia el extremo más cercano (determinista)
  if (sc) {
    const distLo = sc.y - 0.15, distHi = 3.0 - sc.y;
    check("bisagra hacia el extremo cercano", (sc.hinge === "left") === (distLo <= distHi));
  }

  // Determinismo
  const again = sanitizeFloorPlan(raw);
  check("derivación determinista", JSON.stringify(p.doors) === JSON.stringify(again.doors));
}

console.log(`\n${pass} pasan · ${fail} fallan`);
process.exit(fail > 0 ? 1 : 0);
