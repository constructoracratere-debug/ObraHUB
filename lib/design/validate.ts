/**
 * ✏️ Diseño IA — Puertas de verificación (gates) del pipeline.
 *
 * Cada etapa del estudio multi-agente pasa por aquí ANTES de continuar.
 * Norms-lite: valores de referencia inspirados en práctica residencial
 * colombiana (NTC 4595 / NSR-10 como guía). NO son certificación.
 *
 * ⚠️ TABLA EDITABLE — Diego (AEC Domain Expert del roadmap) debe ajustar
 * estos valores con su criterio profesional.
 */

import {
  type FloorPlan,
  type Room,
  roomArea,
  roomKey,
} from "./schema";
import { DIMENSIONAL_STANDARDS, CLEARANCES } from "./knowledge";

/**
 * Mínimos por tipo de espacio — fuente única: lib/design/knowledge.ts
 * (DIMENSIONAL_STANDARDS, con Neufert/Plazola/Panero). ⚠️ EDITABLE — Diego
 * (AEC Domain Expert del roadmap) ajusta los valores con su criterio.
 */
export const ROOM_MINIMUMS: Record<string, { minSide: number; minArea: number; label: string }> =
  Object.fromEntries(
    Object.entries(DIMENSIONAL_STANDARDS).map(([type, d]) => [
      type,
      { minSide: d.minSide, minArea: d.minArea, label: d.label },
    ]),
  );

/** Ancho mínimo de puertas (accesibilidad NSR-10 Cap. A.6 como guía). */
export const MIN_DOOR_WIDTH = CLEARANCES.doorMain.min;

export type GateCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** Referencia normativa orientativa (NO certificación). */
  ref?: string;
};

export type Gate = {
  stage: string;
  title: string;
  checks: GateCheck[];
};

function roomChecks(plan: FloorPlan, rooms: Room[]): GateCheck[] {
  const checks: GateCheck[] = [];
  for (const r of rooms) {
    const min = ROOM_MINIMUMS[r.type];
    if (!min) continue;
    const side = Math.min(r.width, r.depth);
    const area = roomArea(r);
    if (side < min.minSide) {
      checks.push({
        id: `lado-${roomKey(r.name)}`,
        label: `${r.name}: lado mínimo`,
        pass: false,
        detail: `${side.toFixed(2)} m < ${min.minSide.toFixed(2)} m requerido`,
        ref: `${min.label} — práctica NTC 4595 (ajustable)`,
      });
    }
    if (min.minArea > 0 && area < min.minArea) {
      checks.push({
        id: `area-${roomKey(r.name)}`,
        label: `${r.name}: área mínima`,
        pass: false,
        detail: `${area.toFixed(2)} m² < ${min.minArea.toFixed(1)} m² requerido`,
        ref: `${min.label} — práctica NTC 4595 (ajustable)`,
      });
    }
  }
  return checks;
}

function overlapChecks(rooms: Room[]): GateCheck[] {
  const checks: GateCheck[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.level !== b.level) continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
      if (overlapX > 0.15 && overlapY > 0.15) {
        checks.push({
          id: `solape-${roomKey(a.name)}-${roomKey(b.name)}`,
          label: `Solapamiento: ${a.name} ↔ ${b.name}`,
          pass: false,
          detail: `Los espacios se cruzan ${(overlapX * overlapY).toFixed(2)} m² — el arquitecto debe corregir la retícula`,
        });
      }
    }
  }
  return checks;
}

function doorChecks(plan: FloorPlan): GateCheck[] {
  const checks: GateCheck[] = [];
  const narrow = plan.doors.filter((d) => d.width < MIN_DOOR_WIDTH - 0.01 && d.from !== "exterior");
  for (const d of narrow) {
    checks.push({
      id: `puerta-${roomKey(d.from)}-${roomKey(d.to)}`,
      label: `Puerta ${d.from} → ${d.to} angosta`,
      pass: false,
      detail: `${d.width.toFixed(2)} m < ${MIN_DOOR_WIDTH} m mínimo accesible`,
      ref: "NSR-10 A.6 (accesibilidad) — guía",
    });
  }
  return checks;
}

