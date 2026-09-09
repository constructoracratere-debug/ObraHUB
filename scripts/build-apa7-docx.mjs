// Genera el documento de grado en NORMAS APA 7ª edición (.docx).
// Uso: node scripts/build-apa7-docx.mjs
// Especificaciones APA 7: Times New Roman 12, interlineado doble, márgenes
// 2,54 cm, sangría de primera línea 1,27 cm, niveles de título APA,
// portada de estudiante, resumen/palabras clave y referencias con sangría
// francesa. (La tabla de contenido se incluye por convención universitaria.)
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Header, PageNumber, TableOfContents, PageBreak, convertMillimetersToTwip,
} from "docx";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "universidad", "OBRahUB-Documento-APA7.docx");

const FONT = "Times New Roman";
const SZ = 24;                 // half-points → 12 pt
const DOUBLE = { line: 480 };  // doble
const INDENT = 720;            // 1,27 cm ≈ 720 twips
const MARGIN = convertMillimetersToTwip(25.4); // 2,54 cm

// ── helpers ──────────────────────────────────────────────────────────────────
const run = (text, extra = {}) => new TextRun({ text, font: FONT, size: SZ, ...extra });

const p = (text, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { ...DOUBLE, after: 0 },
    indent: { firstLine: INDENT },
    children: [run(text, opts.run ?? {})],
    ...opts.para,
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { ...DOUBLE, before: 240 },
    children: [run(text, { bold: true })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { ...DOUBLE, before: 120 },
    children: [run(text, { bold: true })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { ...DOUBLE },
    children: [run(text, { bold: true, italics: true })],
  });

const bullets = (items) =>
  items.map((t) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { ...DOUBLE },
      children: [run(t)],
    }),
  );

const ref = (text) =>
  new Paragraph({
    spacing: { ...DOUBLE },
    indent: { hanging: INDENT }, // sangría francesa (APA)
    children: [run(text)],
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ── contenido ────────────────────────────────────────────────────────────────
const children = [];

// PORTADA (APA estudiante)
children.push(
  new Paragraph({ spacing: { before: 2400, ...DOUBLE }, children: [run("", {})] }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: DOUBLE,
    children: [run("OBRahUB: Sistema operativo de construcción con inteligencia artificial multiagente para la gestión integral de proyectos y la obtención de licencias de construcción en Colombia", { bold: true })],
  }),
  new Paragraph({ spacing: DOUBLE, children: [run("")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("Diego Orlando Pineda Escobar")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("Corporación Universitaria Colmayor — UNICOLMAYOR")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("[Programa / Facultad]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("[Asesor / Docente]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("[Ciudad], Colombia")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("2026")] }),
  pageBreak(),
);

// RESUMEN + palabras clave
children.push(
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("Resumen", { bold: true })] }),
  p("La industria de la construcción en Colombia presenta brechas significativas de productividad asociadas a la gestión fragmentada de proyectos, el uso de herramientas heterogéneas no integradas y la barrera normativa local que limita la adopción de plataformas internacionales. El presente trabajo de grado desarrolla OBRahUB, un sistema operativo de construcción web que integra en un solo flujo de trabajo la gestión documental con visores BIM/CAD nativos, la generación de presupuestos por análisis de precios unitarios, la programación y control de obra con diagramas de Gantt y curva S, la bitácora diaria digital y la verificación normativa automatizada con base en el Reglamento Colombiano de Construcción Sismo Resistente (NSR-10). Como aporte central se implementa un estudio de diseño multiagente —arquitecto, constructor, ingeniero civil, experto eléctrico e hidrosanitario— que produce, a partir de lenguaje natural y mediante un formato intermedio JSON validado por puertas de verificación determinísticas, el paquete arquitectónico requerido para radicar una licencia de construcción ante curaduría urbana: plantas por niveles, cortes A-A' y B-B', cuatro fachadas y cuadro de áreas, exportable a formato DXF por capas. La solución se construyó con Next.js, Supabase y una arquitectura serverless de bajo costo, incorporando un enrutador de modelos lingüísticos de propósito general con proveedores gratuitos y de pago. Se presenta además el estudio de mercado con cuatro segmentos priorizados y el modelo de negocio asociado."),
  new Paragraph({ spacing: DOUBLE, children: [run("Palabras clave: ", { italics: true }), run("gestión de proyectos de construcción, inteligencia artificial multiagente, BIM, NSR-10, licencia de construcción, plataformas SaaS", { italics: true })] }),
  pageBreak(),
);

