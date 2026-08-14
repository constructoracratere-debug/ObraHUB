// Genera las 3 presentaciones .pptx de las investigaciones 2, 3 y 4 (Admon 3)
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = "C:/ObraHub/docs/admon3";
const C = {
  bg: "050B14", blue: "3B82F6", darkblue: "1E3A8A", green: "10B981",
  amber: "F59E0B", purple: "8B5CF6", red: "EF4444",
  text: "E2E8F0", muted: "94A3B8", white: "FFFFFF",
};

function basePpt(title) {
  const p = new pptxgen();
  p.author = "Diego Orlando Pineda Escobar";
  p.company = "ObraHub";
  p.title = title;
  p.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  p.layout = "WIDE";
  return p;
}

function titleSlide(p, kicker, title, subtitle, footer) {
  const s = p.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.blue } });
  s.addText(kicker, { x: 0.8, y: 1.7, w: 11.7, h: 0.5, fontSize: 15, color: C.blue, bold: true });
  s.addText(title, { x: 0.8, y: 2.3, w: 11.7, h: 1.8, fontSize: 38, color: C.white, bold: true });
  s.addText(subtitle, { x: 0.8, y: 4.3, w: 11.7, h: 1.2, fontSize: 18, color: C.muted });
  s.addText(footer, { x: 0.8, y: 6.5, w: 11.7, h: 0.5, fontSize: 12, color: C.muted });
}

function contentSlide(p, num, title, blocks) {
  const s = p.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.blue } });
  s.addText(`${num}`, { x: 0.7, y: 0.35, w: 1.0, h: 0.9, fontSize: 40, color: C.darkblue, bold: true });
  s.addText(title, { x: 1.6, y: 0.42, w: 11.0, h: 0.85, fontSize: 27, color: C.white, bold: true });
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
            fontSize: (typeof t === "object" && t.size) || b.size || 15,
          },
        })),
        { x: 0.9, y, w: 11.6, h: b.h || 3.6, lineSpacingMultiple: 1.15, valign: "top" }
      );
      y += b.h || 3.6;
    } else if (b.type === "callout") {
      s.addShape("roundRect", { x: 0.9, y, w: 11.6, h: b.h || 1.0, fill: { color: "0F1B33" }, line: { color: b.border || C.blue, width: 1 }, rectRadius: 0.08 });
      s.addText(b.text, { x: 1.15, y: y + 0.12, w: 11.1, h: (b.h || 1.0) - 0.24, fontSize: b.size || 14, color: b.color || C.text, valign: "middle" });
      y += (b.h || 1.0) + 0.25;
    } else if (b.type === "table") {
      const rows = [b.header, ...b.rows];
      s.addTable(rows, {
        x: 0.9, y, w: 11.6, fontSize: b.size || 11, color: C.text,
        border: { type: "solid", color: "1E293B", pt: 1 },
        fill: { color: "0A1120" }, rowH: b.rowH || 0.42, valign: "middle", autoPage: false,
      });
      y += rows.length * (b.rowH || 0.42) + 0.3;
    } else if (b.type === "text") {
      s.addText(b.text, { x: 0.9, y, w: 11.6, h: b.h || 0.5, fontSize: b.size || 15, color: b.color || C.text, valign: "top", bold: b.bold });
      y += (b.h || 0.5) + 0.15;
    }
  }
  s.addText("ObraHub · Administración de la Edificación III · Grupo IX B — Diego Orlando Pineda Escobar", {
    x: 0.7, y: 7.05, w: 11, h: 0.35, fontSize: 9, color: "475569",
  });
}

function closeSlide(p, main, sub) {
  const s = p.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: C.green } });
  s.addText(main, { x: 0.8, y: 2.7, w: 11.7, h: 1.0, fontSize: 32, bold: true, color: C.white, align: "center" });
  s.addText(sub, { x: 0.8, y: 3.9, w: 11.7, h: 0.8, fontSize: 17, color: C.muted, align: "center" });
  s.addText("¡Gracias!", { x: 0.8, y: 5.2, w: 11.7, h: 0.6, fontSize: 20, color: C.blue, align: "center", bold: true });
}

