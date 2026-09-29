/**
 * CATALOGO MAESTRO de normas de construccion (Colombia).
 * Principio legal: solo distribuimos TEXTO de documentos OFICIALES publicos
 * (decretos/resoluciones gov). NTC (ICONTEC) y ASTM son de pago: catalogamos
 * metadatos + equivalencias + enlace oficial — sin pirateria.
 */
export type NormSource = {
  id: string;
  name: string;
  kind: "ley" | "decreto" | "resolucion" | "guia";
  /** URLs candidatas (el scraper prueba en orden y registra la que sirva). */
  urls: string[];
  scope: string;
};

export const OFFICIAL_SOURCES: NormSource[] = [
  { id: "nsr10", name: "NSR-10 (anexo Decreto 926 de 2010)", kind: "decreto",
    urls: [
      "https://www.unisdr.org/campaign/resilientcities/uploads/city/attachments/3871-10684.pdf",
      "https://www.undrr.org/campaign/resilientcities/uploads/city/attachments/3871-10684.pdf",
      "https://www.minvivienda.gov.co/sites/default/files/normativa/decreto-926-de-2010.pdf",
    ],
    scope: "Reglamento sismorresistente completo (Titulos A-K)" },
  { id: "ley400", name: "Ley 400 de 1997", kind: "ley",
    urls: ["https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5307"],
    scope: "Ley sismo (organizacion sistema nacional)" },
  { id: "retie", name: "RETIE — Res. 40284 de 2026 (compila 40117 de 2024)", kind: "resolucion",
    urls: [
      "https://www.minenergia.gov.co/documents/15918/Resolucion-40284-23-06-2026-RETIE-libros-compilados.pdf",
      "https://www.minenergia.gov.co/documents/11560/Resoluci%C3%B3n_40117_del_02-04-2024_-_Reglamento_T%C3%A9cnico_-_RETIE..pdf",
      "https://www.minenergia.gov.co/documents/11563/Resoluci%C3%B3n_40117_de_2024.pdf",
    ],
    scope: "Reglamento tecnico instalaciones electricas (4 libros)" },
  { id: "ras", name: "RAS — Res. 0330 de 2020 (acueducto/alcantarillado)", kind: "resolucion",
    urls: ["https://www.minvivienda.gov.co/sites/default/files/normativa/resolucion-0330-de-2020.pdf"],
    scope: "Titulo A/B/C/F/G — hidrosanitario" },
  { id: "retiq", name: "RETIQ — Res. 380 de 2020", kind: "resolucion",
    urls: ["https://www.minambiente.gov.co/documents/10180//Resoluci%C3%B3n%20380%20del%202020.pdf"],
    scope: "Gases refrigerantes" },
  { id: "decreto1077", name: "Decreto 1077 de 2015 (licencias)", kind: "decreto",
    urls: ["https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=78225"],
    scope: "Licencias de construccion y urbanismo" },
];

/** NTC/ASTM de pago: catalogo con equivalencias (verificar edicion en icontec.org/astm.org). */
export type PaidNorm = { code: string; title: string; topic: string; astm?: string };
export const PAID_NORMS: PaidNorm[] = [
  { code: "NTC 4595", title: "Accesibilidad al medio fisico", topic: "accesibilidad", astm: undefined },
  { code: "NTC 550", title: "Cemento portland — especificaciones", topic: "concreto", astm: "ASTM C150" },
  { code: "NTC 673", title: "Ensayo resistencia compresion cilindros concreto", topic: "concreto", astm: "ASTM C39" },
  { code: "NTC 5507", title: "Concreto fresco — toma muestras", topic: "concreto", astm: "ASTM C172" },
  { code: "NTC 5508", title: "Elaboracion y curado especimenes", topic: "concreto", astm: "ASTM C31" },
  { code: "NTC 3531", title: "Agregados para concreto", topic: "concreto", astm: "ASTM C33" },
  { code: "NTC 2289", title: "Concreto — requisitos de desempeno", topic: "concreto", astm: undefined },
  { code: "NTC 1926", title: "Madera — clasificacion visual", topic: "madera", astm: undefined },
  { code: "NTC 4483", title: "Soldadura — requisitos", topic: "metal", astm: undefined },
  { code: "ASTM C150", title: "Portland cement", topic: "concreto" },
  { code: "ASTM C39", title: "Compressive strength cylindrical specimens", topic: "concreto" },
  { code: "ASTM C172", title: "Sampling freshly mixed concrete", topic: "concreto" },
  { code: "ASTM A615", title: "Billet-steel deformed bars (acero refuerzo)", topic: "acero" },
  { code: "ASTM C33", title: "Concrete aggregates", topic: "concreto" },
];

/** Temas del KB organizados por fase de obra (mapa de cobertura). */
export const KB_TOPICS = [
  { topic: "Sismico", covers: ["nsr10", "ley400"], status: "oficial-descargable" },
  { topic: "Estructural concreto", covers: ["nsr10", "NTC 673", "ASTM C39"], status: "hibrido" },
  { topic: "Electrico", covers: ["retie"], status: "oficial-descargable" },
  { topic: "Hidrosanitario", covers: ["ras"], status: "oficial-descargable" },
  { topic: "Licenciamiento", covers: ["decreto1077"], status: "oficial-descargable" },
  { topic: "Materiales (cemento/agregados/acero)", covers: ["NTC 550", "ASTM A615"], status: "catalogo-pago" },
] as const;
