/**
 * ✏️ Diseño IA — Formato intermedio JSON (el contrato IA ↔ motor).
 *
 * Filosofía del roadmap: "AI thinks, deterministic engines draw". El LLM
 * NUNCA dibuja: emite este esquema; el sanitizador de aquí y los motores
 * (dxf.ts / svg en design-tool.tsx) producen la geometría real.
 *
 * v2 añade lo del estudio multi-agente: sitio investigado (POT/clima/
 * materiales), sistema estructural con retícula, capas de instalaciones
 * (eléctrico/hidrosanitario) y acabados por espacio.
 */

export type RoomType =
  | "sala"
  | "comedor"
  | "cocina"
  | "habitacion"
  | "habitacion_principal"
  | "estudio"
  | "bano"
  | "lavanderia"
  | "pasillo"
  | "balcon"
  | "patio"
  | "garaje"
  | "escalera"
  | "otro";

export type WallSide = "norte" | "sur" | "este" | "oeste";

export type StructuralSystem =
  | "concreto"
  | "acero_liviano"
  | "madera"
  | "guadua"
  | "tierra"
  | "mixto";

export type Room = {
  name: string;
  type: RoomType;
  /** Esquina inferior-izquierda del interior limpio (m). */
  x: number;
  y: number;
  /** Dimensiones INTERIORES limpias (m). */
  width: number;
  depth: number;
  /** Nivel (0 = primer piso). */
  level: number;
};

export type Door = {
  from: string;
  to: string;
  /** Centro del vano sobre el muro (m). */
  x: number;
  y: number;
  width: number;
  hinge: "left" | "right";
  swing: "in" | "out";
  level: number;
};

export type Window = {
  room: string;
  wall: WallSide;
  /** Centro del vano sobre el muro indicado (m, eje correspondiente). */
  x: number;
  width: number;
  sill: number;
  height: number;
  level: number;
};

export type StructureAxis = {
  id: string;
  orientation: "vertical" | "horizontal";
  /** Coordenada del eje (m) — x si vertical, y si horizontal. */
  at: number;
};

export type ElectricalDevice =
  | "tomacorriente"
  | "tomacorriente_especial"
  | "interruptor"
  | "iluminacion"
  | "tablero";

export type ElectricalPoint = {
  kind: ElectricalDevice;
  room: string;
  x: number;
  y: number;
  level: number;
};

export type HydroFixture =
  | "lavamanos"
  | "sanitario"
  | "ducha"
  | "lavaplatos"
  | "lavadero"
  | "calentador"
  | "punto_hidraulico";

export type HydroPoint = {
  kind: HydroFixture;
  room: string;
  x: number;
  y: number;
  level: number;
};

export type FinishRow = { room: string; floor: string; walls: string; ceiling: string };

export type SiteFicha = {
  city: string;
  department: string;
  latitude?: number;
  longitude?: number;
  climate: string;
  wind: string;
  potNotes: string;
  localMaterials: string[];
  localMethods: string[];
  risks: string[];
};

export type FloorPlan = {
  version: 2;
  name: string;
  units: "m";
  /** Número de niveles del proyecto. */
  levels: number;
  /** Altura piso a piso (m). */
  floorToFloor: number;
  outline: { width: number; depth: number };
  wallThickness: { exterior: number; interior: number };
  site?: SiteFicha;
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  structure?: {
    system: StructuralSystem;
    justification: string;
    axes: StructureAxis[];
  };
  electrical?: { points: ElectricalPoint[]; notes: string };
  hydro?: { points: HydroPoint[]; notes: string };
  finishes?: FinishRow[];
};

// ─── Sanitizador ────────────────────────────────────────────────────────────
// El LLM propone; estas funciones DISPONEN. Todo lo que llega del exterior
// pasa por aquí antes de tocar los motores de dibujo.

const ROOM_TYPES: RoomType[] = [
  "sala", "comedor", "cocina", "habitacion", "habitacion_principal", "estudio",
  "bano", "lavanderia", "pasillo", "balcon", "patio", "garaje", "escalera", "otro",
];

const HYDRO_KINDS: HydroFixture[] = [
  "lavamanos", "sanitario", "ducha", "lavaplatos", "lavadero", "calentador", "punto_hidraulico",
];

const ELEC_KINDS: ElectricalDevice[] = [
  "tomacorriente", "tomacorriente_especial", "interruptor", "iluminacion", "tablero",
];

const SYSTEMS: StructuralSystem[] = [
  "concreto", "acero_liviano", "madera", "guadua", "tierra", "mixto",
];

const MIN_DIM = 0.9;      // m — ninguna habitación más pequeña que esto
const MAX_DIM = 30;       // m — tampoco más grande que esto (sanity)
const MAX_ROOMS = 40;
const MAX_OUTLINE = 60;   // m