const hdr = (t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.darkblue } } });

// ============================================================
// INVESTIGACIÓN 2 — SEGMENTO
// ============================================================
function build2() {
  const p = basePpt("Investigación 2 — Segmento de Mercado");
  titleSlide(p, "INVESTIGACIÓN DE MERCADOS · INFORME 2",
    "Segmento de Mercado",
    "Proyecto: ObraHub — Sistema Operativo de la Construcción con integración BIM",
    "Diego Orlando Pineda Escobar · Grupo IX B · Admon. de la Edificación III · Bogotá, 2026-2");

  contentSlide(p, "1", "Objetivo y segmento", [
    { type: "callout", text: "Analizar el comportamiento del segmento de mercado al que se dirigirá la estrategia del proyecto ObraHub.", h: 1.0, size: 17, color: C.white },
    { type: "text", text: "Segmento objetivo:", bold: true, size: 16, color: C.blue },
    { type: "bullets", items: [
      "Constructoras pequeñas y medianas (pymes) — vivienda, remodelación, obra menor",
      "Arquitectos y constructores independientes que gestionan obra",
      "Interventores y consultores",
      "Hoy usan herramientas fragmentadas (Excel, Project, PDF) sin acceso a suites BIM costosas",
    ], h: 2.6 },
    { type: "text", text: "Investigación descriptiva — documental (CPNAA, DANE/RUES, Confecámaras, precios públicos de sustitutos)", size: 12, color: C.muted },
  ]);

  contentSlide(p, "2", "① Clientes potenciales", [
    { type: "bullets", items: [
      { text: "76.752 arquitectos matriculados (CPNAA) — Bogotá concentra 40,4%", bold: true, size: 17 },
      { text: "~25% gestiona obra directamente → ~19.000 profesionales clientes del plan individual", size: 15 },
      { text: "~5.000–8.000 constructoras y firmas de interventoría pymes activas (RUES/CIIU F)", size: 16 },
    ], h: 3.0 },
    { type: "callout", text: "TOTAL ≈ 25.500 clientes potenciales directos (+ estudiantes vía plan gratuito).", border: C.green, color: C.white, h: 0.95 },
    { type: "text", text: "Fuentes: CPNAA (perfil por regiones) · RUES/Confecámaras · Camacol", size: 12, color: C.muted },
  ]);

  contentSlide(p, "3", "② Productos sustitutos y precios", [
    { type: "table", size: 11.5, rowH: 0.5, header: [hdr("Sustituto"), hdr("Precio de referencia"), hdr("En COP*")],
      rows: [
        ["Excel / Microsoft 365", "~USD 8–10/mes", "~$40–55 mil/mes"],
        ["MS Project", "USD 10–30 usuario/mes", "~$55–165 mil/mes"],
        ["Procore", "ACV USD 4.500–60.000/año (0,1–0,2% costo de obra)", "$27–360 millones/año"],
        ["Autodesk Build", "USD 1.625/usuario/año", "~$9,9 millones/año"],
        ["Buildertrend", "USD 5.000–13.000/año", "$30–79 millones/año"],
        ["DataObra / OneEstimate (LATAM)", "Suscripción regional / plan gratuito inicial", "—"],
        ["Método manual", "$0", "$0"],
      ] },
    { type: "callout", text: "Los extremos son $0 o muy costosos: la posición intermedia (pyme) está DESATENDIDA.", border: C.amber },
  ]);

  contentSlide(p, "4", "③④ Frecuencia y cantidades de compra", [
    { type: "text", text: "Frecuencia:", bold: true, size: 16, color: C.blue },
    { type: "bullets", items: [
      "Suscripciones SaaS: mensual/anual recurrente (Excel, Project, Autodesk)",
      "Procore/Buildertrend: contrato anual anticipado con renovación +10-14%",
      { text: "Uso real: 2–12 presupuestos/año por pyme · cronogramas semanales · normativa diaria", bold: true },
    ], h: 2.4 },
    { type: "text", text: "Cantidades de compra:", bold: true, size: 16, color: C.blue },
    { type: "bullets", items: [
      "Pymes: 1–3 licencias parciales (USD 20–80/mes) sin integración",
      "Independientes: 1 licencia personal (USD 10–40/mes)",
      "Ningún sustituto integra visor IFC + APU colombiano + normativa + BIM 4D",
    ], h: 2.2 },
  ]);

  contentSlide(p, "5", "⑤ Tamaño del mercado (TAM-SAM-SOM)", [
    { type: "table", size: 13, rowH: 0.6, header: [hdr("Nivel"), hdr("Descripción"), hdr("Cálculo"), hdr("Tamaño")],
      rows: [
        ["TAM", "19.000 profesionales + 6.500 pymes", "(19.000×$599K)+(6.500×$1.799K)", { text: "~$22.900 M COP/año", options: { bold: true } }],
        ["SAM", "40% profesionales + 70% pymes con obra activa", "(7.600×$599K)+(4.550×$1.799K)", { text: "~$12.900 M COP/año (≈12.150 clientes)", options: { bold: true, color: C.green } }],
        ["SOM (3 años)", "Penetración 5% del SAM", "5% × $12.900M", { text: "~$645 M COP/año", options: { bold: true } }],
      ] },
    { type: "text", text: "Planes ObraHub: Profesional $49.900/mes · Pyme $149.900/mes · Estudiante gratuito", size: 13, color: C.muted },
  ]);

  contentSlide(p, "6", "Conclusiones", [
    { type: "bullets", items: [
      { text: "Segmento amplio: ~25.500 clientes potenciales; Bogotá = 40%", color: C.green },
      { text: "Posición intermedia del mercado vacía: nadie integra norma colombiana + APU + BIM a precio pyme", color: C.green },
      { text: "Compra naturalmente recurrente (suscripción mensual/anual)", color: C.green },
      { text: "SAM $12.900 M COP/año → meta 3 años $645 M COP/año (600 clientes)", color: C.green },
      { text: "Estrategia de entrada: freemium para capturar estudiantes y jóvenes profesionales", bold: true },
    ], h: 4.0 },
    { type: "callout", text: "EL SEGMENTO ES FAVORABLE PARA OBRAHUB: amplio, mal atendido y recurrente.", border: C.green, color: C.white, h: 1.0 },
  ]);

  closeSlide(p, "Segmento validado: 25.500 clientes · $12.900M COP/año", "ObraHub — Toda tu obra, en un solo lugar.");
  p.writeFile({ fileName: path.join(OUT, "6-presentacion-investigacion-2-segmento.pptx") }).then(() => console.log("OK: 6-...segmento.pptx"));
}

