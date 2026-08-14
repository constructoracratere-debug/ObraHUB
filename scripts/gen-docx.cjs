// Genera los .docx de Admon 3: Informe Investigación 1 + Escrito Personal
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber,
} = require("docx");
const fs = require("fs");
const path = require("path");

const OUT = "C:/ObraHub/docs/admon3";

const AZUL = "1E3A8A";
const GRIS = "666666";

// ---------- helpers ----------
const p = (text, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text, ...(opts.run || {}) })],
    spacing: { after: opts.after ?? 160, line: 300 },
    alignment: opts.align,
    heading: opts.heading,
    ...(opts.para || {}),
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 340, after: 200 },
    children: [new TextRun({ text, bold: true, size: 30, color: AZUL })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 160 },
    children: [new TextRun({ text, bold: true, size: 25, color: AZUL })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22, color: "0F172A" })],
  });

const bullet = (text, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text, ...(opts.run || {}) })],
    bullet: { level: opts.level ?? 0 },
    spacing: { after: 100, line: 290 },
  });

function cell(text, opts = {}) {
  const width =
    opts.width != null
      ? { size: parseFloat(opts.width) || opts.width, type: WidthType.PERCENTAGE }
      : undefined;
  return new TableCell({
    width,
    shading: opts.header ? { fill: AZUL } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({
          text: String(text),
          bold: opts.header || opts.bold || false,
          size: opts.size || 19,
          color: opts.header ? "FFFFFF" : (opts.color || "0F172A"),
        })],
        alignment: opts.center ? AlignmentType.CENTER : undefined,
      }),
    ],
  });
}

function table(header, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((t, i) => cell(t, { header: true, width: widths?.[i] })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { width: widths?.[i] })) })),
    ],
  });
}

const footerStd = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "ObraHub · Administración de la Edificación III · Grupo IX B — página ", size: 16, color: GRIS }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS }),
      ],
    }),
  ],
});

function portada(lines) {
  return lines.map(([text, size, bold, color, spacing]) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: spacing, before: spacing ? spacing / 2 : undefined },
      children: [new TextRun({ text, size, bold: !!bold, color: color || "000000" })],
    })
  );
}

