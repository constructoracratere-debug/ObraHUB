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
  /** Orientación del vano: "x" corre sobre un muro N/S (abre hacia ±y),
   *  "y" sobre un muro E/O (abre hacia ±x). Lo DERIVA el sanitizador de la
   *  arista compartida — el LLM ya no decide esto. */
  axis: "x" | "y";
  /** Hacia qué lado perpendicular abre (+1 = norte/este, −1 = sur/oeste).
   *  Derivado: siempre hacia el interior del espacio destino (Ching). */
  swingDir: 1 | -1;
  /** Posición preferida sobre el muro (m desde el inicio del segmento útil).
   *  La fija el usuario ARRASTRANDO la puerta; si no, va al centro. */
  along?: number;
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

/** Memoria de diseño del arquitecto — POR QUÉ es así el proyecto
 *  (requisito de expediente para licencia). */
export type DesignReport = {
  orientation: string;        // estrategias de orientación/aparente solar
  wind: string;               // ventilación según vientos del sitio
  lighting: string;           // iluminación natural por espacio
  zoning: string;             // lógica de agrupación (húmedas, social/privada)
  dimensioning: string;       // criterio dimensional (Neufert/Plazola/Panero)
  potCompliance: string;      // cómo atiende el POT/ficha de sitio
  decisions: Array<{ issue: string; decision: string; reason: string }>;
};

/** Una revisión pedida por el profesional + qué cambió el arquitecto. */
export type RevisionLog = {
  feedback: string;
  changes: Array<{ change: string; why: string }>;
  at: string; // ISO
};

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
  /** Memoria de diseño del arquitecto (por qué así: viento/luz/orientación). */
  designReport?: DesignReport;
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
/** Arista compartida entre dos espacios (muro): axis "x" = muro horizontal
 *  (la puerta corre en X), "y" = muro vertical. null si no comparten muro. */
function sharedEdge(a: Room, b: Room): { axis: "x" | "y"; at: number; lo: number; hi: number } | null {
  const tol = 0.12;
  // Muro vertical: cara este de uno ≈ cara oeste del otro.
  const vAt = Math.abs(a.x + a.width - b.x) < tol ? a.x + a.width
    : Math.abs(b.x + b.width - a.x) < tol ? b.x + b.width : null;
  if (vAt != null) {
    const lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.depth, b.y + b.depth);
    if (hi - lo >= 0.7) return { axis: "y", at: vAt, lo, hi };
  }
  // Muro horizontal: cara norte de uno ≈ cara sur del otro.
  const hAt = Math.abs(a.y + a.depth - b.y) < tol ? a.y + a.depth
    : Math.abs(b.y + b.depth - a.y) < tol ? b.y + b.depth : null;
  if (hAt != null) {
    const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.width, b.x + b.width);
    if (hi - lo >= 0.7) return { axis: "x", at: hAt, lo, hi };
  }
  return null;
}

/** Arista del espacio contra el muro EXTERIOR (puerta principal). Los
 *  espacios están retranqueados el espesor del muro (te): su cara sur está
 *  en y≈te, no en 0. Prefiere la MÁS LARGA; empate → sur > este > norte >
 *  oeste (convención de entrada). */
function exteriorEdge(r: Room, W: number, D: number, te: number): { axis: "x" | "y"; at: number; lo: number; hi: number } | null {
  const tol = 0.03;
  const cands: Array<{ axis: "x" | "y"; at: number; lo: number; hi: number; prio: number }> = [];
  if (r.y <= te + tol) cands.push({ axis: "x", at: r.y, lo: r.x, hi: r.x + r.width, prio: 4 });
  if (r.y + r.depth >= D - te - tol) cands.push({ axis: "x", at: r.y + r.depth, lo: r.x, hi: r.x + r.width, prio: 2 });
  if (r.x <= te + tol) cands.push({ axis: "y", at: r.x, lo: r.y, hi: r.y + r.depth, prio: 1 });
  if (r.x + r.width >= W - te - tol) cands.push({ axis: "y", at: r.x + r.width, lo: r.y, hi: r.y + r.depth, prio: 3 });
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.hi - b.lo - (a.hi - a.lo) || b.prio - a.prio);
  const c = cands[0];
  return { axis: c.axis, at: c.at, lo: c.lo, hi: c.hi };
}

/** ── DERIVACIÓN de puertas (anti-random) ───────────────────────────────────
 *  Para cada conexión (from,to): arista compartida exacta; el vano se centra
 *  en el segmento útil con margen de esquina 10 cm; la bisagra va hacia el
 *  extremo MÁS CERCANO (la hoja abre contra la pared próxima — práctica
 *  estándar, Ching); el giro apunta SIEMPRE al interior del espacio destino.
 *  Dos puertas en la misma arista se reparten el segmento de forma
 *  determinista; conexiones alucinadas (sin muro compartido) se descartan. */