// ============================================================
// INVESTIGACIÓN 3 — COMPETENCIA
// ============================================================
function build3() {
  const p = basePpt("Investigación 3 — Competencia Potencial");
  titleSlide(p, "INVESTIGACIÓN DE MERCADOS · INFORME 3",
    "Competencia Potencial",
    "Proyecto: ObraHub — Análisis de la competencia + Matriz DOFA + Modelo Canvas",
    "Diego Orlando Pineda Escobar · Grupo IX B · Admon. de la Edificación III · Bogotá, 2026-2");

  contentSlide(p, "1", "Objetivo", [
    { type: "callout", text: "Analizar la competencia potencial perteneciente al segmento de mercado del proyecto, evaluando fortalezas y debilidades frente a ObraHub (Matriz DOFA).", h: 1.1, size: 16, color: C.white },
    { type: "text", text: "Mapa competitivo: 3 círculos", bold: true, size: 16, color: C.blue },
    { type: "bullets", items: [
      { text: "Gigantes internacionales — Procore, Autodesk Build, Buildertrend, Fieldwire", size: 15 },
      { text: "Regionales LATAM — Buildpeer (MX), OneMake, DataObra (AR), OneEstimate", size: 15 },
      { text: "Sustitutos indirectos — Excel, MS Project, S10/Presto, método manual", size: 15 },
    ], h: 2.6 },
  ]);

  contentSlide(p, "2", "Gigantes internacionales", [
    { type: "table", size: 11, rowH: 0.55, header: [hdr("Competidor"), hdr("Fortaleza"), hdr("Debilidad frente al segmento")],
      rows: [
        ["Procore (EE.UU.)", "Líder mundial · usuarios ilimitados", "USD 4.500–60.000/año · sin norma colombiana · para grandes firmas"],
        ["Autodesk Build", "Integración Revit/IFC · BIM 5D avanzado", "~USD 1.625/usuario/año · requiere ecosistema Autodesk"],
        ["Buildertrend", "Constructoras residenciales EE.UU.", "USD 5.000–13.000/año · sin NSR/RETIE ni APU local"],
        ["Fieldwire (Hilti)", "Planos y campo · freemium · buen móvil", "No presupuesta · sin normativa · BIM limitado"],
      ] },
    { type: "callout", text: "Fuera del alcance de precio del segmento pyme colombiano.", border: C.amber, h: 0.85 },
  ]);

  contentSlide(p, "3", "Regionales LATAM (competencia directa)", [
    { type: "table", size: 11, rowH: 0.55, header: [hdr("Competidor"), hdr("Fortaleza"), hdr("Debilidad frente a ObraHub")],
      rows: [
        ["Buildpeer (México)", "Documentación, finanzas, presupuestos · offline · español", "Sin visor IFC en navegador · sin norma colombiana · sin BIM 4D"],
        ["OneMake", "Gestión de obra con IA · posicionamiento en español", "Generalista · sin NSR-10/RETIE ni estructura APU (AIU/IVA)"],
        ["DataObra (Argentina)", "Presupuestos IA + precios de mercado", "Precios/norma argentina · sin BIM ni visor"],
        ["OneEstimate", "APU con precios precargados · plan gratuito", "Solo presupuestos: no integra cronograma, docs ni norma"],
      ] },
    { type: "callout", text: "NINGÚN COMPETIDOR OCUPA LA POSICIÓN DE OBRAHUB: integración + norma colombiana + BIM + precio pyme.", border: C.green, color: C.white, h: 0.95 },
  ]);

  contentSlide(p, "4", "Matriz DOFA — ObraHub (interior)", [
    { type: "table", size: 11, rowH: 1.15, header: [hdr("DEBILIDADES (internas)"), hdr("FORTALEZAS (internas)")],
      rows: [
        [
          "D1 Empresa unipersonal · D2 Marca nueva · D3 Base de precios APU en construcción · D4 Dependencia de APIs de IA · D5 Sin fuerza de ventas",
          "F1 ÚNICO integrador: visor IFC + APU IA colombiano + NSR/RETIE + Gantt 4D · F2 Prototipo en producción · F3 Costos bajos → precio pyme · F4 Fundador constructor-desarrollador · F5 Norma colombiana embebida (barrera)",
        ] ],
    },
    { type: "table", size: 11, rowH: 1.15, header: [hdr("AMENAZAS (externas)"), hdr("OPORTUNIDADES (externas)")],
      rows: [
        [
          "A1 Gigantes bajan a pyme local · A2 Regional agrega norma colombiana · A3 Contracción del sector · A4 Reformas normativas · A5 Costo IA en freemium",
          "O1 Mandato BIM 2026 · O2 Recuperación del sector (+5,4% Q1 2026) · O3 Déficit 2,07M hogares · O4 Vacío de oferta local integrada · O5 Alianzas gremios/universidades",
        ] ],
    },
  ]);

  contentSlide(p, "5", "Estrategias DOFA", [
    { type: "table", size: 12, rowH: 0.85, header: [hdr("Cruce"), hdr("Estrategia")],
      rows: [
        [{ text: "F×O (OFENSIVA)", options: { bold: true, color: C.green } }, "Ocupar el vacío con 'BIM sin licencias' para el subcontratista pyme; vender con demo real en eventos de gremios; freemium estudiantil"],
        [{ text: "F×A (DEFENSIVA)", options: { bold: true, color: C.blue } }, "Blindar la localización normativa (corpus NSR-10/RETIE propio) — lo más difícil de copiar"],
        [{ text: "D×O (ADAPTATIVA)", options: { bold: true, color: C.amber } }, "Cerrar base de precios con Camacol/SIC; casos piloto con 5-10 pymes de Bogotá"],
        [{ text: "D×A (SUPERVIVENCIA)", options: { bold: true, color: C.red } }, "Controlar costo de IA (caché + límites free); priorizar nicho Bogotá/vivienda"],
      ] },
  ]);

  contentSlide(p, "6", "Ensayo — La competencia y su impacto", [
    { type: "text", text: "\u201CLa competencia no invalida el proyecto: lo posiciona.\u201D", bold: true, size: 20, color: C.blue, h: 0.6 },
    { type: "bullets", items: [
      { text: "La ventana existe: nadie ocupa el centro del arco (integración + norma + BIM + precio pyme)", size: 15 },
      { text: "La ventana tiene fecha: construir rápido la barrera difícil de copiar — norma colombiana + APU AIU/IVA + 4D", size: 15 },
      { text: "La competencia define el precio: zona baja $49.900–$149.900 COP/mes donde nadie serio juega", size: 15 },
      { text: "La competencia valida la categoría: gigantes y startups confirman que el problema importa", size: 15 },
    ], h: 3.4 },
    { type: "callout", text: "ObraHub no compite con Procore por sus clientes ni con Excel por su precio: compite por el espacio que ambos dejaron vacío.", border: C.purple, color: C.white },
  ]);

  contentSlide(p, "7", "Modelo de negocio — CANVAS", [
    { type: "table", size: 10, rowH: 0.5, header: [hdr("Bloque"), hdr("Contenido")],
      rows: [
        ["Propuesta de valor", "Toda la obra en un solo lugar: documentos (DWG/DXF/IFC) + norma IA + APU IA + Gantt 4D a precio pyme"],
        ["Segmentos", "Constructoras pymes · arquitectos independientes · interventores · estudiantes (freemium)"],
        ["Canales / Relación", "Web self-service · gremios · universidades · partners · soporte en español"],
        ["Ingresos", "Freemium → Profesional $49.900/mes · Pyme $149.900/mes · Empresa a medida · anual con descuento"],
        ["Recursos / Actividades", "Prototipo en producción · corpus normativo · base precios APU · desarrollo y curaduría"],
        ["Alianzas / Costos", "OpenAI, Supabase, Vercel, Camacol/SCI/SCA, universidades · serverless + IA + contenido + marketing"],
      ] },
  ]);

  contentSlide(p, "8", "Conclusiones", [
    { type: "bullets", items: [
      { text: "3 círculos de competencia identificados; ninguno integra norma colombiana + APU + BIM 4D", color: C.green },
      { text: "Gigantes: suite pero fuera de precio · Regionales: precio pero cobertura parcial", color: C.green },
      { text: "DOFA → estrategia OFENSIVA: ocupar el vacío antes de que cierre la ventana BIM 2026", bold: true },
      { text: "Condición: velocidad (pilotos y alianzas en 12 meses) + defensa del diferencial normativo", color: C.amber },
    ], h: 3.6 },
    { type: "callout", text: "ENTORNO COMPETITIVO FAVORABLE para ObraHub en el segmento pyme colombiano.", border: C.green, color: C.white, h: 1.0 },
  ]);

  closeSlide(p, "La competenciavalida la categoría — el lugar de ObraHub está libre", "ObraHub — Toda tu obra, en un solo lugar.");
  p.writeFile({ fileName: path.join(OUT, "7-presentacion-investigacion-3-competencia.pptx") }).then(() => console.log("OK: 7-...competencia.pptx"));
}

