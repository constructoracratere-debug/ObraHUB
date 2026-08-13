/**
 * IFC quantity extraction + mapping to Colombian APU (cost estimate) chapters.
 *
 * This module is browser-only: it operates on an already-initialised web-ifc
 * IfcAPI + modelID. The data types returned are plain JSON so they can be
 * serialised and passed to the AI budget/schedule generators.
 *
 * The IFC entity type IDs below come from web-ifc's ifc-schema.d.ts.
 * They are the numeric line-type IDs (e.g. IFCWALL = 2391406946).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single IFC building element with its extracted quantities. */
export type IfcElementQuantity = {
  expressID: number;
  guid: string;
  ifcClass: string;
  name: string;
  area?: number; // m²
  volume?: number; // m³
  length?: number; // ml (linear metres)
  count?: number; // unit count
};

/** Aggregated quantities grouped by IFC class. */
export type IfcClassGroup = {
  ifcClass: string;
  apuChapter: string; // mapped Colombian chapter (Estructura, Mampostería…)
  count: number;
  totalArea?: number;
  totalVolume?: number;
  totalLength?: number;
  unit: string; // predominant unit (m², m³, ml, unidad)
  elements: IfcElementQuantity[];
};

/** Full summary of an IFC model's quantities. */
export type IfcQuantitySummary = {
  totalElements: number;
  totalArea?: number;
  totalVolume?: number;
  schema?: string;
  byClass: IfcClassGroup[];
};

// ---------------------------------------------------------------------------
// IFC entity type IDs (from web-ifc ifc-schema.d.ts)
// ---------------------------------------------------------------------------

import {
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCWALLELEMENTEDCASE,
  IFCSLAB,
  IFCSLABSTANDARDCASE,
  IFCSLABELEMENTEDCASE,
  IFCCOLUMN,
  IFCCOLUMNSTANDARDCASE,
  IFCBEAM,
  IFCBEAMSTANDARDCASE,
  IFCFOOTING,
  IFCROOF,
  IFCDOOR,
  IFCDOORSTANDARDCASE,
  IFCWINDOW,
  IFCWINDOWSTANDARDCASE,
  IFCSTAIR,
  IFCSTAIRFLIGHT,
  IFCRAILING,
  IFCSPACE,
  IFCCURTAINWALL,
  IFCBUILDINGELEMENTPROXY,
  IFCQUANTITYAREA,
  IFCQUANTITYVOLUME,
  IFCQUANTITYLENGTH,
  IFCQUANTITYCOUNT,
} from "web-ifc";

/** Mapping of IFC class names → numeric type IDs we care about. */
const ELEMENT_TYPE_MAP: Record<string, number[]> = {
  IfcWall: [IFCWALL, IFCWALLSTANDARDCASE, IFCWALLELEMENTEDCASE],
  IfcSlab: [IFCSLAB, IFCSLABSTANDARDCASE, IFCSLABELEMENTEDCASE],
  IfcColumn: [IFCCOLUMN, IFCCOLUMNSTANDARDCASE],
  IfcBeam: [IFCBEAM, IFCBEAMSTANDARDCASE],
  IfcFooting: [IFCFOOTING],
  IfcRoof: [IFCROOF],
  IfcDoor: [IFCDOOR, IFCDOORSTANDARDCASE],
  IfcWindow: [IFCWINDOW, IFCWINDOWSTANDARDCASE],
  IfcStair: [IFCSTAIR, IFCSTAIRFLIGHT],
  IfcRailing: [IFCRAILING],
  IfcSpace: [IFCSPACE],
  IfcCurtainWall: [IFCCURTAINWALL],
  IfcBuildingElementProxy: [IFCBUILDINGELEMENTPROXY],
};

/** Reverse lookup: numeric type ID → friendly class name. */
const TYPE_ID_TO_NAME: Map<number, string> = new Map();
for (const [name, ids] of Object.entries(ELEMENT_TYPE_MAP)) {
  for (const id of ids) TYPE_ID_TO_NAME.set(id, name);
}