// ABSTRACT
children.push(
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("Abstract", { bold: true })] }),
  p("The Colombian construction industry suffers productivity gaps rooted in fragmented project management, heterogeneous non-integrated tooling, and a local regulatory barrier that limits adoption of international platforms. This degree project develops OBRahUB, a web-based construction operating system that unifies document management with native BIM/CAD viewers, unit-price budget generation, Gantt scheduling with S-curve control, a digital daily log, and automated compliance checking based on the Colombian earthquake-resistant building code (NSR-10). Its core contribution is a multi-agent design studio —architect, builder, civil engineer, electrical and plumbing specialists— that turns natural language into the full architectural package required for a construction license: floor plans, two sections, four elevations and an area schedule, exported as layered DXF. The solution was built on Next.js, Supabase and a low-cost serverless architecture, including a multi-provider LLM router. A market study with four prioritized segments and the associated business model are presented."),
  new Paragraph({ spacing: DOUBLE, children: [run("Keywords: ", { italics: true }), run("construction project management, multi-agent artificial intelligence, BIM, NSR-10, construction license, SaaS platforms", { italics: true })] }),
  pageBreak(),
);

// TABLA DE CONTENIDO
children.push(
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run("Tabla de contenido", { bold: true })] }),
  new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-2" }),
  pageBreak(),
);

// 1. INTRODUCCIÓN
children.push(h1("Introducción"));
children.push(
  p("La construcción es uno de los motores económicos de Colombia: en 2025 las constructoras del país reportaron ingresos superiores a los 91 billones de pesos, con una concentración significativa en las diez mayores firmas y una larga cola de más de 190.000 empresas y profesionales independientes que operan con herramientas dispersas (Portafolio, 2026). En ese contexto, las plataformas internacionales de gestión de construcción como Procore o Autodesk Construction Cloud resuelven el problema a escala empresarial, pero presentan tres barreras para el mercado nacional: precio por usuario prohibitivo para la mediana empresa, idioma y, sobre todo, la ausencia de la dimensión normativa y documental colombiana —NSR-10, análisis de precios unitarios locales, bitácora de obra y licencias ante curaduría—."),
  p("Este trabajo presenta OBRahUB, una plataforma web concebida como sistema operativo de la construcción, cuyo propósito es cubrir el ciclo completo de un proyecto —diseño, costos, programación, ejecución y control— con verificación normativa automatizada y una capa de inteligencia artificial multimodal en español. El documento desarrolla el planteamiento del problema, los objetivos, el marco referencial, la metodología, los resultados obtenidos —incluido el estudio de diseño multiagente que produce el paquete arquitectónico para licencias—, el plan de negocio y las conclusiones."),
);

// 2. PROBLEMA
children.push(h1("Planteamiento del problema"));
children.push(
  p("Las empresas constructoras colombianas pequeñas y medianas gestionan sus obras con hojas de cálculo, mensajería instantánea y carpetas compartidas, lo que produce desviaciones de presupuesto y plazo, pérdida de evidencia para interventoría y sobrecostos administrativos. Adicionalmente, el trámite de licencia de construcción exige un paquete arquitectónico y técnico —plantas, cortes, fachadas, cuadro de áreas, memorias de diseño y soportes normativos— cuyo costo y tiempo de producción recae en profesionales whose disponibilidad es limitada en zonas intermedias del país. La pregunta que guía el trabajo es: ¿cómo pueden la gestión integral de obra y la producción del paquete arquitectónico de licencia automatizarse en una sola plataforma web de bajo costo, con estándares gráficos y normativos colombianos?"),
);