function coverageCheck(plan: FloorPlan, rooms: Room[]): GateCheck {
  const outlineArea = plan.outline.width * plan.outline.depth;
  const roomsArea = rooms.filter((r) => r.level === 0).reduce((s, r) => s + r.width * r.depth, 0);
  const coverage = outlineArea > 0 ? roomsArea / outlineArea : 0;
  const ok = coverage > 0.55 && coverage < 1.01;
  return {
    id: "cobertura",
    label: "Ocupación del outline",
    pass: ok,
    detail: ok
      ? `${Math.round(coverage * 100)}% de la envolvente ocupada por espacios`
      : coverage <= 0.55
        ? `Solo ${Math.round(coverage * 100)}% ocupado — hay vacíos sin asignar en la planta`
        : `${Math.round(coverage * 100)}% ocupado — espacios exceden la envolvente`,
  };
}

/** Gate 1 — Boceto del arquitecto: geometría coherente + mínimos. */
export function gateDraft(plan: FloorPlan): Gate {
  const rooms0 = plan.rooms.filter((r) => r.level === 0);
  const checks = [
    ...roomChecks(plan, plan.rooms),
    ...overlapChecks(plan.rooms),
    coverageCheck(plan, rooms0),
    {
      id: "espacios",
      label: "El programa tiene espacios definidos",
      pass: plan.rooms.length >= 2,
      detail: `${plan.rooms.length} espacios definidos`,
    },
  ];
  return { stage: "draft", title: "Puerta 1 · Boceto arquitectónico", checks };
}

/** Gate 2 — Adaptación tras expertos: sistema estructural + retícula. */
export function gateAdapt(plan: FloorPlan): Gate {
  const checks: GateCheck[] = [
    {
      id: "sistema",
      label: "Sistema estructural decidido",
      pass: !!plan.structure,
      detail: plan.structure ? plan.structure.justification.slice(0, 140) || "Definido" : "Falta memo del ingeniero civil",
    },
    {
      id: "reticula",
      label: "Retícula estructural trazada",
      pass: !!plan.structure && plan.structure.axes.length >= 2,
      detail: plan.structure ? `${plan.structure.axes.length} ejes` : "—",
    },
    ...doorChecks(plan),
  ];
  return { stage: "adapt", title: "Puerta 2 · Diseño adaptado a expertos", checks };
}

/** Gate 3 — Instalaciones: puntos eléctricos e hidrosanitarios presentes. */
export function gateInstallations(plan: FloorPlan): Gate {
  const wet = plan.rooms.filter((r) => ["bano", "cocina", "lavanderia"].includes(r.type)).map((r) => roomKey(r.name));
  const hydroInWet = plan.hydro?.points.filter((p) => wet.includes(roomKey(p.room))) ?? [];
  const hasTablero = plan.electrical?.points.some((p) => p.kind === "tablero") ?? false;
  const checks: GateCheck[] = [
    {
      id: "electrico",
      label: "Diseño eléctrico con puntos",
      pass: (plan.electrical?.points.length ?? 0) >= plan.rooms.length,
      detail: `${plan.electrical?.points.length ?? 0} puntos eléctricos en ${plan.rooms.length} espacios`,
      ref: "RETIE (diseño definitivo) — guía",
    },
    {
      id: "tablero",
      label: "Tablero eléctrico ubicado",
      pass: hasTablero,
      detail: hasTablero ? "Tablero posicionado" : "Falta ubicar el tablero principal",
      ref: "RETIE — guía",
    },
    {
      id: "hidro",
      label: "Puntos hidrosanitarios en zonas húmedas",
      pass: wet.length === 0 || hydroInWet.length >= wet.length,
      detail: `${hydroInWet.length} puntos en ${wet.length} zonas húmedas`,
      ref: "RAS (Res. 25476) — guía",
    },
  ];
  return { stage: "installations", title: "Puerta 3 · Instalaciones", checks };
}

/** Todas las gates acumuladas del expediente. */
export function allGates(plan: FloorPlan): Gate[] {
  return [gateDraft(plan), gateAdapt(plan), gateInstallations(plan)];
}

export function gateFails(gate: Gate): number {
  return gate.checks.filter((c) => !c.pass).length;
}