/** Redondea a centímetros y acota a [min, max]. */
function dim(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

function coord(v: unknown, min: number, max: number): number {
  return dim(v, min, max, 0);
}

function str(v: unknown, fallback: string, max = 120): string {
  if (typeof v !== "string" || !v.trim()) return fallback;
  return v.trim().slice(0, max);
}

function enumOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

/** Normaliza un nombre de espacio para buscar por sala ("Baño 1" ≈ "bano1"). */
export function roomKey(name: unknown): string {
  return str(name, "", 60).toLowerCase().replace(/[\s_-]+/g, "");
}

/** Convierte un JSON crudo (del LLM o de disco) en un FloorPlan confiable. */
export function sanitizeFloorPlan(raw: unknown): FloorPlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const outlineW = dim((o.outline as any)?.width, 3, MAX_OUTLINE, 10);
  const outlineD = dim((o.outline as any)?.depth, 3, MAX_OUTLINE, 8);
  const levels = Math.round(dim(o.levels, 1, 4, 1));
  const wallExt = dim((o.wallThickness as any)?.exterior, 0.1, 0.4, 0.15);
  const wallInt = dim((o.wallThickness as any)?.interior, 0.08, 0.3, 0.1);

  const roomsRaw = Array.isArray(o.rooms) ? o.rooms.slice(0, MAX_ROOMS) : [];
  const rooms: Room[] = roomsRaw.map((r0, i) => {
    const r = (r0 ?? {}) as Record<string, unknown>;
    const type = enumOf(r.type, ROOM_TYPES, "otro");
    const width = dim(r.width, MIN_DIM, MAX_DIM, 3);
    const depth = dim(r.depth, MIN_DIM, MAX_DIM, 3);
    // Clamp del interior dentro del outline.
    const x = coord(r.x, 0, Math.max(0, outlineW - width));
    const y = coord(r.y, 0, Math.max(0, outlineD - depth));
    return {
      name: str(r.name, `${type} ${i + 1}`, 40),
      type,
      x: Math.min(x, outlineW - width),
      y: Math.min(y, outlineD - depth),
      width,
      depth,
      level: Math.round(dim(r.level, 0, levels - 1, 0)),
    };
  });

  const keyOf = (n: unknown) => roomKey(n);
  const roomKeys = new Set(rooms.map((r) => keyOf(r.name)));

  const doorsRaw = Array.isArray(o.doors) ? o.doors.slice(0, 60) : [];
  const doors: Door[] = doorsRaw
    .map((d0) => {
      const d = (d0 ?? {}) as Record<string, unknown>;
      return {
        from: str(d.from, "exterior", 40),
        to: str(d.to, "interior", 40),
        x: coord(d.x, 0, outlineW),
        y: coord(d.y, 0, outlineD),
        width: dim(d.width, 0.6, 1.6, 0.9),
        hinge: enumOf(d.hinge, ["left", "right"] as const, "left"),
        swing: enumOf(d.swing, ["in", "out"] as const, "in"),
        level: Math.round(dim(d.level, 0, levels - 1, 0)),
      } satisfies Door;
    })
    .filter((d) => roomKeys.size === 0 || roomKeys.has(keyOf(d.from)) || roomKeys.has(keyOf(d.to)) || keyOf(d.from) === "exterior");

  const windowsRaw = Array.isArray(o.windows) ? o.windows.slice(0, 80) : [];
  const windows: Window[] = windowsRaw
    .map((w0) => {
      const w = (w0 ?? {}) as Record<string, unknown>;
      return {
        room: str(w.room, rooms[0]?.name ?? "espacio", 40),
        wall: enumOf(w.wall, ["norte", "sur", "este", "oeste"] as const, "norte"),
        x: coord(w.x, 0, Math.max(outlineW, outlineD)),
        width: dim(w.width, 0.4, 4, 1.2),
        sill: dim(w.sill, 0, 2, 0.9),
        height: dim(w.height, 0.3, 3, 1.1),
        level: Math.round(dim(w.level, 0, levels - 1, 0)),
      } satisfies Window;
    })
    .filter((w) => roomKeys.size === 0 || roomKeys.has(keyOf(w.room)));

  const structureRaw = o.structure as Record<string, unknown> | undefined;
  const structure = structureRaw
    ? {
        system: enumOf(structureRaw.system, SYSTEMS, "concreto"),
        justification: str(structureRaw.justification, "", 600),
        axes: (Array.isArray(structureRaw.axes) ? structureRaw.axes.slice(0, 20) : []).map((a0) => {
          const a = (a0 ?? {}) as Record<string, unknown>;
          const orientation = enumOf(a.orientation, ["vertical", "horizontal"] as const, "vertical");
          return {
            id: str(a.id, "?", 4),
            orientation,
            at: coord(a.at, 0, orientation === "vertical" ? outlineW : outlineD),
          };
        }),
      }
    : undefined;

  const electricalRaw = o.electrical as Record<string, unknown> | undefined;
  const electrical = electricalRaw && Array.isArray(electricalRaw.points)
    ? {
        points: electricalRaw.points.slice(0, 150).map((p0) => {
          const p = (p0 ?? {}) as Record<string, unknown>;
          return {
            kind: enumOf(p.kind, ELEC_KINDS, "tomacorriente"),
            room: str(p.room, "", 40),
            x: coord(p.x, 0, outlineW),
            y: coord(p.y, 0, outlineD),
            level: Math.round(dim(p.level, 0, levels - 1, 0)),
          } satisfies ElectricalPoint;
        }),
        notes: str(electricalRaw.notes, "", 600),
      }
    : undefined;

  const hydroRaw = o.hydro as Record<string, unknown> | undefined;
  const hydro = hydroRaw && Array.isArray(hydroRaw.points)
    ? {
        points: hydroRaw.points.slice(0, 100).map((p0) => {
          const p = (p0 ?? {}) as Record<string, unknown>;
          return {
            kind: enumOf(p.kind, HYDRO_KINDS, "punto_hidraulico"),
            room: str(p.room, "", 40),
            x: coord(p.x, 0, outlineW),
            y: coord(p.y, 0, outlineD),
            level: Math.round(dim(p.level, 0, levels - 1, 0)),
          } satisfies HydroPoint;
        }),
        notes: str(hydroRaw.notes, "", 600),
      }
    : undefined;

  const finishes = Array.isArray(o.finishes)
    ? o.finishes.slice(0, MAX_ROOMS).map((f0) => {
        const f = (f0 ?? {}) as Record<string, unknown>;
        return {
          room: str(f.room, "", 40),
          floor: str(f.floor, "", 80),
          walls: str(f.walls, "", 80),
          ceiling: str(f.ceiling, "", 80),
        } satisfies FinishRow;
      })
    : undefined;

  const siteRaw = o.site as Record<string, unknown> | undefined;
  const site = siteRaw
    ? {
        city: str(siteRaw.city, "", 60),
        department: str(siteRaw.department, "", 60),
        latitude: typeof siteRaw.latitude === "number" && Number.isFinite(siteRaw.latitude) ? siteRaw.latitude : undefined,
        longitude: typeof siteRaw.longitude === "number" && Number.isFinite(siteRaw.longitude) ? siteRaw.longitude : undefined,
        climate: str(siteRaw.climate, "", 400),
        wind: str(siteRaw.wind, "", 300),
        potNotes: str(siteRaw.potNotes, "", 800),
        localMaterials: (Array.isArray(siteRaw.localMaterials) ? siteRaw.localMaterials.slice(0, 10) : []).map((m) => str(m, "", 80)),
        localMethods: (Array.isArray(siteRaw.localMethods) ? siteRaw.localMethods.slice(0, 10) : []).map((m) => str(m, "", 80)),
        risks: (Array.isArray(siteRaw.risks) ? siteRaw.risks.slice(0, 8) : []).map((m) => str(m, "", 120)),
      }
    : undefined;

  return {
    version: 2,
    name: str(o.name, "Proyecto sin nombre", 80),
    units: "m",
    levels,
    floorToFloor: dim(o.floorToFloor, 2.2, 4, 2.6),
    outline: { width: outlineW, depth: outlineD },
    wallThickness: { exterior: wallExt, interior: wallInt },
    site,
    rooms,
    doors,
    windows,
    structure,
    electrical,
    hydro,
    finishes,
  };
}

