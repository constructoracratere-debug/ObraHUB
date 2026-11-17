/**
 * 📚 BIBLIOTECA CONSTRUCTIVA — el sistema que APRENDE de fotos de obra.
 *
 * El usuario sube imágenes de uniones reales de guadua, detalles de
 * mampostería, muestras de materiales, procesos constructivos → GPT-4o
 * (visión) las ANALIZA → JSON estructurado (materiales, dimensiones,
 * técnica, referencia NSR) → ese conocimiento se INYECTA en los prompts
 * del civil y el arquitecto → los planos 2D y el IFC 3D mejoran con
 * CADA imagen acumulada.
 *
 * Es el bucle de retroalimentación que hace la herramienta cada vez más
 * precisa: no es un modelo estático, es un sistema que aprende de la
 * experiencia constructiva real del equipo.
 */

export type DetailCategory =
  | "union_guadua"        // Uniones, amarres, nudos de guadua
  | "union_madera"        // Uniones de madera aserrada
  | "detalle_mamposteria" // Detalles de mampostería confinada (E.3)
  | "detalle_bahareque"   // Detalles de bahareque encementado (E.4)
  | "material"            // Muestras de materiales (ladrillo, mortero, guadua)
  | "cimentacion"         // Detalles de zapatas, pedestales, vigas
  | "cubierta"            // Detalles de cubiertas, cerchas, canaletes
  | "instalacion"         // Detalles de instalaciones embebidas
  | "proceso"             // Secuencias constructivas, etapas de obra
  | "daño"                // Patologías, errores — lo que NO se debe hacer
  | "otro";

export const CATEGORY_LABELS: Record<DetailCategory, string> = {
  union_guadua: "Unión de guadua",
  union_madera: "Unión de madera",
  detalle_mamposteria: "Detalle mampostería (E.3)",
  detalle_bahareque: "Detalle bahareque (E.4)",
  material: "Material / muestra",
  cimentacion: "Cimentación",
  cubierta: "Cubierta",
  instalacion: "Instalación",
  proceso: "Proceso constructivo",
  daño: "Patología / error",
  otro: "Otro",
};

export const DETAIL_CATEGORIES: DetailCategory[] = Object.keys(CATEGORY_LABELS) as DetailCategory[];

export type ConstructionDetail = {
  id: string;
  /** Data URL de la imagen (máx 1.5 MB comprimida antes de llegar aquí). */
  image: string;
  category: DetailCategory;
  /** Análisis estructurado por visión AI (GPT-4o). */
  analysis: {
    titulo: string;
    descripcion: string;
    materiales: string[];
    dimensiones: string[];
    tecnica: string;
    nsrRef: string;
    /** Buena práctica a replicar / error a evitar. */
    leccion: string;
    /** Palabras clave para el prompt del civil. */
    keywords: string[];
  };
  /** Sistema estructural al que aplica (si es específico). */
  system?: string;
  createdAt: string;
  /** ID del proyecto (null = biblioteca global). */
  projectId: string | null;
};

/** Prompt de visión: extrae TODO lo que un ingeniero vería en la foto. */
export const AGENT_VISION_DETAIL = `Eres un INGENIERO ESTRUCTURAL colombiano experto en construcción con guadua, mampostería y sistemas del NSR-10 Título E.
Analiza la imagen de un detalle constructivo REAL (foto de obra) y extrae TODO el conocimiento técnico que un profesional necesitaría para REPLICARLO en un diseño BIM.

Responde SOLO este JSON:
{
  "titulo": "nombre corto y técnico del detalle (ej. 'Unión guadua-mortero en nudo de diafragma')",
  "descripcion": "qué se ve, cómo está construido, en qué parte del edificio va (2-4 frases técnicas)",
  "materiales": ["lista EXACTA de materiales visibles con especificaciones (ej. 'Guadua angustifolia Ø10cm tratada', 'Mortero 1:4 e=2cm')"],
  "dimensiones": ["dimensiones visibles o inferibles (ej. 'Separación montantes @0.45m', 'Malla galvanizada cal. 18')"],
  "tecnica": "procedimiento constructivo paso a paso (cómo se ejecuta esta unión/detalle en obra)",
  "nsrRef": "artículo NSR-10 aplicable si es identificable (ej. 'E.4.2', 'G.12.3') o vacío",
  "leccion": "qué se debe aprender de esta imagen: buena práctica a replicar O error a evitar (1-2 frases)",
  "keywords": ["3-6 palabras clave para indexar en el prompt del ingeniero"]
}
Sé ESPECÍFICO y TÉCNICO: medidas, proporciones, especies, diámetros, tratamientos, procesos. Si hay errores en la foto (patología), descríbelos honestamente en 'leccion'.
Devuelve EXCLUSIVAMENTE el JSON.`;

/** Compacta TODA la biblioteca para inyectar en el prompt del civil. */
export function knowledgeForPrompt(details: ConstructionDetail[]): string {
  if (!details.length) return "";
  const lines = details.slice(0, 20).map((d, i) => {
    const a = d.analysis;
    return `[${i + 1}] ${a.titulo} (${CATEGORY_LABELS[d.category]})
  Materiales: ${a.materiales.join("; ")}
  Técnica: ${a.tecnica.slice(0, 200)}
  ${a.nsrRef ? `NSR-10: ${a.nsrRef}` : ""}
  Lección: ${a.leccion.slice(0, 180)}`;
  });
  return `\n📚 CONOCIMIENTO CONSTRUCTIVO DE OBRA REAL (${details.length} detalles subidos por el equipo — APLÍCALOS en tu diseño):\n${lines.join("\n")}\n`;
}