/** Friendly class names we iterate over (most common first). */
export const TRACKED_CLASSES = Object.keys(ELEMENT_TYPE_MAP);

// ---------------------------------------------------------------------------
// APU chapter mapping (Colombian construction standard)
// ---------------------------------------------------------------------------

const APU_CHAPTER_MAP: Record<string, string> = {
  IfcFooting: "Cimentación",
  IfcColumn: "Estructura",
  IfcBeam: "Estructura",
  IfcSlab: "Estructura",
  IfcWall: "Mampostería y Muros",
  IfcCurtainWall: "Cerramientos",
  IfcRoof: "Cubiertas",
  IfcStair: "Estructura",
  IfcRailing: "Barandas y Pasamanos",
  IfcDoor: "Carpintería Metálica y de Madera",
  IfcWindow: "Carpintería Metálica y de Madera",
  IfcSpace: "Acabados",
  IfcBuildingElementProxy: "Varios",
};

const APU_LABEL_MAP: Record<string, string> = {
  IfcFooting: "zapatas de cimentación",
  IfcColumn: "columnas de concreto reforzado",
  IfcBeam: "vigas de concreto reforzado",
  IfcSlab: "losas de concreto",
  IfcWall: "muros y paredes",
  IfcCurtainWall: "muros cortina",
  IfcRoof: "cubiertas",
  IfcStair: "escaleras",
  IfcRailing: "barandas y pasamanos",
  IfcDoor: "puertas",
  IfcWindow: "ventanas",
  IfcSpace: "espacios / acabados",
  IfcBuildingElementProxy: "elementos varios",
};

/** Maps an IFC class to a Colombian APU chapter. */
export function mapIfcClassToAPUChapter(ifcClass: string): string {
  return APU_CHAPTER_MAP[ifcClass] ?? "Varios";
}

/** Returns a human-readable label for the IFC class (for prompts). */
export function apuLabel(ifcClass: string): string {
  return APU_LABEL_MAP[ifcClass] ?? ifcClass.toLowerCase();
}

// ---------------------------------------------------------------------------
// Quantity extraction
// ---------------------------------------------------------------------------

/**
 * Reads the quantity value from a property/quantity set.
 * web-ifc flattens psets into objects with { Name, AreaValue | VolumeValue | ... }.
 */
function readQuantityValue(qset: any): Partial<IfcElementQuantity> {
  const out: Partial<IfcElementQuantity> = {};
  if (qset == null || typeof qset !== "object") return out;

  const area = qset.AreaValue ?? qset["Area"]?.value;
  const volume = qset.VolumeValue ?? qset["Volume"]?.value;
  const length = qset.LengthValue ?? qset["Length"]?.value;
  const count = qset.CountValue ?? qset["Count"]?.value;

  if (typeof area === "number" && area > 0) out.area = area;
  if (typeof volume === "number" && volume > 0) out.volume = volume;
  if (typeof length === "number" && length > 0) out.length = length;
  if (typeof count === "number" && count > 0) out.count = count;
  return out;
}

/**
 * Extracts quantities for a single element by reading its inverse
 * IfcRelDefinesByProperties → IfcElementQuantity → IfcQuantity* chain.
 */