// 3. JUSTIFICACIÓN
children.push(h1("Justificación"));
children.push(
  p("El proyecto se justifica en tres dimensiones. Técnica: integra disciplinas —visualización BIM/CAD en navegador, generación determinística de geometría DXF y razonamiento con modelos lingüísticos grandes— que hoy no existen combinadas en ninguna solución local. Económica: el mercado objetivo (12.000 MIPYME constructoras, 180.000 independientes, instituciones públicas y privadas) carece de alternativas por debajo de cien dólares mensuales por usuario. Social: la automatización del paquete de licencia con verificación normativa reduce barreras de entrada para vivienda de interés social y formaliza procesos en municipios con escasez de profesionales especializados."),
);

// 4. OBJETIVOS
children.push(h1("Objetivos"));
children.push(h2("Objetivo general"));
children.push(
  p("Desarrollar un sistema operativo de construcción web para el mercado colombiano que integre la gestión documental, de costos, de programación y de control de obra con un estudio de diseño arquitectónico multiagente capaz de producir el paquete de planos requerido para licencia de construcción."),
);
children.push(h2("Objetivos específicos"));
children.push(
  bullets([
    "Diseñar e implementar visores nativos en navegador para modelos IFC y planos DXF con interacción táctil.",
    "Construir un motor determinístico de dibujo arquitectónico (DXF R12 por capas) con las convenciones gráficas canónicas de la literatura (Ching, 2020; Neufert & Neufert, 2002).",
    "Implementar un pipeline multiagente —sitio, arquitecto, constructor, ingeniero civil, eléctrico, hidrosanitario, interiores— orquestado sobre un formato intermedio JSON con sanitización y puertas de verificación.",
    "Incorporar verificación normativa automatizada (NSR-10, NTC 4595, RETIE, RAS) como compuertas de calidad del diseño.",
    "Elaborar el estudio de mercado con cuatro segmentos y el modelo de negocio de la plataforma.",
  ]),
);

// 5. MARCO REFERENCIAL
children.push(h1("Marco referencial"));
children.push(h2("Marco teórico"));
children.push(
  p("El trabajo se apoya en tres cuerpos de conocimiento. La gestión de proyectos de construcción y sus cuerpos de control (curva S, índices SPI/CPI, bitácora de obra); la modelación de información de la construcción (BIM) bajo estándares abiertos —IFC (ISO 16739) y DXF— que garantizan interoperabilidad sin dependencia propietaria; y la arquitectura de agentes de IA con modelos lingüísticos grandes, en particular el patrón de orquestación en el que el modelo produce estructuras de datos estrictas y un motor determinístico ejecuta los efectos (enfoque adoptado: la IA piensa, los motores dibujan)."),
);
children.push(h2("Marco conceptual y gráfico"));
children.push(
  p("Para la producción del paquete arquitectónico se adoptaron las convenciones gráficas de la literatura canónica: jerarquía de líneas y poché de muros cortados (Ching, 2020), dimensionamiento antropométrico y funcional (Neufert & Neufert, 2002; Panero & Zelnik, 1979), y los estándares habitacionales de referencia latinoamericana (Plazola, 1994)."),
);
children.push(h2("Marco normativo"));
children.push(
  bullets([
    "Reglamento Colombiano de Construcción Sismo Resistente NSR-10 (Asociación Colombiana de Ingeniería Sísmica [AIS], 2010), en particular los títulos A.1 (cargas), A.6 (accesibilidad) y los capítulos E por material.",
    "Norma Técnica Colombiana NTC 4595 sobre planeación y diseño de instalaciones sanitarias y complementarias en edificaciones (ICONTEC, 2013).",
    "Reglamento Técnico de Instalaciones Eléctricas RETIE (Ministerio de Minas y Energía, 2021) y Reglamento Técnico del Sector de Agua Potable RAS (Ministerio de Vivienda, Ciudad y Territorio, 2021).",
    "Marco de licencias: Ley 388 de 1997 y Decreto 1077 de 2015 (Congreso de la República de Colombia, 1997; Presidencia de la República de Colombia, 2015).",
  ]),
);
children.push(h2("Estado del arte"));
children.push(
  p("Los líderes internacionales (Procore, Autodesk Construction Cloud, Buildertrend) operan entre 100 y 410 dólares por usuario al mes, en inglés y sin dimensión normativa colombiana; las alternativas locales resuelven funciones puntuales sin integrar el circuito diseño-costo-programa-control-licencia (Universidad EAFIT & Inexmoda, 2023). El diferencial de OBRahUB es triple: barrera normativa local difícil de replicar por actores extranjeros, precios APU vivos y costo operativo serverless diez veces menor que una arquitectura tradicional."),
);