// ============================================================================
// DOC 1 — INFORME DE INVESTIGACIÓN 1
// ============================================================================
function buildInforme() {
  const children = [
    ...portada([
      ["UNIVERSIDAD COLEGIO MAYOR DE CUNDINAMARCA", 26, true],
      ["FACULTAD DE INGENIERÍA Y ARQUITECTURA", 22, true],
      ["ADMINISTRACIÓN DE LA EDIFICACIÓN III", 22, true],
      ["", 12, false],
      ["INFORME DE INVESTIGACIÓN DE MERCADO", 30, true, AZUL],
      ["SECTOR ECONÓMICO — INDUSTRIA DE LA CONSTRUCCIÓN", 26, true, AZUL],
      ["", 12, false],
      ["Proyecto: OBRAHUB — Sistema Operativo de la Construcción con integración BIM", 21, false, GRIS],
      ["", 12, false],
      ["INTEGRANTE:", 20, true],
      ["Diego Orlando Pineda Escobar", 21, false],
      ["GRUPO: IX B", 20, true],
      ["DOCENTE: Carlos Alberto Corrales Medina", 20, false],
      ["Bogotá D.C., 18 de agosto de 2026", 20, false],
    ]),
    new Paragraph({ pageBreakBefore: true, children: [] }),
    h1("CONTENIDO"),
    p("1. Presentación de la investigación"),
    p("2. Diseño de la investigación"),
    p("3. Análisis del sector de la construcción en Colombia"),
    p("4. Conclusiones"),
    p("Referencias"),

    // ============ 1. PRESENTACIÓN ============
    h1("1. PRESENTACIÓN DE LA INVESTIGACIÓN"),
    h2("1.1 Objetivo de la investigación"),
    p("Analizar el sector de la construcción en Colombia con base en aspectos macroeconómicos, de mercado y de representación política del sector, con el fin de identificar las condiciones favorables y desfavorables que enfrenta el proyecto ObraHub en su entrada al mercado."),

    h2("1.2 Segmento"),
    p("Constructoras pequeñas y medianas (pymes), arquitectos y constructores independientes, e interventores de obra en Colombia que requieren gestionar de forma integrada los costos (APU), la programación de obra (cronogramas) y el cumplimiento normativo (NSR-10, RETIE, RETILAP), con capacidad de incorporar metodología BIM sin depender de software costoso como Revit, Navisworks o Procore."),

    h2("1.3 Presentación del producto o servicio"),
    p("ObraHub es una plataforma web (SaaS) que funciona como “Sistema Operativo de la Construcción” para el mercado colombiano. Integra cuatro herramientas en un solo entorno:"),
    bullet("Documentos — Gestión documental del proyecto (planos DWG/DXF, modelos BIM IFC, contratos, PDF, Excel) con visualización nativa en el navegador."),
    bullet("Consultor Normativo — Consulta inteligente de normativa colombiana (NSR-10, RETIE, RETILAP, RAS, Ley de Guadua 2206/2022) mediante inteligencia artificial con búsqueda semántica y respuestas citadas."),
    bullet("Costos y Presupuestos — Generación de análisis de precios unitarios (APU) con IA, basada en la base de precios de ObraHub y los estándares colombianos (AIU 22%, IVA 19%), con exportación a Excel."),
    bullet("Seguimiento de Obra — Cronograma Gantt interactivo con generación por IA, edición por lenguaje natural, bitácora diaria de obra y vínculo BIM 4D entre elementos del modelo y tareas del cronograma."),
    p("Su diferenciador central es la integración BIM nativa: ObraHub procesa archivos IFC directamente en el navegador, extrae cantidades automáticamente para alimentar los presupuestos (BIM 5D) y vincula elementos del modelo al cronograma (BIM 4D), democratizando el acceso a la metodología BIM para constructoras que no pueden costear las suites tradicionales.", { after: 200 }),

    h2("1.4 Tipo de investigación"),
    p("Investigación de mercados de tipo descriptivo — documental, basada en la revisión y análisis de fuentes secundarias oficiales (DANE, MinVivienda, DNP, Camacol, Banco de la República) y especializadas del sector construcción, orientada a evaluar el entorno macroeconómico, las tendencias y las necesidades del sector para la toma de decisiones del proyecto de grado."),

    // ============ 2. DISEÑO ============
    h1("2. DISEÑO DE LA INVESTIGACIÓN"),
    table(
      ["Objetivo", "#", "Descripción fuente", "Recursos", "Responsable", "Cronograma"],
      [
        ["Analizar el sector económico de la construcción con base en el PIB", "1", "DANE — Cuentas Nacionales Trimestrales e IEAC: PIB de edificaciones y obras civiles", "Sitio web dane.gov.co", "Diego Pineda", "Semana 3 y 4"],
        ["", "2", "ANIF — Informe semanal del sector constructor; blog Bancolombia", "anif.com.co, blog.bancolombia.com", "Diego Pineda", "Semana 4 y 5"],
        ["Analizar el sector con base en la generación de empleo", "3", "DANE — GEIH, sección empleo construcción; Camacol — ocupación sector constructor", "dane.gov.co, camacol.co", "Diego Pineda", "Semana 4 y 5"],
        ["Analizar el sector con base en el plan de desarrollo del gobierno", "4", "DNP — PND 2022-2026; MinVivienda — déficit habitacional y programas de vivienda", "dnp.gov.co, minvivienda.gov.co", "Diego Pineda", "Semana 5 y 6"],
        ["Analizar el sector con base en tendencias de consumo", "5", "Portafolio — tendencias constructivas; Estrategia Nacional BIM 2020-2026", "portafolio.co, upit.gov.co/BIM", "Diego Pineda", "Semana 5 y 6"],
        ["Analizar el sector con base en las necesidades del sector", "6", "Camacol — “Datos que construyen” No. 31: Déficit habitacional 2022-2025", "camacol.co", "Diego Pineda", "Semana 6 y 7"],
        ["Análisis del sector con base en las innovaciones", "7", "Documentación técnica de nuevos materiales y digitalización (BIM, IA)", "Videos técnicos y bibliografía de clase", "Diego Pineda", "Semana 6 y 7"],
        ["Análisis del sector con base en gremios o asociaciones", "8", "Camacol, CCI, SCI, SCA, ACFA, CCCS, Cámara de Comercio de Bogotá", "Sitios web oficiales de los gremios", "Diego Pineda", "Semana 7 y 8"],
      ],
      ["24%", "4%", "30%", "16%", "12%", "14%"]
    ),

    // ============ 3. ANÁLISIS ============
    new Paragraph({ pageBreakBefore: true, children: [] }),
    h1("3. ANÁLISIS DEL SECTOR DE LA CONSTRUCCIÓN EN COLOMBIA"),
    p("La construcción y su estrecha relación con el sector industrial: la edificación es el sector que combina materiales y servicios para la producción de bienes tangibles como la construcción de vivienda, las plataformas comerciales y las industrias de gran impacto para la infraestructura nacional y el desarrollo económico. Según la clasificación de Camacol, el sector se compone de cinco actores: (1) constructores y promotores inmobiliarios, (2) contratistas y consultores (interventoría y obra civil), (3) industriales (manufactura de insumos), (4) comerciantes (comercialización de insumos) y (5) entidades financieras y fiduciarias vinculadas a grandes proyectos. ObraHub se dirige principalmente a los dos primeros grupos.", { after: 240 }),

    h2("3.1 PIB"),
    p("El Producto Interno Bruto representa el resultado final de la actividad productiva de las unidades de producción residentes (DANE). La construcción ha participado históricamente con cerca del 6% al 7% del PIB nacional, siendo uno de los sectores de mayor arrastre sobre la industria de materiales y el empleo."),
    bullet("2023: año de desaceleración; el sector cerró con caída tras el auge pospandemia y el ciclo de altas tasas de interés que enfrió la demanda de vivienda."),
    bullet("2024: recuperación parcial. La economía nacional creció 1,7% y la construcción volvió a terreno positivo en el primer trimestre (+0,7%). En el tercer trimestre de 2024 el PIB del sector creció 4,1% interanual, impulsado por obras civiles (+16,5%) gracias a la infraestructura pública; sin embargo, edificaciones (vivienda y comercio) acumuló una contracción de -2,4% en el año."),
    bullet("2025: el peor registro desde 2020. El PIB de edificaciones cayó -7,5%, afectado por el desmonte del programa Mi Casa Ya, el alto costo del crédito y el freno de las licencias; la producción de obras civiles también retrocedió (-17,9% en el primer trimestre)."),
    bullet("2026 (primer trimestre): señales de recuperación. La construcción creció 5,4% interanual (obras civiles +0,6%; actividades especializadas -5,6%) y el PIB nacional aumentó 2,2%, lo que indica el inicio de un nuevo ciclo positivo."),
    p("Lectura para ObraHub: el sector atraviesa el fondo del ciclo con inicio de recuperación en 2026; históricamente, las fases de reactivación traen mayor actividad licitatoria y de obra, momento en el que las empresas buscan herramientas de eficiencia para competir con márgenes ajustados.", { run: { italics: true, color: GRIS } }),

    h2("3.2 Generación de empleo"),
    p("Para diciembre de 2023, el sector construcción ocupó 1.684.199 personas, con un aumento de 8,8% frente a diciembre de 2022 (DANE). Esta cifra confirma al sector como uno de los mayores generadores de empleo directo del país."),
    bullet("Según cifras del DANE citadas por Camacol, el sector constructor mantiene ocupadas alrededor de 1,47 a 1,5 millones de personas, equivalentes a cerca del 6,9% del total de ocupados del país."),
    bullet("En 2025 el empleo del sector cayó como consecuencia de la contracción de la edificación, con especial impacto en ciudades intermedias, mientras la obra civil pública amortiguó la pérdida de puestos."),
    bullet("La medición mensual de puestos de obra del DANE (IEAC) registró alrededor de 449.000 puestos en octubre de 2024 solo en las constructoras cubiertas por el indicador."),
    bullet("Cada punto porcentual de caída del sector construcción se traduce en miles de empleos perdidos, dada su intensidad en mano de obra (Camacol)."),
    p("Lectura para ObraHub: una base de ~1,5 millones de trabajadores y decenas de miles de empresas constructoras constituye un mercado amplio; la presión por productividad en años de contracción acelera la adopción de herramientas digitales que reduzcan costos de administración de obra.", { run: { italics: true, color: GRIS } }),

    h2("3.3 Plan de desarrollo"),
    p("El Plan Nacional de Desarrollo 2022-2026 “Colombia Potencia Mundial de la Vida” define el marco de política pública del sector:"),
    bullet("Déficit habitacional: pasó del 30,4% de los hogares en 2022 al 25,6% en 2025, cumpliendo la meta del PND de ubicarse por debajo del 26% (MinVivienda). No obstante, Camacol estima un déficit cercano a 2,07 millones de hogares, que requeriría construir aproximadamente 465.000 viviendas adicionales."),
    bullet("Programa Mi Casa Ya: en diciembre de 2024 el Gobierno suspendió las postulaciones y nuevas asignaciones de subsidios para 2025, generando controversia gremial; el programa fue reemplazado por el esquema “Casa Milagro”. Camacol propuso en octubre de 2025 cinco medidas de reactivación, incluida la recuperación de un “Mi Casa Ya 2.0”."),
    bullet("Vivienda de interés social y mejoramiento: el PND prioriza la VIS gratuita para hogares en pobreza extrema y el mejoramiento de vivienda para cerca de 400.000 hogares (hasta 22 SMMLV de apoyo), lo que sostiene demanda de obra de construcción y remodelación."),
    bullet("Infraestructura y obra civil: los proyectos de transporte y las concesiones 4G/5G impulsadas por la ANI sostuvieron la actividad de obras civiles, pilar del crecimiento del sector en 2024."),
    bullet("Estrategia Nacional BIM (2020-2026): política pública clave para ObraHub. Establece la adopción gradual de la metodología BIM en proyectos públicos: 85-100% de los proyectos públicos de construcción con BIM en 2025 e implementación a nivel nacional en 2026, coordinada por entidades como el Ministerio de Transporte y la UPIT."),
    p("Lectura para ObraHub: la culminación de la Estrategia Nacional BIM en 2026 crea una obligación práctica de modelado y gestión de datos en todo el ecosistema constructor — incluidas las pymes que licitan o subcontratan con el sector público —, justo el segmento al que ObraHub le da acceso a BIM sin costosas licencias.", { run: { italics: true, color: GRIS } }),

    h2("3.4 Tendencias de mercado"),
    bullet("Uso de drones para inspección de áreas extensas o de difícil acceso, optimizando tiempo y personal, con captura de datos tratados por aplicaciones."),
    bullet("Impresión 3D de componentes y edificaciones completas (proyecto Contour Crafting), que podría transformar los sistemas constructivos tradicionales."),
    bullet("Construcciones verdes o sostenibles: edificaciones bioclimáticas que reducen hasta 50% el consumo de energía y 40% el de agua, con mínima generación de escombros (Consejo Colombiano de Construcción Sostenible)."),
    bullet("Diseño orientado a la comodidad y eficiencia, con integración de vegetación y espacios amplios que se adaptan al entorno."),
    bullet("Seguridad y tecnología: domótica y control de la vivienda desde aplicaciones móviles."),
    bullet("Eficiencia energética: aislamiento, ventanas de puente térmico y energías renovables (paneles solares, biogás)."),
    bullet("Construcción en seco (drywall, steel framing): sistemas más rápidos, limpios y ligeros que la construcción tradicional."),
    bullet("Digitalización y BIM: transición del plano 2D al modelo de información 3D/4D/5D, con exigencia creciente en licitaciones públicas."),
    bullet("Inteligencia artificial aplicada a costos, programación y control de obra: la nueva frontera de productividad del sector."),
    p("Lectura para ObraHub: las tendencias 8 y 9 son directamente el terreno de ObraHub; las demás (sostenibilidad, construcción en seco) aumentan la complejidad normativa y de cantidades de obra, lo que refuerza la necesidad de un consultor normativo con IA y presupuestos automáticos.", { run: { italics: true, color: GRIS } }),

    h2("3.5 Necesidades del sector"),
    bullet("Productividad y control de costos: Colombia presenta baja productividad de obra frente a referentes internacionales; los sobrecostos por errores de presupuestación y reprocesos son sistemáticos."),
    bullet("Integración de información: la gestión de un proyecto se fragmenta entre Excel, Project, PDF normativos y modelos BIM desconectados entre sí, con duplicación de datos y pérdida de trazabilidad."),
    bullet("Acceso a la normativa actualizada: la NSR-10, el RETIE, el RETILAP y el RAS son documentos extensos cuya consulta manual es lenta y propensa a incumplimientos."),
    bullet("Democratización del BIM: las pymes constructoras carecen de capital para suites BIM completas, pero la política pública las empuja a adoptar la metodología (Estrategia Nacional BIM 2026)."),
    bullet("Construcción sostenible: gestión ambiental, diseño bioclimático, ecomateriales y análisis de ciclo de vida de materiales como exigencia creciente de clientes y regulación."),
    bullet("Vivienda social masiva: cerrar el déficit de ~2 millones de hogares exige construir más rápido y con mejor control de costos."),
    bullet("Formación y handoff generacional: adopción de herramientas digitales por parte de constructores tradicionales."),
    p("Lectura para ObraHub: las necesidades 1 a 4 son exactamente los problemas que ObraHub resuelve (integración, normativa con IA, BIM accesible y presupuestos automáticos).", { run: { italics: true, color: GRIS } }),

    h2("3.6 Innovaciones del sector"),
    p("En materiales y procesos: fibras de carbono para reforzamiento de estructuras de hormigón; grafeno y nanotubos de carbono aplicados a polímeros y nanotecnología; polímeros autoregenerables que reparan sus propias fisuras; aerogeles aislantes térmicos de ultrabajo peso; nitinol (aleaciones con memoria de forma); superficies hidrofóbicas; ferrofluidos; espumas expansivas de poliuretano; y puentes y viviendas impresos en 3D en concreto."),
    p("En digitalización: BIM 4D/5D (vinculación del modelo con cronograma y costos, ya exigible en contratación pública); inteligencia artificial para generación de presupuestos (APU), detección de interferencias y asistentes normativos; visores web de modelos IFC que eliminan la dependencia de software de escritorio; y plataformas colaborativas en la nube para bitácoras, documentos y seguimiento de obra (la categoría de Procore/PlanGrid, ausente de oferta local)."),
    p("Lectura para ObraHub: ObraHub materializa la innovación digital del sector en el contexto colombiano — visor IFC nativo en navegador, APU generados con IA sobre base de precios local, RAG normativo NSR-10/RETIE y vínculo 4D modelo-cronograma —, sin equivalente local conocido.", { run: { italics: true, color: GRIS } }),

    h2("3.7 Gremios y/o asociaciones del sector"),
    table(
      ["Gremio / Asociación", "Rol en el sector", "Relación con ObraHub"],
      [
        ["Camacol (Cámara Colombiana de la Construcción)", "Principal gremio de constructores; estadísticas (“Datos que construyen”), precios de insumos y propuestas de política pública", "Fuente de precios de referencia y comportamiento del sector; aliado potencial para validar bases de precios y difusión"],
        ["Cámara Colombiana de la Infraestructura", "Gremio de obra civil e infraestructura; licitaciones ANI, APP", "Mercado objetivo en infraestructura con exigencia BIM"],
        ["Sociedad Colombiana de Ingenieros (SCI)", "Colegio y sociedad profesional de ingeniería; normas técnicas y matrícula", "Canal de adopción profesional y validación técnica"],
        ["Sociedad Colombiana de Arquitectos (SCA)", "Sociedad profesional de arquitectura; Premio Nacional, Bienal", "Segmento objetivo: arquitectos independientes que gestionan obra"],
        ["Asociación Colombiana de Facultades de Arquitectura (ACFA)", "Agremia facultades de arquitectura", "Aliado para adopción académica (estudiantes y docentes)"],
        ["Consejo Colombiano de Construcción Sostenible (CCCS)", "Certificación y promoción de construcción sostenible", "Normativa y tendencia verde: consultas normativas en ObraHub"],
        ["Cámara de Comercio de Bogotá", "Registro mercantil y apoyo a empresas", "Registro de la empresa ObraHub S.A.S. y redes de emprendimiento"],
      ],
      ["28%", "38%", "34%"]
    ),

    // ============ 4. CONCLUSIONES ============
    new Paragraph({ pageBreakBefore: true, children: [] }),
    h1("4. CONCLUSIONES"),
    h2("4.1 PIB"),
    p("La construcción (6-7% del PIB) completó en 2025 su peor año desde 2020 (edificaciones -7,5%) e inicia en 2026 una recuperación (+5,4% en el primer trimestre). Se trata de un sector cíclico en el fondo del ciclo, con expectativas de mejora apalancada en obra pública y caída de tasas de interés."),
    h2("4.2 Generación de empleo"),
    p("Con ~1,5 millones de ocupados (6,9% del empleo nacional) y una constelación de miles de empresas constructoras, el sector mantiene una base amplia de usuarios potenciales para herramientas digitales, aun en contracción."),
    h2("4.3 Plan de desarrollo"),
    p("El PND 2022-2026 redujo el déficit habitacional al 25,6% de los hogares, pero persiste un déficit de ~2,07 millones de hogares (≈465.000 viviendas por construir). La suspensión de Mi Casa Ya golpeó la edificación en 2025, y la agenda pública se mueve entre “Casa Milagro” y las propuestas de reactivación de Camacol. El hito decisivo para el proyecto es la Estrategia Nacional BIM que culmina en 2026, que empuja a todo el ecosistema constructor hacia la metodología BIM."),
    h2("4.4 Tendencias de consumo"),
    p("El sector converge hacia la digitalización (BIM, IA, drones, gemelos digitales) y la sostenibilidad (construcción verde, eficiencia energética, construcción en seco). El cliente constructor valora cada vez más la información integrada y oportuna por encima del plano aislado."),
    h2("4.5 Necesidades del sector"),
    p("Las necesidades prioritarias identificadas — productividad y control de costos, integración de la información del proyecto, acceso ágil a la normativa y democratización del BIM — coinciden punto por punto con la propuesta de valor de ObraHub."),
    h2("4.6 Innovaciones del sector"),
    p("La innovación del sector se da en dos frentes: nuevos materiales (grafeno, polímeros autoregenerables, aerogeles) y digitalización (BIM 4D/5D, IA aplicada a costos y programación, visores web IFC). ObraHub pertenece a — y a la vez acelera — el segundo frente en Colombia."),
    h2("4.7 Gremios y/o asociaciones del sector"),
    p("El ecosistema gremial (Camacol, CCI, SCI, SCA, CCCS, cámaras de comercio) ofrece fuentes de datos confiables, canales de validación técnica y rutas de adopción para ObraHub, tanto en el ámbito empresarial como académico."),

    h2("4.8 Conclusión final — aspectos favorables y desfavorables para el proyecto"),
    h3("Aspectos FAVORABLES para ObraHub:"),
    bullet("Viento reglamentario BIM 2026: la Estrategia Nacional BIM exige la metodología en proyectos públicos y arrastra a todo el ecosistema (incluidas pymes y subcontratistas), mientras ObraHub ofrece BIM accesible desde el navegador, sin licencias costosas."),
    bullet("Necesidad comprobada de integración: la fragmentación Excel/Project/PDF/BIM es una dolencia generalizada; ObraHub la resuelve con un solo entorno."),
    bullet("Normativa colombiana embebida: ningún competidor internacional (Procore, PlanGrid, Autodesk Construction Cloud) incluye consultoría IA de NSR-10/RETIE/RETI LAP ni APU con AIU e IVA colombianos."),
    bullet("Mercado amplio: ~1,5 millones de ocupados y miles de firmas constructoras; incluso una fracción pequeña del mercado sostiene un SaaS."),
    bullet("Ciclo económico: la reactivación de 2026 aumenta licitaciones y arranques de obra, momentos de adopción de herramientas de gestión."),
    bullet("Prototipo real en producción: la plataforma funciona y está desplegada (demostrable ante evaluadores y clientes)."),
    h3("Aspectos DESFAVORABLES para ObraHub:"),
    bullet("Contracción del sector (2024-2025): menos obra activa implica presupuestos ajustados y menor disposición de pago por software en el corto plazo."),
    bullet("Cultura de adopción tecnológica lenta en constructoras tradicionales y resistencia al cambio en el personal de obra."),
    bullet("Competencia de gigantes internacionales (Autodesk, Procore, Trimble) con grandes presupuestos comerciales, que podrían sumar localización al español."),
    bullet("Dependencia de terceros para la IA (costos de API) y necesidad de conectividad en obra, aún desigual en zonas del país."),
    p("Balance: los factores favorables — en especial el mandato BIM 2026 y la ausencia de oferta local integrada con normativa colombiana — superan a los desfavorables, siempre que ObraHub compita por el segmento pyme/independiente (desatendido por los grandes) y adopte un modelo freemium de bajo costo de entrada. Por lo anterior, el entorno del sector construcción colombiano es favorable para el desarrollo del proyecto.", { run: { bold: true } }),

    h1("REFERENCIAS"),
    p("DANE — Cuentas Nacionales Trimestrales y PIB por actividad económica. https://www.dane.gov.co/index.php/estadisticas-por-tema/cuentas-nacionales/cuentas-nacionales-trimestrales", { run: { size: 20 } }),
    p("DANE — Indicadores Económicos Alrededor de la Construcción (IEAC). https://www.dane.gov.co/index.php/estadisticas-por-tema/construccion/indicadores-economicos-alrededor-de-la-construccion", { run: { size: 20 } }),
    p("DANE — Gran Encuesta Integrada de Hogares (GEIH), empleo por ramas de actividad.", { run: { size: 20 } }),
    p("DNP — Plan Nacional de Desarrollo 2022-2026 “Colombia Potencia Mundial de la Vida”. https://www.dnp.gov.co/plan-nacional-desarrollo/pnd-2022-2026", { run: { size: 20 } }),
    p("MinVivienda — Déficit habitacional y programas de vivienda. https://www.minvivienda.gov.co", { run: { size: 20 } }),
    p("Camacol — “Datos que construyen No. 31: Déficit habitacional 2022-2025” y propuestas de reactivación (octubre 2025). https://camacol.co", { run: { size: 20 } }),
    p("ANIF — Informe semanal del sector constructor. https://www.anif.com.co", { run: { size: 20 } }),
    p("Bancolombia — “PIB construcción Colombia” y “Perspectivas sector construcción”. https://blog.bancolombia.com", { run: { size: 20 } }),
    p("Portafolio — “Construcción en Colombia cae 7,5% en 2025 y marca su peor registro desde 2020”. https://www.portafolio.co", { run: { size: 20 } }),
    p("UPIT — Estrategia Nacional BIM Colombia 2020-2026. https://upit.gov.co/bim/", { run: { size: 20 } }),
    p("Corrales, C. A. — Presentación de clase, Administración de la Edificación III, Universidad Colegio Mayor de Cundinamarca (2026-2).", { run: { size: 20 } }),
    p("Kotler, P. — Dirección de Mercadotecnia, Capítulo 1. (Lectura de curso.)", { run: { size: 20 } }),
  ];

  const doc = new Document({
    creator: "Diego Orlando Pineda Escobar",
    title: "Informe de Investigación de Mercado — Sector Construcción",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: {}, footers: { default: footerStd }, children }],
  });

  Packer.toBuffer(doc).then((buf) => {
    const file = path.join(OUT, "1-informe-investigacion-1-sector-economico.docx");
    fs.writeFileSync(file, buf);
    console.log("OK:", file);
  });
}