/** Área interior de un espacio (m²). */
export function roomArea(r: Pick<Room, "width" | "depth">): number {
  return Math.round(r.width * r.depth * 100) / 100;
}

/** Área total construida (suma de interiores × niveles declarados). */
export function totalArea(plan: FloorPlan): number {
  return Math.round(plan.rooms.reduce((s, r) => s + roomArea(r), 0) * 100) / 100;
}

/** Paleta por tipo de espacio (SVG + leyenda). */
export const ROOM_COLORS: Record<RoomType, string> = {
  sala: "#3b82f6",
  comedor: "#6366f1",
  cocina: "#f59e0b",
  habitacion: "#10b981",
  habitacion_principal: "#14b8a6",
  estudio: "#8b5cf6",
  bano: "#06b6d4",
  lavanderia: "#22d3ee",
  pasillo: "#64748b",
  balcon: "#f97316",
  patio: "#84cc16",
  garaje: "#94a3b8",
  escalera: "#a855f7",
  otro: "#475569",
};

export const STRUCTURE_LABELS: Record<StructuralSystem, string> = {
  concreto: "Concreto estructural",
  acero_liviano: "Acero liviano (steel framing)",
  madera: "Timber frame (madera)",
  guadua: "Guadua (bamboo)",
  tierra: "Tierra (bahareque/tapia)",
  mixto: "Mixto",
};