// 6. METODOLOGÍA
children.push(h1("Metodología"));
children.push(
  p("El desarrollo se ejecutó con metodología ágil iterativa e incremental, con verificación continua en producción (integración y despliegue continuos sobre Vercel) y pruebas de extremo a extremo automatizadas por navegador. La arquitectura sigue el principio de separación entre razonamiento y ejecución: los agentes de IA emiten exclusivamente un esquema JSON intermedio de planta arquitectónica, que es sanitizado (validación, recortes y redondeo determinístico) y luego dibujado por motores en TypeScript puro hacia SVG, DXF y expediente documental. Cada etapa del pipeline multiagente cruza puertas de verificación determinísticas con referencias normativas antes de habilitar la siguiente. La investigación de mercados combinó fuentes secundarias (Supersociedades, Camacol, prensa económica) y análisis competitivo directo."),
);

// 7. RESULTADOS
children.push(h1("Resultados"));
children.push(h2("Plataforma implementada"));
children.push(
  bullets([
    "Seis herramientas integradas: Documentos (con visores IFC 3D y DXF), Diseño IA, Costos y Presupuestos APU, Seguimiento de obra (Gantt con vinculación 4D a elementos BIM), Bitácora diaria y Control de obra (curva S, SPI/CPI, informes).",
    "Visor IFC con selección táctil, extracción de cantidades y simulación 4D de construcción por elementos vinculados a tareas.",
    "Router multi proveedor de modelos lingüísticos con failover en vivo y consola de agentes observable por el usuario.",
  ]),
);
children.push(h2("Estudio de diseño multiagente"));
children.push(
  p("El aporte central es el pipeline de siete personas sintéticas: urbanista (ficha de sitio con POT, clima, vientos y materiales locales), arquitecto (planta JSON con memoria de diseño justificada), constructor e ingeniero civil en paralelo (materiales/métodos y sistema estructural con retícula NSR-10), adaptación del arquitecto a los memos técnicos, experto eléctrico (RETIE) e hidrosanitario (RAS) en paralelo, y acabados. El profesional humano dirige el proceso mediante un bucle de revisión con registro de cambios. La salida es la lámina completa de curaduría —planta(s), cortes A-A' y B-B', cuatro fachadas con parapeto y doble marco en ventanas, cuadro de áreas, flecha de norte, escala gráfica y cajetín— exportada como DXF R12 por capas semánticas, más el expediente documental con memoria de diseño, memorias técnicas y checklist de radicación."),
);
children.push(h2("Estudio de mercado y modelo de negocio"));
children.push(
  p("Se priorizaron cuatro segmentos: constructoras (top-10 nacional facturó 16,6 billones de pesos en 2025; MIPYME como cliente ideal inicial), instituciones gubernamentales (MinTIC, MinVivienda, ANI, INVÍAS, Findeter, MinEducación, alcaldías, curadurías), instituciones privadas (universidades en expansión como Universidad de los Andes, Javeriana y EAFIT, clínicas y corporativo) e independientes multi-proyecto. El modelo combina SaaS por obra activa para constructoras, contratos anuales vía SECOP para el sector público, licencias por proyecto y académicas para instituciones, y freemium a suscripción mensual para independientes; la hoja de ruta de 24 meses prioriza la base freemium, luego MIPYME e instituciones privadas y finalmente licitación estatal."),
);

// 8. CRONOGRAMA (resumen)
children.push(h1("Cronograma"));
children.push(
  p("Fase 1 (completada): plataforma núcleo, visores BIM/CAD, costos, Gantt, bitácora y control. Fase 2 (completada): estudio de diseño multiagente, motor DXF con lámina de licencia y expediente. Fase 3 (en curso): modelo BIM/IFC generado desde el mismo formato intermedio, pasaporte de materiales para sostenibilidad y canal estatal. El detalle mensualizado se recoge en el documento operativo de cronograma."),
);

