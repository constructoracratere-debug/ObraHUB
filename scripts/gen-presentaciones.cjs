// Genera las 2 presentaciones .pptx de Admon 3 (Investigación 1 + Creación de Empresa)
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = "C:/ObraHub/docs/admon3";

// Paleta ObraHub
const C = {
  bg: "050B14",
  panel: "0A1120",
  blue: "3B82F6",
  darkblue: "1E3A8A",
  green: "10B981",
  amber: "F59E0B",
  purple: "8B5CF6",
  red: "EF4444",
  text: "E2E8F0",
  muted: "94A3B8",
  white: "FFFFFF",
};

function basePpt(title) {
  const pptx = new pptxgen();
  pptx.author = "Diego Orlando Pineda Escobar";
  pptx.company = "ObraHub";
  pptx.title = title;
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  return pptx;
}

function addBg(slide) {
  slide.background = { color: C.bg };
}

function titleSlide(pptx, kicker, title, subtitle, footer) {
  const s = pptx.addSlide();
  addBg(s);
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: C.bg } });
  // barra superior de acento
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.blue } });
  s.addText(kicker, {
    x: 0.8, y: 1.7, w: 11.7, h: 0.5,
    fontSize: 16, color: C.blue, bold: true, charSpacing: 3, fontFace: "Calibri",
  });
  s.addText(title, {
    x: 0.8, y: 2.3, w: 11.7, h: 1.8,
    fontSize: 40, color: C.white, bold: true, fontFace: "Calibri",
  });
  s.addText(subtitle, {
    x: 0.8, y: 4.3, w: 11.7, h: 1.2,
    fontSize: 18, color: C.muted, fontFace: "Calibri",
  });
  s.addText(footer, {
    x: 0.8, y: 6.5, w: 11.7, h: 0.5,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
  });
  return s;
}

function contentSlide(pptx, num, title, blocks) {
  const s = pptx.addSlide();
  addBg(s);
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.blue } });
  // número y título
  s.addText(`${num}`, {
    x: 0.7, y: 0.35, w: 1.0, h: 0.9,
    fontSize: 40, color: C.darkblue, bold: true, fontFace: "Calibri",
  });
  s.addText(title, {
    x: 1.6, y: 0.42, w: 11.0, h: 0.85,
    fontSize: 28, color: C.white, bold: true, fontFace: "Calibri",
  });
  // contenido
  let y = 1.55;
  for (const b of blocks) {
    if (b.type === "bullets") {
      s.addText(
        b.items.map((t) => ({
          text: typeof t === "string" ? t : t.text,
          options: {
            bullet: true,
            color: (typeof t === "object" && t.color) || C.text,
            bold: (typeof t === "object" && t.bold) || false,
            fontSize: (typeof t === "object" && t.size) || b.size || 16,
          },
        })),
        { x: 0.9, y, w: 11.6, h: b.h || 3.8, fontFace: "Calibri", lineSpacingMultiple: 1.15, valign: "top" }
      );
      y += b.h || 3.8;
    } else if (b.type === "callout") {
      s.addShape("roundRect", {
        x: 0.9, y, w: 11.6, h: b.h || 1.0,
        fill: { color: b.bg || "0F1B33" }, line: { color: b.border || C.blue, width: 1 },
        rectRadius: 0.08,
      });
      s.addText(b.text, {
        x: 1.15, y: y + 0.12, w: 11.1, h: (b.h || 1.0) - 0.24,
        fontSize: b.size || 15, color: b.color || C.text, fontFace: "Calibri", valign: "middle",
      });
      y += (b.h || 1.0) + 0.25;
    } else if (b.type === "table") {
      const rows = [b.header, ...b.rows];
      s.addTable(rows, {
        x: 0.9, y, w: 11.6,
        fontFace: "Calibri", fontSize: b.size || 12, color: C.text,
        border: { type: "solid", color: "1E293B", pt: 1 },
        fill: { color: C.panel },
        rowH: b.rowH || 0.42,
        valign: "middle",
        autoPage: false,
      });
      y += rows.length * (b.rowH || 0.42) + 0.3;
    } else if (b.type === "text") {
      s.addText(b.text, {
        x: 0.9, y, w: 11.6, h: b.h || 0.6,
        fontSize: b.size || 16, color: b.color || C.text, fontFace: "Calibri", valign: "top",
      });
      y += (b.h || 0.6) + 0.15;
    }
  }
  // pie
  s.addText("ObraHub · Administración de la Edificación III · Grupo IX B", {
    x: 0.7, y: 7.05, w: 9, h: 0.35, fontSize: 9, color: "475569", fontFace: "Calibri",
  });
  return s;
}