// ============================================================================
// DOC 2 — ESCRITO PERSONAL
// ============================================================================
function buildEscrito() {
  const children = [
    ...portada([
      ["UNIVERSIDAD COLEGIO MAYOR DE CUNDINAMARCA", 26, true],
      ["FACULTAD DE INGENIERÍA Y ARQUITECTURA", 22, true],
      ["ADMINISTRACIÓN DE LA EDIFICACIÓN III", 22, true],
      ["", 12, false],
      ["ESCRITO PERSONAL", 30, true, AZUL],
      ["", 12, false],
      ["Diego Orlando Pineda Escobar · Grupo IX B", 21, false],
      ["Docente: Carlos Alberto Corrales Medina", 20, false, GRIS],
      ["Bogotá D.C., agosto de 2026", 20, false, GRIS],
    ]),
    new Paragraph({ pageBreakBefore: true, children: [] }),
    h1("¿Por qué construir el sistema operativo de la construcción colombiana?"),
    h2("Introducción"),
    p("Desde que comencé mi formación como Constructor y Gestor en Arquitectura me llamó la atención una paradoja del sector: construimos los edificios más complejos del país y, sin embargo, administramos esos proyectos con las herramientas más frágiles que existen — hojas de cálculo que se rompen, cronogramas que nadie actualiza y normas de más de mil páginas que se consultan como quien busca una aguja en un pajar. La pregunta que orienta este escrito es concreta: ¿por qué un estudiante de construcción, y no una gran tecnológica, debería construir la plataforma que integre los costos, el cronograma y la normativa de la obra colombiana? Mi respuesta tiene tres partes: porque el problema lo vivo en primera persona, porque el momento del sector lo exige y porque ya construí el prototipo que lo demuestra."),
    h2("Nudo o cuerpo"),
    p("El problema lo vivo en primera persona. En las prácticas y trabajos de curso, elaborar un presupuesto de análisis de precios unitarios (APU) exigía transcribir cantidades desde planos a Excel, buscar rendimientos en tablas desactualizadas y verificar artículo por artículo la Norma Sismo Resistente. Cada etapa repetía información de la anterior y cada repetición era una oportunidad de error: un área mal copiada, un AIU mal aplicado, un requisito del RETIE que se pasa por alto. Esta fragmentación — planos por un lado, presupuesto por otro, cronograma por otro y normativa por otro — no es una molestia menor: es una de las causas estructurales de los sobrecostos y los incumplimientos del sector, y la viven por igual el constructor grande y el maestro de obra que apenas digitaliza su primer presupuesto."),
    p("El momento del sector lo exige. La Estrategia Nacional BIM culmina en 2026 y empuja a todo el ecosistema constructor — incluidas las pymes que nunca pudieron pagar una suite BIM — hacia la metodología de información. Al mismo tiempo, la inteligencia artificial dejó de ser promesa: ya redacta, calcula y consulta. Las plataformas internacionales como Procore o Autodesk Construction Cloud son potentes, pero hablan otro idioma: no conocen el AIU colombiano, no responden por la NSR-10 ni traen la Ley de Guadua en su corpus. Esa distancia entre lo que el sector necesita y lo que el mercado ofrece es, para mí, la oportunidad."),
    p("Ya construí el prototipo que lo demuestra. No vengo a proponer una idea: vengo a reportar un avance. ObraHub — así se llama la plataforma — funciona hoy en producción en la web. Cuatro herramientas comparten un mismo proyecto: un gestor documental que visualiza planos DWG/DXF y modelos BIM (IFC) directamente en el navegador; un consultor normativo con inteligencia artificial que responde sobre la NSR-10, el RETIE, el RETILAP y el RAS citando el texto oficial; un generador de presupuestos APU con IA que aplica los estándares colombianos y exporta a Excel; y un cronograma Gantt que se edita por lenguaje natural, lleva bitácora diaria de obra y se vincula con los elementos del modelo BIM (lo que la industria llama BIM 4D). Desarrollarlo me exigió aprender de programación lo que nadie me enseñó en clase, y me confirmó algo más importante: que la formación del constructor y gestor — la mía — es exactamente la formación necesaria para diseñar estas herramientas, porque el problema no es tecnológico, es de gestión de la edificación."),
    h2("Conclusión"),
    p("¿Por qué un estudiante de construcción debería construir el sistema operativo de la construcción colombiana? Porque conoce la dolencia desde adentro, porque el mandato BIM de 2026 y la madurez de la inteligencia artificial abren una ventana que no existía, y porque ya tiene un prototipo funcionando que convierte la tesis en evidencia. ObraHub no aspira a reemplazar al constructor: aspira a devolverle el tiempo que hoy pierde copiando datos entre herramientas, para que lo invierta donde su criterio es insustituible — en construir mejor. Esa es la iniciativa que presento a este curso, la que califico con la matriz de criterios y la que quiero convertir, con el plan de empresa de esta asignatura, en una compañía real: ObraHub S.A.S., toda la obra en un solo lugar."),
  ];

  const doc = new Document({
    creator: "Diego Orlando Pineda Escobar",
    title: "Escrito Personal — ObraHub",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: {}, footers: { default: footerStd }, children }],
  });

  Packer.toBuffer(doc).then((buf) => {
    const file = path.join(OUT, "5-escrito-personal.docx");
    fs.writeFileSync(file, buf);
    console.log("OK:", file);
  });
}

buildInforme();
buildEscrito();