// 9. CONCLUSIONES
children.push(h1("Conclusiones y recomendaciones"));
children.push(
  p("Se demostró que el circuito diseño-costo-programa-control-licencia puede unificarse en una plataforma serverless de bajo costo con verificación normativa colombiana automatizada. El enfoque «la IA piensa, los motores dibujan» eliminó la alucinación geométrica: toda la geometría DXF es determinística y reproducible byte a byte. El bucle de revisión con el profesional conserva la responsabilidad intelectual del diseño en manos humanas, papel crítico para la firma y matrícula profesional exigibles en el trámite de licencia. Se recomienda como línea futura la generación del modelo IFC tridimensional desde el mismo formato intermedio, la integración del pasaporte de materiales para economía circular y la validación del expediente con curadurías aliadas mediante pilotos controlados."),
);

// 10. REFERENCIAS
children.push(h1("Referencias"));
children.push(
  ref("Asociación Colombiana de Ingeniería Sísmica. (2010). Reglamento colombiano de construcción sismo resistente NSR-10. AIS."),
  ref("Ching, F. D. K. (2020). Building construction illustrated (6.ª ed.). Wiley."),
  ref("Congreso de la República de Colombia. (1997). Ley 388 de 1997, por la cual se dictan normas en materia de desarrollo territorial. Diario Oficial."),
  ref("ICONTEC. (2013). Norma Técnica Colombiana 4595: Planeación y diseño de instalaciones sanitarias y complementarias en edificaciones. Instituto Colombiano de Normas Técnicas y Certificación."),
  ref("Ministerio de Minas y Energía. (2021). Reglamento Técnico de Instalaciones Eléctricas (RETIE). Gobierno de Colombia."),
  ref("Ministerio de Vivienda, Ciudad y Territorio. (2021). Resolución 25476: Reglamento Técnico del Sector de Agua Potable y Saneamiento Básico (RAS). Gobierno de Colombia."),
  ref("Neufert, E., & Neufert, P. (2002). Arte de proyectar en arquitectura (14.ª ed.). Gustavo Gili."),
  ref("Panero, J., & Zelnik, M. (1979). Human dimension and interior space. Whitney Library of Design."),
  ref("Plazola, A. (1994). Arquitectura habitacional (Vols. 1-2). Limusa."),
  ref("Portafolio. (2026). Constructoras sumaron $91,78 billones en ingresos en 2025: el ranking de las 10 empresas que lideran el sector. https://www.portafolio.co/economia/infraestructura/constructoras-sumaron-91-78-billones-en-ingresos-en-2025-el-ranking-de-las-10-empresas-que-lideran-el-sector-497216"),
  ref("Presidencia de la República de Colombia. (2015). Decreto 1077 de 2015, Decreto Único Reglamentario del Sector Vivienda, Ciudad y Territorio."),
  ref("Universidad de los Andes. (2020). Architectural graphics / Manual de dibujo arquitectónico [obra de F. D. K. Ching]. Wiley."),
  ref("Valora Analitik. (2026). Estas son las constructoras de vivienda más grandes de Colombia. https://www.valoraanalitik.com/estas-son-las-constructoras-de-vivienda-mas-grandes-de-colombi/"),
);

// ── documento ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Diego Orlando Pineda Escobar",
  title: "OBRahUB — Documento de grado (APA 7)",
  description: "Trabajo de grado UNICOLMAYOR en normas APA 7ª edición",
  styles: {
    default: {
      document: { run: { font: FONT, size: SZ } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: SZ, bold: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: SZ, bold: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: SZ, bold: true, italics: true } },
    ],
  },
  numbering: { config: [] },
  features: { updateFields: true },
  sections: [
    {
      properties: {
        page: {
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ })],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log("✅ Documento APA 7 generado:", OUT, `(${(buf.length / 1024).toFixed(0)} KB)`);