// ============================================================================
// PRESENTACIÓN 1 — INVESTIGACIÓN DE MERCADOS: SECTOR ECONÓMICO CONSTRUCCIÓN
// ============================================================================
function buildPresentacionInvestigacion() {
  const pptx = basePpt("Informe de Investigación de Mercado — Sector Construcción");

  titleSlide(
    pptx,
    "UNIVERSIDAD COLEGIO MAYOR DE CUNDINAMARCA · FACULTAD DE INGENIERÍA Y ARQUITECTURA",
    "Investigación de Mercados\nSector Económico: Industria de la Construcción",
    "Proyecto: ObraHub — Sistema Operativo de la Construcción con integración BIM\nSustentación",
    "Diego Orlando Pineda Escobar · Grupo IX B · Admon. de la Edificación III · Docente: Carlos A. Corrales M. · Bogotá, 20 de agosto de 2026"
  );

  contentSlide(pptx, "1", "Objetivo de la investigación", [
    { type: "callout", text: "Analizar el sector de la construcción en Colombia con base en aspectos macroeconómicos, de mercado y de representación política del sector.", h: 1.15, size: 18, color: C.white },
    { type: "text", text: "Siete dimensiones analizadas:", size: 16, color: C.muted },
    { type: "bullets", items: [
      { text: "① PIB — ② Generación de empleo — ③ Plan de desarrollo", bold: true },
      { text: "④ Tendencias de consumo — ⑤ Necesidades del sector", bold: true },
      { text: "⑥ Innovaciones — ⑦ Gremios y asociaciones", bold: true },
    ], h: 2.2 },
    { type: "text", text: "Tipo de investigación: descriptiva — documental (DANE, MinVivienda, DNP, Camacol, Banco de la República).", size: 13, color: C.muted },
  ]);

  contentSlide(pptx, "2", "El proyecto: ObraHub", [
    { type: "text", text: "\u201CEl Sistema Operativo de la Construcción\u201D — plataforma web SaaS con 4 herramientas integradas:", size: 16, h: 0.5 },
    { type: "bullets", items: [
      { text: "📁 Documentos — DWG/DXF/IFC/PDF/Excel con visores nativos en el navegador", size: 15 },
      { text: "⚖️ Consultor Normativo — IA sobre NSR-10, RETIE, RETILAP, RAS (respuestas citadas)", size: 15 },
      { text: "💰 Costos y Presupuestos — APU con IA · AIU 22% · IVA 19% · exportación Excel", size: 15 },
      { text: "📊 Seguimiento de Obra — Gantt con IA, bitácora diaria y BIM 4D", size: 15 },
    ], h: 2.4 },
    { type: "callout", text: "Diferenciador: procesa modelos BIM (IFC) directamente en el navegador → extrae cantidades → genera presupuesto (BIM 5D) y vincula elementos al cronograma (BIM 4D).", border: C.green, color: C.white },
    { type: "text", text: "Segmento: constructoras pymes, arquitectos independientes e interventores en Colombia.", size: 13, color: C.muted },
  ]);

  contentSlide(pptx, "3", "① PIB — Producto Interno Bruto", [
    { type: "bullets", items: [
      { text: "La construcción ≈ 6–7% del PIB nacional — sector de gran arrastre", bold: true },
      { text: "2024: Q3 +4,1% por obra civil (+16,5%); edificaciones acumuló -2,4%", size: 15 },
      { text: "2025: el peor año desde 2020 → edificaciones -7,5%", size: 15 },
      { text: "2026 (Q1): recuperación → sector +5,4% · PIB nacional +2,2%", size: 15 },
    ], h: 2.6 },
    { type: "callout", text: "Sector cíclico saliendo del fondo: el momento histórico de mayor necesidad de eficiencia y herramientas de control.", border: C.amber },
    { type: "text", text: "Fuente: DANE — Cuentas Nacionales Trimestrales / IEAC", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "4", "② Generación de empleo", [
    { type: "bullets", items: [
      { text: "1,68 millones de ocupados en dic-2023 (+8,8% vs 2022)", bold: true, size: 18 },
      { text: "Hoy ~1,47–1,5 millones de personas = 6,9% del empleo nacional", size: 16 },
      { text: "~449.000 puestos de obra mensuales (indicador IEAC, oct-2024)", size: 16 },
      { text: "2025: el empleo cayó por la contracción de la edificación", size: 16 },
    ], h: 3.4 },
    { type: "callout", text: "Base amplia de empresas y profesionales — mercado suficiente para un SaaS especializado." },
    { type: "text", text: "Fuentes: DANE (GEIH); Camacol", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "5", "③ Plan de desarrollo — PND 2022-2026", [
    { type: "bullets", items: [
      { text: "\u201CColombia Potencia Mundial de la Vida\u201D", bold: true },
      { text: "Déficit habitacional: 30,4% (2022) → 25,6% (2025) — meta del PND cumplida", size: 15 },
      { text: "Camacol: ~2,07 millones de hogares en déficit → ≈465.000 viviendas por construir", size: 15 },
      { text: "Mi Casa Ya suspendido (dic-2024) → caída VIS 2025 → \u201CCasa Milagro\u201D y propuestas Camacol", size: 15 },
      { text: "Obra civil pública (ANI, 4G/5G) sostuvo el sector", size: 15 },
    ], h: 3.1 },
    { type: "callout", text: "CLAVE PARA OBRAHUB — Estrategia Nacional BIM (2020–2026): 85-100% de proyectos públicos con BIM en 2025 → implementación nacional en 2026.", border: C.green, color: C.white, h: 1.1 },
    { type: "text", text: "Fuentes: DNP · MinVivienda · UPIT", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "6", "④ Tendencias del sector", [
    { type: "text", text: "Tecnología y digitalización", bold: true, size: 17, color: C.blue, h: 0.4 },
    { type: "bullets", items: [
      { text: "BIM 4D/5D exigido en licitación pública · Inteligencia artificial en costos y programación", size: 15 },
      { text: "Drones para inspección · Visores web de modelos (sin software de escritorio)", size: 15 },
    ], h: 1.3 },
    { type: "text", text: "Sostenibilidad y nuevos sistemas", bold: true, size: 17, color: C.green, h: 0.4 },
    { type: "bullets", items: [
      { text: "Construcción verde: -50% energía, -40% agua (CCCS)", size: 15 },
      { text: "Construcción en seco (steel framing, drywall) · Eficiencia energética y domótica", size: 15 },
    ], h: 1.3 },
    { type: "callout", text: "ObraHub nace exactamente de la intersección BIM + IA: las dos tendencias dominantes del sector.", border: C.purple },
  ]);

  contentSlide(pptx, "7", "⑤ Necesidades del sector", [
    { type: "bullets", items: [
      { text: "Productividad y control de costos — sobrecostos sistemáticos por mala presupuestación", bold: true },
      { text: "Integración de información — Excel + Project + PDF + BIM fragmentados", bold: true },
      { text: "Acceso ágil a normativa — NSR-10 / RETIE / RETILAP extensos y de consulta lenta", bold: true },
      { text: "BIM accesible para pymes — sin capital para Revit / Navisworks / Procore", bold: true },
      { text: "Construcción sostenible — gestión ambiental, ciclo de vida de materiales", size: 15 },
      { text: "Vivienda social masiva — déficit ~2 millones de hogares", size: 15 },
    ], h: 3.9 },
    { type: "callout", text: "Las necesidades 1–4 son exactamente lo que ObraHub resuelve.", border: C.green, color: C.white, h: 0.9 },
  ]);

  contentSlide(pptx, "8", "⑥ Innovaciones del sector", [
    { type: "text", text: "Materiales", bold: true, size: 17, color: C.amber, h: 0.4 },
    { type: "bullets", items: [
      { text: "Fibras de carbono · Grafeno · Polímeros autoregenerables · Aerogeles · Nitinol · Impresión 3D estructural", size: 15 },
    ], h: 0.9 },
    { type: "text", text: "Digitalización (frente de ObraHub)", bold: true, size: 17, color: C.blue, h: 0.4 },
    { type: "bullets", items: [
      { text: "BIM 4D: modelo ↔ cronograma · BIM 5D: modelo ↔ costos", size: 15 },
      { text: "IA generativa para APU y asistentes normativos", size: 15 },
      { text: "Plataformas colaborativas en la nube — categoría Procore, sin oferta local", size: 15 },
    ], h: 1.9 },
    { type: "callout", text: "ObraHub materializa esta innovación en contexto colombiano: visor IFC web, APU con IA sobre precios locales, RAG normativo NSR-10/RETIE, vínculo 4D — sin equivalente local conocido.", border: C.blue, color: C.white },
  ]);

  contentSlide(pptx, "9", "⑦ Gremios y asociaciones", [
    { type: "table", size: 12, rowH: 0.52, header: [
      { text: "Gremio", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Rol en el sector", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Relación con ObraHub", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Camacol", "Estadísticas, precios, política sectorial", "Precios de referencia y validación"],
      ["C. Colombiana de la Infraestructura", "Obra civil, APP, licitaciones ANI", "Mercado con exigencia BIM"],
      ["Soc. Colombiana de Ingenieros", "Normas técnicas, colegiatura", "Canal de adopción profesional"],
      ["Soc. Colombiana de Arquitectos", "Comunidad de arquitectos", "Segmento objetivo"],
      ["Asoc. Facultades de Arquitectura", "Academia", "Adopción universitaria"],
      ["Consejo Col. Construcción Sostenible", "Construcción sostenible", "Tendencia normativa verde"],
      ["Cámara de Comercio de Bogotá", "Registro mercantil", "Constitución ObraHub S.A.S."],
    ] },
  ]);

  contentSlide(pptx, "10", "Conclusiones — FAVORABLE ✅", [
    { type: "bullets", items: [
      { text: "Mandato BIM 2026 → todo el ecosistema necesita BIM; ObraHub lo da sin licencias costosas", bold: true, color: C.green },
      { text: "Necesidad comprobada de integración (Excel/Project/PDF/BIM fragmentados)", color: C.green },
      { text: "Normativa colombiana embebida — ningún competidor internacional incluye NSR-10/RETIE con IA", color: C.green },
      { text: "Mercado amplio: ~1,5 M de ocupados, miles de firmas constructoras", color: C.green },
      { text: "Reactivación 2026 (+5,4% Q1) → más licitaciones y arranques de obra", color: C.green },
      { text: "Prototipo real en producción — demostrable", color: C.green },
    ], h: 4.4 },
  ]);

  contentSlide(pptx, "11", "Aspectos a vigilar ⚠️ y balance", [
    { type: "bullets", items: [
      { text: "Contracción 2024-2025 → presupuestos ajustados de los clientes", color: C.amber },
      { text: "Cultura tecnológica lenta en constructoras tradicionales", color: C.amber },
      { text: "Competencia internacional (Autodesk, Procore, Trimble)", color: C.amber },
      { text: "Dependencia de APIs de IA y conectividad en obra", color: C.amber },
    ], h: 2.7 },
    { type: "callout", text: "BALANCE: entorno FAVORABLE para ObraHub. El mandato BIM 2026 y la ausencia de oferta local integrada superan los riesgos, compitiendo por el segmento pyme desatendido con modelo freemium.", border: C.green, color: C.white, h: 1.2 },
  ]);

  // Cierre
  const s = pptx.addSlide();
  addBg(s);
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.green } });
  s.addText("ObraHub — Toda tu obra, en un solo lugar.", {
    x: 0.8, y: 2.6, w: 11.7, h: 1.0, fontSize: 34, bold: true, color: C.white, align: "center",
  });
  s.addText("Prototipo en producción: obra-hub-gray.vercel.app · IFC + APU con IA + Normativa + Gantt 4D", {
    x: 0.8, y: 3.8, w: 11.7, h: 0.6, fontSize: 16, color: C.muted, align: "center",
  });
  s.addText("¡Gracias! Preguntas y sustentación", {
    x: 0.8, y: 5.2, w: 11.7, h: 0.6, fontSize: 20, color: C.blue, align: "center", bold: true,
  });
  s.addText("Diego Orlando Pineda Escobar · Grupo IX B · Admon. de la Edificación III", {
    x: 0.8, y: 6.6, w: 11.7, h: 0.4, fontSize: 11, color: C.muted, align: "center",
  });

  const file = path.join(OUT, "2-presentacion-investigacion-1.pptx");
  pptx.writeFile({ fileName: file }).then(() => console.log("OK:", file));
}

// ============================================================================
// PRESENTACIÓN 2 — CREACIÓN DE EMPRESA
// ============================================================================
function buildPresentacionEmpresa() {
  const pptx = basePpt("Creación de Empresa — ObraHub S.A.S.");

  titleSlide(
    pptx,
    "ADMINISTRACIÓN DE LA EDIFICACIÓN III · ACTIVIDAD GRUPAL",
    "Creación de Empresa",
    "Conformación de la empresa y plan de empresa — OBRAHUB S.A.S.",
    "Diego Orlando Pineda Escobar · Grupo IX B · Docente: Carlos A. Corrales M. · Bogotá, agosto de 2026"
  );

  contentSlide(pptx, "1", "Nombre o razón social", [
    { type: "text", text: "OBRAHUB S.A.S.", bold: true, size: 40, color: C.blue, h: 0.8 },
    { type: "bullets", items: [
      { text: "Razón social: OBRAHUB SOCIEDAD POR ACCIONES SIMPLIFICADAS (Ley 1258 de 2008)", size: 15 },
      { text: "Constitución ágil (documento privado, un solo accionista posible) · responsabilidad limitada al aporte · ideal para emprendimiento tecnológico escalable", size: 15 },
      { text: "\u201CObra\u201D (proyecto de construcción) + \u201CHub\u201D (centro de conexión): donde converge toda la información de la obra", size: 15 },
      { text: "Prototipo en producción: obra-hub-gray.vercel.app", size: 15, color: C.green },
    ], h: 3.4 },
  ]);

  contentSlide(pptx, "2", "Simulacro de registro — Cámara de Comercio de Bogotá", [
    { type: "table", size: 11.5, rowH: 0.4, header: [
      { text: "Campo del Registro Mercantil", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Dato", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Razón social", "OBRAHUB S.A.S."],
      ["NIT", "901.XXX.XXX-X (asignado por la DIAN al constituir)"],
      ["Domicilio", "Bogotá D.C., Colombia"],
      ["Actividad económica (CIIU)", "6201 — Desarrollo de sistemas informáticos (software) · Complementaria: 7112 — Ingeniería y arquitectura"],
      ["Objeto social", "Desarrollo, comercialización y prestación de servicios de software para la gestión de proyectos de construcción: presupuestación, programación, gestión documental, consultoría normativa y BIM"],
      ["Capital suscrito", "$5.000.000 COP (500 acciones de $10.000)"],
      ["Representante legal", "Diego Orlando Pineda Escobar (Gerente)"],
      ["Duración", "50 años · Trámite en línea ccb.org.co (RUES)"],
    ] },
    { type: "text", text: "Costo estimado: constitución ~$70.000–$120.000 + matrícula mercantil ~$180.000 COP.", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "3", "Logo e identidad corporativa", [
    { type: "text", text: "Concepto: tecnología + confianza del sector construcción", size: 16, h: 0.5 },
    { type: "table", size: 13, rowH: 0.45, header: [
      { text: "Elemento", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Definición", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Imagotipo", "\u201CObraHub\u201D en tipografía geométrica moderna; símbolo de nodo/hub donde converge la obra (documentos, normas, costos, cronograma)"],
      ["Paleta cromática", "Azul profundo #050B14 y #1E3A8A (tecnología, confianza) · Azul eléctrico #3B82F6 (acción) · Verde #10B981 (costos) · Violeta #8B5CF6 (programación) · Ámbar #F59E0B (alertas)"],
      ["Aplicaciones", "Documentos oficiales, plataforma (interfaz real en producción), presentaciones, redes"],
      ["Eslogan", "\u201CToda tu obra, en un solo lugar.\u201D"],
    ] },
  ]);

  contentSlide(pptx, "4", "Organigrama — empresa de fundador único", [
    { type: "callout", text: "La S.A.S. permite el accionista único (Ley 1258 de 2008): la empresa nace concentrada en su fundador y crece por contratación progresiva según ingresos.", h: 0.95, size: 14 },
    { type: "table", size: 10.5, rowH: 0.48, header: [
      { text: "Cargo", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Fase inicial", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Fase de crecimiento", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Funciones principales", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Asamblea / Accionista único", "Diego Orlando Pineda Escobar", "—", "Aportes de capital y decisiones societarias"],
      ["Gerente General / CEO", "Diego Orlando Pineda Escobar", "—", "Dirección estratégica, representación legal, alianzas (Camacol, SCI, SCA, universidades)"],
      ["Desarrollo Tecnológico / CTO", "Diego Orlando Pineda Escobar", "Equipo de desarrollo", "Plataforma: visor IFC, IA, seguridad, escalabilidad"],
      ["Contenido Normativo y Precios", "Diego Orlando Pineda Escobar", "Curator de contenido", "Actualización NSR-10/RETIE/RETI  LAP, base de precios APU, calidad IA"],
      ["Comercial y Mercadeo / CCO", "Diego Orlando Pineda Escobar", "Ejecutivo comercial", "Ventas, marketing digital, soporte, onboarding BIM"],
      ["Administración / Finanzas / CFO", "Contador público externo", "CFO dedicado", "Constitución, contabilidad, contratos, impuestos"],
    ] },
    { type: "text", text: "Etapa de arranque: todos los cargos se concentran en el fundador con apoyo contable externo; el equipo se contrata con los ingresos.", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "5", "Clientes potenciales — necesidades y ubicación", [
    { type: "table", size: 11, rowH: 0.46, header: [
      { text: "Cliente", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Necesidad / deseo", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Ubicación", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Constructoras pymes (vivienda/remodelación)", "Presupuestar rápido sin error; cronograma; control de costos", "Bogotá, Soacha, Mosquera, Medellín, Cali, Bucaramanga"],
      ["Arquitectos independientes", "Integrar planos, costos y cronograma; consultar NSR-10 al instante", "Bogotá D.C. (principal)"],
      ["Interventores y consultores", "Bitácora y seguimiento diario con trazabilidad", "Nacional (obra pública y privada)"],
      ["Constructoras con BIM", "Ver IFC sin licencias por usuario; QTO y 4D sin Navisworks", "Bogotá, Medellín"],
      ["Estudiantes y facultades", "Aprender APU, cronograma y BIM con herramienta real", "Universidades (nacional)"],
      ["Subcontratistas de obra pública", "Cumplir exigencia BIM 2026 a bajo costo", "Nacional (ANI, alcaldías)"],
    ] },
  ]);

  contentSlide(pptx, "6", "Proveedores de insumos", [
    { type: "table", size: 11.5, rowH: 0.46, header: [
      { text: "Insumo", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Proveedor", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Rol", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Motor de IA (chat, APU, embeddings)", "OpenAI (API)", "Inteligencia artificial de las 4 herramientas"],
      ["Base de datos, auth, almacenamiento", "Supabase (Postgres)", "Persistencia segura de proyectos"],
      ["Hosting y CDN", "Vercel", "Despliegue continuo, disponibilidad"],
      ["Motor IFC/CAD en navegador", "web-ifc / libredwg (open source)", "Visor BIM/CAD"],
      ["Correo OTP", "Resend", "Autenticación"],
      ["Precios de insumos", "Camacol, SIC, Argos, Cemex, Homecenter", "Base de precios APU colombiana"],
      ["Normativa", "MinVivienda, MinEnergía (RETIE), AIS", "Contenido del consultor normativo"],
      ["Contabilidad y jurídica", "Contador público + notaría", "Formalización y cumplimiento"],
    ] },
  ]);

  contentSlide(pptx, "7", "Conceptos de empresa hacia los mercados", [
    { type: "table", size: 12, rowH: 0.72, header: [
      { text: "Concepto", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "Aplicación en ObraHub", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
    ], rows: [
      ["Producción", "Servicio siempre disponible y a bajo costo: plataforma cloud serverless, actualización continua, registro en línea sin instalación"],
      ["Producto", "Calidad y características superiores: 4 herramientas integradas con IA y BIM que reemplazan trabajo manual — presupuesto en minutos, no días"],
      ["Venta", "Comercial activo y consultivo: demos a constructoras y gremios, freemium, acompañamiento onboarding BIM"],
      ["Mercadotecnia", "Satisfacer necesidades del mercado para alcanzar metas: resolver la fragmentación documental y normativa del constructor colombiano; el segmento orienta la hoja de ruta"],
    ] },
    { type: "text", text: "Marco conceptual de la clase y Kotler, Dirección de Mercadotecnia, Cap. 1.", size: 11, color: C.muted },
  ]);

  contentSlide(pptx, "8", "Matriz de criterios — iniciativa seleccionada", [
    { type: "table", size: 14, rowH: 0.55, header: [
      { text: "Criterio", options: { bold: true, color: C.white, fill: { color: C.darkblue } } },
      { text: "ObraHub", options: { bold: true, color: C.white, fill: { color: C.darkblue }, align: "center" } },
      { text: "Consultoría BIM (reserva)", options: { bold: true, color: C.white, fill: { color: C.darkblue }, align: "center" } },
      { text: "Base de precios (reserva)", options: { bold: true, color: C.white, fill: { color: C.darkblue }, align: "center" } },
    ], rows: [
      ["Demanda potencial", { text: "9", options: { align: "center", bold: true } }, { text: "7", options: { align: "center" } }, { text: "6", options: { align: "center" } }],
      ["Innovador", { text: "9", options: { align: "center", bold: true } }, { text: "5", options: { align: "center" } }, { text: "4", options: { align: "center" } }],
      ["Realizable", { text: "8", options: { align: "center", bold: true } }, { text: "9", options: { align: "center" } }, { text: "7", options: { align: "center" } }],
      ["Relación con la construcción", { text: "10", options: { align: "center", bold: true } }, { text: "10", options: { align: "center" } }, { text: "10", options: { align: "center" } }],
      [{ text: "TOTAL", options: { bold: true } }, { text: "36/40", options: { align: "center", bold: true, color: C.green } }, { text: "31/40", options: { align: "center" } }, { text: "27/40", options: { align: "center" } }],
    ] },
    { type: "callout", text: "INICIATIVA SELECCIONADA: ObraHub (36/40) — máxima relación con el sector, diferenciador tecnológico, demanda por mandato BIM 2026 y prototipo funcionando.", border: C.green, color: C.white },
  ]);

  contentSlide(pptx, "9", "Consolidado y próximos pasos", [
    { type: "bullets", items: [
      { text: "✅ Razón social: OBRAHUB S.A.S. + simulacro de registro CCB (CIIU 6201)", color: C.green },
      { text: "✅ Identidad corporativa: logo, paleta y eslogan \u201CToda tu obra, en un solo lugar\u201D", color: C.green },
      { text: "✅ Organigrama con cargos, funciones y responsables", color: C.green },
      { text: "✅ Clientes potenciales con necesidades y ubicación", color: C.green },
      { text: "✅ Proveedores de insumos tecnológicos y de contenido", color: C.green },
      { text: "✅ Matriz de criterios: 36/40 — iniciativa seleccionada", color: C.green },
    ], h: 3.6 },
    { type: "text", text: "Próximos pasos (plan de empresa):", bold: true, size: 15, color: C.blue, h: 0.4 },
    { type: "bullets", items: [
      { text: "Investigación 2 — segmento de mercado (clientes potenciales, sustitutos, tamaño en pesos)", size: 14 },
      { text: "Investigación 3 — competencia potencial y DOFA · Plan de marketing · Constitución formal", size: 14 },
    ], h: 1.2 },
  ]);

  const s = pptx.addSlide();
  addBg(s);
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.green } });
  s.addText("OBRAHUB S.A.S.", {
    x: 0.8, y: 2.7, w: 11.7, h: 1.0, fontSize: 44, bold: true, color: C.white, align: "center",
  });
  s.addText("Toda tu obra, en un solo lugar.", {
    x: 0.8, y: 3.9, w: 11.7, h: 0.6, fontSize: 20, color: C.blue, align: "center", italic: true,
  });
  s.addText("¡Gracias!", {
    x: 0.8, y: 5.3, w: 11.7, h: 0.6, fontSize: 20, color: C.muted, align: "center",
  });

  const file = path.join(OUT, "4-presentacion-creacion-empresa.pptx");
  pptx.writeFile({ fileName: file }).then(() => console.log("OK:", file));
}

buildPresentacionInvestigacion();
buildPresentacionEmpresa();