async function extractElementQuantities(
  ifcAPI: any,
  modelID: number,
  expressID: number,
): Promise<Partial<IfcElementQuantity>> {
  try {
    const psets = await ifcAPI.properties.getPropertySets(modelID, expressID, false, true);
    if (!Array.isArray(psets)) return {};

    const result: Partial<IfcElementQuantity> = {};
    for (const pset of psets) {
      // IfcElementQuantity has Quantities pointing to IfcQuantity*
      const quants = pset.Quantities;
      if (!Array.isArray(quants)) continue;
      for (const q of quants) {
        if (!q) continue;
        const merged = readQuantityValue(q);
        // Prefer the largest found value for each dimension.
        if (merged.area != null && (result.area == null || merged.area > result.area))
          result.area = merged.area;
        if (merged.volume != null && (result.volume == null || merged.volume > result.volume))
          result.volume = merged.volume;
        if (merged.length != null && (result.length == null || merged.length > result.length))
          result.length = merged.length;
        if (merged.count != null && result.count == null) result.count = merged.count;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Extracts a complete quantity summary from a loaded IFC model.
 *
 * @param ifcAPI  An initialised IfcAPI instance (Init() already called).
 * @param modelID The model handle returned by OpenModel().
 */
export async function extractQuantities(
  ifcAPI: any,
  modelID: number,
): Promise<IfcQuantitySummary> {
  const schema = tryGetSchema(ifcAPI, modelID);
  const byClassMap = new Map<string, IfcClassGroup>();
  let totalArea = 0;
  let totalVolume = 0;
  let totalElements = 0;
  let hasArea = false;
  let hasVolume = false;

  for (const className of TRACKED_CLASSES) {
    const typeIds = ELEMENT_TYPE_MAP[className];
    const elements: IfcElementQuantity[] = [];

    for (const typeId of typeIds) {
      let idVector;
      try {
        idVector = ifcAPI.GetLineIDsWithType(modelID, typeId);
      } catch {
        continue;
      }
      if (!idVector) continue;
      const size = idVector.size();
      if (size === 0) continue;

      for (let i = 0; i < size; i++) {
        const expressID = idVector.get(i);
        let line: any;
        try {
          line = ifcAPI.GetLine(modelID, expressID, false);
        } catch {
          continue;
        }
        if (!line) continue;

        const name = typeof line.Name?.value === "string" ? line.Name.value : "";
        const guid = typeof line.GlobalId?.value === "string" ? line.GlobalId.value : "";

        const quant = await extractElementQuantities(ifcAPI, modelID, expressID);

        const el: IfcElementQuantity = {
          expressID,
          guid,
          ifcClass: className,
          name: name || className,
          ...quant,
        };
        elements.push(el);

        if (el.area != null) {
          totalArea += el.area;
          hasArea = true;
        }
        if (el.volume != null) {
          totalVolume += el.volume;
          hasVolume = true;
        }
      }
    }

    if (elements.length === 0) continue;

    // Aggregate
    let groupArea = 0;
    let groupVolume = 0;
    let groupLength = 0;
    let hasGArea = false;
    let hasGVolume = false;
    let hasGLength = false;
    for (const el of elements) {
      if (el.area != null) {
        groupArea += el.area;
        hasGArea = true;
      }
      if (el.volume != null) {
        groupVolume += el.volume;
        hasGVolume = true;
      }
      if (el.length != null) {
        groupLength += el.length;
        hasGLength = true;
      }
    }

    // Choose the predominant unit for this class.
    let unit = "unidad";
    if (hasGArea) unit = "m²";
    else if (hasGVolume) unit = "m³";
    else if (hasGLength) unit = "ml";

    byClassMap.set(className, {
      ifcClass: className,
      apuChapter: mapIfcClassToAPUChapter(className),
      count: elements.length,
      totalArea: hasGArea ? round(groupArea) : undefined,
      totalVolume: hasGVolume ? round(groupVolume) : undefined,
      totalLength: hasGLength ? round(groupLength) : undefined,
      unit,
      elements,
    });
    totalElements += elements.length;
  }

  return {
    totalElements,
    totalArea: hasArea ? round(totalArea) : undefined,
    totalVolume: hasVolume ? round(totalVolume) : undefined,
    schema,
    byClass: Array.from(byClassMap.values()),
  };
}

function tryGetSchema(ifcAPI: any, modelID: number): string | undefined {
  try {
    return ifcAPI.GetModelSchema(modelID);
  } catch {
    return undefined;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Prompt context builders (for AI budget/schedule generators)
// ---------------------------------------------------------------------------

/**
 * Builds a natural-language description of the IFC model's quantities,
 * suitable for injection into the budget (APU) AI prompt.
 *
 * Example output:
 *   "Modelo BIM con 412 elementos. Cantidades extraídas:
 *    - Mampostería y Muros (IfcWall): 48 muros, 245.50 m² de muros y paredes
 *    - Estructura (IfcSlab): 12 losas de concreto, 180.00 m²
 *    ..."
 */
export function buildBudgetContextFromIFC(summary: IfcQuantitySummary): string {
  if (summary.byClass.length === 0) {
    return "Modelo BIM cargado pero no se pudieron extraer cantidades detalladas.";
  }

  // Group by APU chapter for a cleaner narrative.
  const chapterMap = new Map<string, IfcClassGroup[]>();
  for (const group of summary.byClass) {
    const list = chapterMap.get(group.apuChapter) ?? [];
    list.push(group);
    chapterMap.set(group.apuChapter, list);
  }

  const lines: string[] = [];
  lines.push(
    `Modelo BIM (IFC ${summary.schema ?? ""}) con ${summary.totalElements} elementos. Cantidades extraídas automáticamente del modelo:`,
  );

  for (const [chapter, groups] of chapterMap) {
    for (const g of groups) {
      const label = apuLabel(g.ifcClass);
      const parts: string[] = [`${g.count} ${label}`];
      if (g.totalArea != null) parts.push(`${g.totalArea} m²`);
      else if (g.totalVolume != null) parts.push(`${g.totalVolume} m³`);
      else if (g.totalLength != null) parts.push(`${g.totalLength} ml`);
      lines.push(`- ${chapter} — ${g.ifcClass}: ${parts.join(", ")}`);
    }
  }

  lines.push("");
  lines.push(
    "Generar el presupuesto APU completo usando estas cantidades exactas del modelo BIM como base.",
  );
  return lines.join("\n");
}

/**
 * Builds a context string for the schedule (Gantt) AI generator, focused on
 * the buildable scope derived from the IFC model.
 */
export function buildScheduleContextFromIFC(summary: IfcQuantitySummary): string {
  if (summary.byClass.length === 0) {
    return "Modelo BIM sin cantidades detalladas.";
  }
  const lines: string[] = [];
  lines.push(
    `El proyecto se basa en un modelo BIM real (IFC ${summary.schema ?? ""}) con ${summary.totalElements} elementos:`,
  );
  for (const g of summary.byClass) {
    const label = apuLabel(g.ifcClass);
    const parts: string[] = [`${g.count}`];
    if (g.totalArea != null) parts.push(`${g.totalArea} m²`);
    else if (g.totalVolume != null) parts.push(`${g.totalVolume} m³`);
    else if (g.totalLength != null) parts.push(`${g.totalLength} ml`);
    lines.push(`- ${label} (${g.ifcClass}): ${parts.join(" / ")}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Exported type-id helpers (used by the viewer for geometry streaming)
// ---------------------------------------------------------------------------

/** Returns the numeric type IDs the viewer should stream meshes for. */
export function getTrackedTypeIds(): number[] {
  const ids: number[] = [];
  for (const arr of Object.values(ELEMENT_TYPE_MAP)) ids.push(...arr);
  return ids;
}

/** Looks up the friendly class name for a numeric IFC type ID. */
export function classNameForTypeId(typeId: number): string | undefined {
  return TYPE_ID_TO_NAME.get(typeId);
}

// Re-export the quantity type IDs in case the viewer wants to query them.
export const IFC_QUANTITY_TYPE_IDS = {
  IFCQUANTITYAREA,
  IFCQUANTITYVOLUME,
  IFCQUANTITYLENGTH,
  IFCQUANTITYCOUNT,
};