// ============================================================
// INVESTIGACIÓN 4 — PLAN DE MARKETING
// ============================================================
function build4() {
  const p = basePpt("Investigación 4 — Plan de Marketing");
  titleSlide(p, "INVESTIGACIÓN DE MERCADOS · INFORME 4",
    "Plan de Marketing",
    "Proyecto: ObraHub — Estrategia de producto, precio, distribución y comunicación",
    "Diego Orlando Pineda Escobar · Grupo IX B · Admon. de la Edificación III · Bogotá, 2026-2");

  contentSlide(p, "1", "Objetivo", [
    { type: "callout", text: "Definir la estrategia de plan de marketing para el proyecto de trabajo de grado: las 4P de ObraHub.", h: 1.0, size: 17, color: C.white },
    { type: "bullets", items: [
      { text: "Producto — empaque, presentación, garantía", bold: true },
      { text: "Precio — y forma de pago", bold: true },
      { text: "Distribución — logística, canal, experiencia, oportunidad", bold: true },
      { text: "Comunicación — medios, publicidad, presupuesto", bold: true },
    ], h: 2.6 },
  ]);

  contentSlide(p, "2", "Producto — Empaque · Presentación · Garantía", [
    { type: "text", text: "Empaque (planes):", bold: true, size: 15, color: C.blue, h: 0.4 },
    { type: "table", size: 12, rowH: 0.5, header: [hdr("Plan"), hdr("Precio"), hdr("Incluye")],
      rows: [
        ["Estudiante", "Gratuito", "1 proyecto · 5 consultas normativas/mes"],
        ["Profesional", "$49.900/mes", "Proyectos ilimitados · APU y Gantt con IA"],
        ["Pyme", "$149.900/mes", "3–10 usuarios · visor IFC · BIM 4D"],
        ["Empresa", "A medida", "Despliegue y capacidades dedicadas"],
      ] },
    { type: "text", text: "Presentación: interfaz oscura premium + flujo guiado IFC→APU→cronograma + demo pública permanente (el 'momento wow' del visor 3D).", size: 13, h: 0.7 },
    { type: "callout", text: "Garantía: 30 días de satisfacción con devolución · soporte español <24 h · datos siempre exportables · actualización normativa incluida (única en el mercado).", border: C.green, h: 1.0 },
  ]);

  contentSlide(p, "3", "Precio y forma de pago", [
    { type: "bullets", items: [
      { text: "Estrategia: PENETRACIÓN con precio ancla bajo", bold: true, size: 17 },
      { text: "$49.900 profesional / $149.900 pyme COP/mes — muy por debajo del mínimo internacional", size: 15 },
      { text: "Ancla comunicacional: 'cuesta menos que una hora de obra perdida'", size: 15 },
      { text: "Formas de pago: PSE · tarjetas · Nequi/Daviplata (independientes)", size: 15 },
      { text: "Pago anual con 2 meses gratis → mejora caja y retención", bold: true, size: 15 },
    ], h: 3.6 },
    { type: "callout", text: "Referencia competitiva: Procore $27–360 M COP/año · Autodesk Build ~$9,9 M/usuario/año · ObraHub $599K–1,8M/año." , border: C.amber, h: 0.95 },
  ]);

  contentSlide(p, "4", "Distribución — 4 componentes", [
    { type: "table", size: 12, rowH: 0.85, header: [hdr("Componente"), hdr("Estrategia")],
      rows: [
        ["Logística", "100% web, entrega inmediata, sin instalación; serverless con despliegue continuo; datos exportables"],
        ["Canal", "Directo self-service (freemium) + partners consultores BIM (20% comisión) + gremios + universidades"],
        ["Experiencia", "Onboarding 3 pasos con plantillas colombianas (APU H-10, cronograma CAMACOL) · bitácora diaria = hábito"],
        [{ text: "Oportunidad", options: { bold: true, color: C.green } }, "Ventana 2026: mandato BIM + recuperación del sector — lanzar en el primer semestre"],
      ] },
  ]);

  contentSlide(p, "5", "Comunicación — medios y publicidad", [
    { type: "bullets", items: [
      { text: "LinkedIn — canal B2B principal del sector", size: 15 },
      { text: "YouTube — tutoriales: 'APU en 5 minutos', 'BIM sin Revit', demos del visor IFC", size: 15 },
      { text: "WhatsApp Business — soporte y relación (canal natural del sector)", size: 15 },
      { text: "Eventos — Camacol, SCI, SCA y universidades", size: 15 },
      { text: "Boletín normativo mensual — cambios NSR/RETIE → posiciona como fuente experta", size: 15 },
    ], h: 3.0 },
    { type: "callout", text: "Identidad: logo nodo/hub · azul #050B14–#3B82F6–#10B981 · Eslogan: \u201CToda tu obra, en un solo lugar.\u201D", border: C.purple, color: C.white, h: 1.0 },
  ]);

  contentSlide(p, "6", "Presupuesto de comunicación (año 1)", [
    { type: "table", size: 13, rowH: 0.52, header: [hdr("Rubro"), hdr("Detalle"), hdr("COP/año")],
      rows: [
        ["Publicidad digital", "LinkedIn + Google Ads ('presupuesto APU', 'software construcción Colombia')", "$3.000.000"],
        ["Contenido y video", "12 tutoriales YouTube + boletín mensual", "$2.000.000"],
        ["Eventos y gremios", "3–4 eventos Camacol/SCI/universidades + material", "$2.500.000"],
        ["Marca y material", "Logo, plantillas, merchandising menor", "$750.000"],
        ["Contingencia", "Reserva 10%", "$825.000"],
        [{ text: "TOTAL", options: { bold: true } }, "", { text: "$9.075.000", options: { bold: true, color: C.green } }],
      ] },
    { type: "text", text: "Autofinanciable para empresa unipersonal; revisión trimestral según costo de adquisición.", size: 12, color: C.muted },
  ]);

  contentSlide(p, "7", "Estrategia general definida", [
    { type: "callout", text: "POSICIONAMIENTO: líder local del \u201CBIM accesible\u201D — entrar por el vacío de precio-cobertura del segmento pyme, sostener la ventaja en la localización normativa y crecer con la comunidad académica que el BIM 2026 obliga a formarse.", h: 1.3, size: 15, color: C.white },
    { type: "bullets", items: [
      { text: "Producto: 4 planes + garantía 30 días + actualización normativa incluida", bold: true },
      { text: "Precio: penetración $49.900–$149.900/mes + anual 2 meses gratis", bold: true },
      { text: "Distribución: self-service + partners + gremios; lanzamiento 1er semestre 2026", bold: true },
      { text: "Comunicación: LinkedIn/YouTube/eventos con $9,075M COP/año", bold: true },
    ], h: 3.2 },
  ]);

  closeSlide(p, "Plan de Marketing definido — las 4P de ObraHub", "Toda tu obra, en un solo lugar.");
  p.writeFile({ fileName: path.join(OUT, "8-presentacion-investigacion-4-plan-marketing.pptx") }).then(() => console.log("OK: 8-...marketing.pptx"));
}

build2();
build3();
build4();
