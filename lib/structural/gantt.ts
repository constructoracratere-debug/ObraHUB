/**
 * 📅 SECUENCIA CONSTRUCTIVA — MAMPOSTERÍA CONFINADA E.3, ítem por ítem.
 *
 * La trazabilidad TOTAL que pide el interventor: cada actividad con su
 * NSR-10 de referencia, duración (jornadas para una casa de ~80-120 m²),
 * equipos/materiales y el hito que cierra. Determinista desde el plan.
 */
import type { FloorPlan } from "../design/schema";

export type GanttItem = {
  fase: string;
  item: string;
  duracion_dias: number;
  predecesoras: string[];
  nsr_ref: string;
  equipos: string[];
  materiales: string[];
  hito?: string;
};

// Diámetros de acero en formato limpio (sin símbolos que rompan strings)
const D38 = "3/8 pulg";
const D14 = "1/4 pulg";
const D12 = "1/2 pulg";

export function ganttMamposteriaConfinada(plan: FloorPlan): GanttItem[] {
  const m2 = plan.outline.width * plan.outline.depth;
  const niveles = plan.levels;
  const factor = m2 / 100;
  const d = (base: number) => Math.max(1, Math.round(base * factor));

  return [
    // ══ FASE 0: PRELIMINARES ══
    { fase: "0. Preliminares", item: "Localización y replanteo (estación total o distanciómetro)", duracion_dias: d(1), predecesoras: [], nsr_ref: "NSR-10 E.1", equipos: ["Estación total", "Nivel de láser", "Estacas", "Hilo"], materiales: ["Yeso o cal", "Clavos", "Pitas"] },
    { fase: "0. Preliminares", item: "Cerramiento provisional e instalaciones temporales", duracion_dias: d(2), predecesoras: ["Localización"], nsr_ref: "-", equipos: [], materiales: ["Cinta de seguridad", "Tabla", "Cables", "Bombillos"] },
    { fase: "0. Preliminares", item: "Estudio de suelos (mínimo 2 apiques a Df)", duracion_dias: d(3), predecesoras: [], nsr_ref: "NSR-10 H.1", equipos: [], materiales: [], hito: "HITO: Estudio de suelos aprobado" },

    // ══ FASE 1: CIMENTACIÓN ══
    { fase: "1. Cimentación", item: "Excavación zapatas aisladas (Df >= 1.50 m o hasta suelo firme)", duracion_dias: d(3), predecesoras: ["Localización", "Estudio de suelos"], nsr_ref: "NSR-10 E.3.3 + H.1", equipos: ["Retroexcavadora", "Pala", "Pica"], materiales: [] },
    { fase: "1. Cimentación", item: "Refino y nivelación fondo de zapata", duracion_dias: d(1), predecesoras: ["Excavación"], nsr_ref: "NSR-10 H.1", equipos: ["Nivel de láser"], materiales: ["Grava"] },
    { fase: "1. Cimentación", item: `Fundas zapatas: malla ${D38} @ 0.20 ambos sentidos + concreto 3000 psi`, duracion_dias: d(2), predecesoras: ["Refino"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora 1b", "Vibrador", "Palas"], materiales: ["Concreto 3000 psi", `Acero ${D38}`, "Alambre #18", "Madera formaleta"], hito: "HITO: Zapatas fundidas" },
    { fase: "1. Cimentación", item: `Pedestales: 4 varillas ${D38} vertical + flejes ${D14} @ 0.15 + concreto`, duracion_dias: d(2), predecesoras: ["Fundas zapatas"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora", "Vibrador"], materiales: [`Acero ${D38}`, `Flejes ${D14}`, "Concreto 3000 psi"] },
    { fase: "1. Cimentación", item: `Vigas corrida (riostras): 4 varillas ${D38} + flejes ${D14} @ 0.20`, duracion_dias: d(2), predecesoras: ["Pedestales"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora"], materiales: [`Acero ${D38}`, "Concreto 3000 psi", "Madera formaleta"] },
    { fase: "1. Cimentación", item: "Relleno y compactado (capas de 0.20 m)", duracion_dias: d(2), predecesoras: ["Vigas corrida"], nsr_ref: "NSR-10 H.1", equipos: ["Placa compactadora"], materiales: ["Material de relleno (recebo)"] },
    { fase: "1. Cimentación", item: "Placa de contrapiso e=0.10 m con malla", duracion_dias: d(2), predecesoras: ["Relleno"], nsr_ref: "-", equipos: ["Mezcladora"], materiales: ["Concreto 2500 psi", "Malla electrosoldada"], hito: "HITO: Cimentación completa" },

    // ══ FASE 2: ESTRUCTURA ══
    { fase: "2. Estructura N1", item: `Columnas de confinamiento N1: 4 varillas ${D38} + flejes ${D14} @ 0.15 (extremos @ 0.10)`, duracion_dias: d(3), predecesoras: ["Placa de contrapiso"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora", "Vibrador", "Andamio"], materiales: [`Acero ${D38}`, `Flejes ${D14}`, "Concreto 3000 psi", "Madera formaleta"] },
    { fase: "2. Estructura N1", item: "Muros de mampostería N1: ladrillo H-10, mortero 1:4, traba media pie", duracion_dias: d(6), predecesoras: ["Columnas N1 parcial"], nsr_ref: "NSR-10 E.3.1-E.3.2", equipos: ["Mezcladora", "Andamio", "Plomada", "Nivel"], materiales: ["Ladrillo H-10", "Cemento", "Arena"] },
    { fase: "2. Estructura N1", item: "DAL (refuerzo horizontal) cada 2 cursos o malla galvanizada", duracion_dias: d(2), predecesoras: ["Muros N1 parcial"], nsr_ref: "NSR-10 E.3.2", equipos: [], materiales: [`DAL ${D14}`, "Malla galvanizada cal. 18"] },
    { fase: "2. Estructura N1", item: `Cadena de amarre N1: 4 varillas ${D38} + flejes ${D14} @ 0.20`, duracion_dias: d(3), predecesoras: ["Muros N1 completo"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora", "Vibrador"], materiales: [`Acero ${D38}`, "Concreto 3000 psi", "Formaleta"] },

    ...(niveles >= 2 ? [
      { fase: "2. Estructura N2", item: "Placa de entrepiso: losa maciza e=0.12 con acero en 2 sentidos", duracion_dias: d(5), predecesoras: ["Cadena de amarre N1"], nsr_ref: "NSR-10 C.14", equipos: ["Mezcladora", "Vibrador", "Andamio"], materiales: ["Concreto 3000 psi", `Acero ${D38} @ 0.15`, "Formaleta"], hito: "HITO: Entrepiso fundido" },
      { fase: "2. Estructura N2", item: `Columnas de confinamiento N2 + muros N2 (igual N1)`, duracion_dias: d(7), predecesoras: ["Placa de entrepiso"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora", "Vibrador", "Andamio"], materiales: ["Ladrillo H-10", "Cemento", "Arena", "Acero"] },
      { fase: "2. Estructura N2", item: `Cadena de amarre N2`, duracion_dias: d(2), predecesoras: ["Columnas N2 + muros N2"], nsr_ref: "NSR-10 E.3.3", equipos: ["Mezcladora"], materiales: ["Acero", "Concreto"] },
    ] : []),

    // ══ FASE 3: CUBIERTA ══
    { fase: "3. Cubierta", item: "Cerchas de madera 2x6 pulg o acero @ 1.20 m sobre cadenas", duracion_dias: d(3), predecesoras: ["Cadena superior"], nsr_ref: "NSR-10 E.3.4", equipos: ["Taladro", "Andamio"], materiales: ["Cercha madera 2x6", "Pletinas", "Pernos A325"] },
    { fase: "3. Cubierta", item: "Entabladura + impermeabilización + teja", duracion_dias: d(3), predecesoras: ["Cerchas"], nsr_ref: "-", equipos: [], materiales: ["Tablas", "Impermeabilizante asfaltico", "Teja barro o fibrocemento"], hito: "HITO: Casa cubierta" },

    // ══ FASE 4: INSTALACIONES ══
    { fase: "4. Instalaciones", item: "Instalaciones eléctricas embebidas (RETIE)", duracion_dias: d(4), predecesoras: ["Entabladura + impermeabilización + teja"], nsr_ref: "RETIE Res. 40117/2021", equipos: ["Taladro", "Multimetro"], materiales: ["Tubo PVC-P 5/8 pulg", "Cable THW", "Cajas", "Tablero"] },
    { fase: "4. Instalaciones", item: "Instalaciones hidrosanitarias (RAS 0330/2017)", duracion_dias: d(4), predecesoras: ["Entabladura + impermeabilización + teja"], nsr_ref: "RAS 2017", equipos: ["Taladro", "Probador presion"], materiales: ["Tuberia PVC 1/2-3/4 pulg", "Sifones", "Caja inspeccion 0.70"] },
    { fase: "4. Instalaciones", item: "Pruebas de presion electrica e hidraulica", duracion_dias: d(1), predecesoras: ["Instalaciones electricas embebidas (RETIE)", "Instalaciones hidrosanitarias (RAS 0330/2017)"], nsr_ref: "RETIE + RAS", equipos: ["Multimetro", "Manometro"], materiales: [], hito: "HITO: Instalaciones certificadas" },

    // ══ FASE 5: ACABADOS ══
    { fase: "5. Acabados", item: "Pañete interior 1:4 e=1.5 cm (rayado + afinado)", duracion_dias: d(5), predecesoras: ["Pruebas de presion electrica e hidraulica"], nsr_ref: "-", equipos: ["Andamio", "Llana", "Platacho"], materiales: ["Cemento", "Arena", "Yeso"] },
    { fase: "5. Acabados", item: "Pañete exterior 1:3 e=2.0 cm", duracion_dias: d(3), predecesoras: ["Entabladura + impermeabilización + teja"], nsr_ref: "-", equipos: ["Andamio", "Llana"], materiales: ["Cemento", "Arena"] },
    { fase: "5. Acabados", item: "Pisos ceramicos o porcelanato por espacio", duracion_dias: d(4), predecesoras: ["Pañete interior 1:4 e=1.5 cm (rayado + afinado)"], nsr_ref: "-", equipos: ["Cortadora de baldosa", "Nivel"], materiales: ["Baldosa", "Pega", "Junta"] },
    { fase: "5. Acabados", item: "Estuco + pintura vinilica interior (2 manos)", duracion_dias: d(4), predecesoras: ["Pisos ceramicos o porcelanato por espacio"], nsr_ref: "-", equipos: ["Rodillo", "Brocha"], materiales: ["Estuco", "Pintura vinilica"] },
    { fase: "5. Acabados", item: "Pintura exterior esmalte/acrilico (2 manos)", duracion_dias: d(3), predecesoras: ["Pañete exterior 1:3 e=2.0 cm"], nsr_ref: "-", equipos: ["Rodillo"], materiales: ["Pintura exterior acrilica"] },
    { fase: "5. Acabados", item: "Carpinteria: puertas + ventanas + closet", duracion_dias: d(4), predecesoras: ["Estuco + pintura vinilica interior (2 manos)"], nsr_ref: "-", equipos: ["Taladro", "Destornillador"], materiales: ["Puertas madera", "Ventanas aluminio + vidrio", "Closet MDP"] },
    { fase: "5. Acabados", item: "Aparatos sanitarios + griferia", duracion_dias: d(2), predecesoras: ["Pisos ceramicos o porcelanato por espacio"], nsr_ref: "RAS", equipos: ["Llave inglesa"], materiales: ["Inodoro", "Lavamanos", "Ducha", "Griferia"] },
    { fase: "5. Acabados", item: "Zocalos + remates + limpieza general", duracion_dias: d(2), predecesoras: ["Carpinteria: puertas + ventanas + closet", "Aparatos sanitarios + griferia"], nsr_ref: "-", equipos: [], materiales: ["Zocalo PVC 10 cm", "Silicona"], hito: "HITO: ENTREGA — obra terminada" },
  ];
}

export function ganttTotalDias(items: GanttItem[]): number {
  return items.reduce((s, x) => s + x.duracion_dias, 0);
}

export function ganttEquipos(items: GanttItem[]): string[] {
  return [...new Set(items.flatMap((x) => x.equipos))];
}

export function ganttMateriales(items: GanttItem[]): Array<{ material: string; fases: string[] }> {
  const map = new Map<string, Set<string>>();
  for (const x of items) for (const m of x.materiales) {
    if (!map.has(m)) map.set(m, new Set());
    map.get(m)!.add(x.fase);
  }
  return [...map.entries()].map(([material, fases]) => ({ material, fases: [...fases] }));
}