export function rederiveDoors(rooms: Room[], raw: Door[], W: number, D: number, te = 0.15): Door[] {
  const byKey = new Map<string, Room>();
  for (const r of rooms) byKey.set(roomKey(r.name), r);
  const pairDone = new Set<string>();
  const edgeCenters = new Map<string, number[]>();
  const out: Door[] = [];

  for (const d of raw) {
    const extA = roomKey(d.from) === "exterior";
    const A = extA ? null : byKey.get(roomKey(d.from)) ?? undefined;
    const B = byKey.get(roomKey(d.to)) ?? undefined;
    const pairKey = [roomKey(d.from), roomKey(d.to)].sort().join("↔") + `:${d.level}`;
    if (pairDone.has(pairKey)) continue; // una puerta por conexión

    let edge: ReturnType<typeof sharedEdge> = null;
    let dest: Room | undefined;
    if (A && B && A !== B && A.level === d.level && B.level === d.level) {
      edge = sharedEdge(A, B);
      dest = B;
    }
    if (!edge) {
      const R = B?.level === d.level ? B : A?.level === d.level ? A : undefined;
      if (R && (extA || roomKey(d.from) === roomKey(R.name))) {
        edge = exteriorEdge(R, W, D, te);
        dest = R;
      }
    }
    if (!edge || !dest) continue; // sin muro compartido → puerta inválida, fuera

    const w = Math.min(d.width, Math.max(0.6, edge.hi - edge.lo - 0.2));
    const lo = edge.lo + 0.1 + w / 2, hi = edge.hi - 0.1 - w / 2;
    if (hi < lo) continue; // muro demasiado corto para el vano
    const key = `${edge.axis}:${edge.at.toFixed(2)}:${d.level}`;
    const centers = edgeCenters.get(key) ?? [];
    // Posición del usuario (arrastre) respetada; si no, centro del segmento.
    let c = d.along != null ? Math.min(hi, Math.max(lo, edge.lo + 0.1 + w / 2 + (d.along - (edge.lo + 0.1)))) : lo + (hi - lo) / 2;
    if (d.along != null) c = Math.min(hi, Math.max(lo, d.along));
    // Si ya hay puerta pegada, desplaza determinista hacia el extremo libre.
    let shifted = false;
    for (let i = 0; i < 4 && centers.some((cc) => Math.abs(cc - c) < w + 0.15); i++) {
      c = i % 2 === 0 ? Math.min(hi, c + w + 0.2) : Math.max(lo, c - w - 0.2);
      shifted = true;
    }
    if (centers.some((cc) => Math.abs(cc - c) < w + 0.1)) continue; // no cabe otra
    centers.push(c);
    edgeCenters.set(key, centers);
    pairDone.add(pairKey);

    // Bisagra hacia el extremo más cercano; giro hacia el interior de dest.
    const hinge: "left" | "right" = c - edge.lo <= edge.hi - c ? "left" : "right";
    let swingDir: 1 | -1 = 1;
    if (edge.axis === "x") swingDir = dest.y + dest.depth / 2 >= edge.at ? 1 : -1;
    else swingDir = dest.x + dest.width / 2 >= edge.at ? 1 : -1;

    out.push({
      from: d.from, to: d.to, width: w, hinge, swing: "in", level: d.level,
      axis: edge.axis,
      x: edge.axis === "x" ? c : edge.at,
      y: edge.axis === "x" ? edge.at : c,
      swingDir,
    });
  }
  return out;
}

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
  const rawDoors: Door[] = doorsRaw
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
        axis: enumOf(d.axis, ["x", "y"] as const, "x"),
        swingDir: d.swingDir === -1 || d.swingDir === 1 ? d.swingDir : 1,
      } satisfies Door;
    })
    .filter((d) => roomKeys.size === 0 || roomKeys.has(keyOf(d.from)) || roomKeys.has(keyOf(d.to)) || keyOf(d.from) === "exterior");
  // GEOMETRÍA DERIVADA, no alucinada: el LLM propone CONEXIONES (from/to);
  // la posición, el eje, la bisagra y el sentido de giro salen de la arista
  // compartida entre los espacios. Se acabaron las puertas random.
  const doors = rederiveDoors(rooms, rawDoors, outlineW, outlineD, wallExt);

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

  const finishes = Array.isArray(o.finishes)    ? o.finishes.slice(0, MAX_ROOMS).map((f0) => {
        const f = (f0 ?? {}) as Record<string, unknown>;
        return {
          room: str(f.room, "", 40),
          floor: str(f.floor, "", 80),
          walls: str(f.walls, "", 80),
          ceiling: str(f.ceiling, "", 80),
        } satisfies FinishRow;
      })
    : undefined;

  // Memoria de diseño del arquitecto (se regenera en cada redibujo).
  const reportRaw = o.designReport as Record<string, unknown> | undefined;
  const designReport = reportRaw
    ? {
        orientation: str(reportRaw.orientation, "", 600),
        wind: str(reportRaw.wind, "", 500),
        lighting: str(reportRaw.lighting, "", 500),
        zoning: str(reportRaw.zoning, "", 500),
        dimensioning: str(reportRaw.dimensioning, "", 500),
        potCompliance: str(reportRaw.potCompliance, "", 600),
        decisions: (Array.isArray(reportRaw.decisions) ? reportRaw.decisions.slice(0, 12) : []).map((d0) => {
          const dd = (d0 ?? {}) as Record<string, unknown>;
          return {
            issue: str(dd.issue, "", 120),
            decision: str(dd.decision, "", 160),
            reason: str(dd.reason, "", 240),
          };
        }),
      }
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
    designReport,
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
