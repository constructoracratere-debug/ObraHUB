// Presentación ObraHub — pitch para auditorio (1000 personas)
// Tema oscuro premium coherente con la app. Tipografía grande, poco texto.
const pptxgen = require("pptxgenjs");

const DARK = "0A1120", CARD = "0F1A2E", ACCENT = "0EA5E9", GOOD = "10B981",
      WARN = "F59E0B", WHITE = "FFFFFF", SOFT = "94A3B8", MUT = "64748B";
const W = 13.33, H = 7.5;
const p = new pptxgen();
p.defineLayout({ name: "W", width: W, height: H });
p.layout = "W";
p.author = "Diego Orlando Pineda Escobar";
p.title = "ObraHub — Construction OS para Colombia";

const bg = (s) => (s.background = { color: DARK });
const brand = (s, n) => {
  s.addText("ObraHub", { x: 0.55, y: 6.9, w: 3, fontSize: 11, bold: true, color: ACCENT, charSpacing: 3 });
  if (n) s.addText(String(n).padStart(2, "0"), { x: 12.3, y: 6.85, w: 0.7, fontSize: 11, color: MUT, align: "right" });
};
const kicker = (s, t) => s.addText(t.toUpperCase(), { x: 0.6, y: 0.5, w: 9, fontSize: 13, bold: true, color: ACCENT, charSpacing: 4 });
const h1 = (s, t, y = 1.0, size = 40) => s.addText(t, { x: 0.6, y, w: 12.1, fontSize: size, bold: true, color: WHITE, lineSpacing: size * 1.15 });
const card = (s, x, y, w, h) => {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: CARD }, line: { color: "1E293B", width: 1 }, rectRadius: 0.12 });
};


const demoSlide = (n, imgPath, title, sub) => {
  const d = p.addSlide(); bg(d); brand(d, n);
  kicker(d, "El producto, en vivo");
  d.addText(title, { x: 0.6, y: 0.95, w: 12.1, fontSize: 30, bold: true, color: WHITE });
  if (sub) d.addText(sub, { x: 0.6, y: 1.62, w: 12.1, fontSize: 13, color: SOFT });
  d.addShape(p.ShapeType.roundRect, { x: 1.71, y: 2.05, w: 9.95, h: 4.85, fill: { color: "060B14" }, line: { color: ACCENT, width: 1 }, rectRadius: 0.08 });
  d.addImage({ path: imgPath, x: 1.78, y: 2.12, w: 9.8, h: 4.7, sizing: { type: "contain", w: 9.8, h: 4.7 } });
};

/* 1 — PORTADA */
let s = p.addSlide(); bg(s);
s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: DARK } });
s.addShape(p.ShapeType.ellipse, { x: 8.2, y: -2.6, w: 9, h: 9, fill: { color: "0B2545", transparency: 40 }, line: { type: "none" } });
s.addText("ObraHub", { x: 0.8, y: 2.1, w: 11.7, fontSize: 88, bold: true, color: WHITE, charSpacing: 6 });
s.addText("El sistema operativo de obra para Colombia", { x: 0.85, y: 3.75, w: 11.5, fontSize: 26, color: SOFT });
s.addShape(p.ShapeType.roundRect, { x: 0.85, y: 4.55, w: 0.09, h: 0.9, fill: { color: ACCENT }, line: { type: "none" } });
s.addText([
  { text: "BIM · Costos · Cronograma · Bitácora · Control", options: { breakLine: true, color: ACCENT, bold: true } },
  { text: "De la idea a la asamblea — en un solo lugar", options: { color: MUT } },
], { x: 1.15, y: 4.6, w: 10, fontSize: 16, lineSpacing: 26 });
s.addText("Diego Orlando Pineda Escobar · Ing. Constructor\nConstructora Crateré S.A.S. · 2026", { x: 0.85, y: 6.45, w: 10, fontSize: 12, color: MUT, lineSpacing: 18 });

/* 2 — EL PROBLEMA */
s = p.addSlide(); bg(s); brand(s, 2);
kicker(s, "El problema");
h1(s, "La obra colombiana se gestiona\nen Excel, WhatsApp y carpetas.");
const probs = [
  ["📉", "PIB edificaciones\n-7,5% (2025)", "Sector en contracción: cada peso cuenta"],
  ["🏠", "Déficit habitacional\n25,6% de hogares", "Presión enorme por construir mejor"],
  ["💸", "Procore / Autodesk\nUSD 300–500 × usuario/mes", "Clase mundial, inalcanzable para PYMEs"],
  ["📎", "Bitácora dispersa\nsin evidencia", "Asambleas sin datos, reclamos sin soporte"],
];
probs.forEach(([icon, t, d], i) => {
  const x = 0.6 + (i % 4) * 3.13;
  card(s, x, 2.7, 2.9, 3.2);
  s.addText(icon, { x: x + 0.25, y: 2.95, w: 1, fontSize: 28 });
  s.addText(t, { x: x + 0.25, y: 3.55, w: 2.4, fontSize: 15, bold: true, color: WHITE, lineSpacing: 20 });
  s.addText(d, { x: x + 0.25, y: 4.75, w: 2.4, fontSize: 11, color: SOFT, lineSpacing: 15 });
});

/* 3 — LA SOLUCIÓN */
s = p.addSlide(); bg(s); brand(s, 3);
kicker(s, "La solución");
h1(s, "Un Construction Operating System\npara la PYME constructora.");
s.addText("Todo lo que una obra necesita, en el navegador,\nsin instalar nada y en español técnico colombiano.", { x: 0.6, y: 2.6, w: 11, fontSize: 18, color: SOFT, lineSpacing: 26 });
const tools = [["📁", "Documentos", "Planos · Revit 300MB · IFC · DWG"], ["💰", "Costos", "APU con IA y precios con fuente"], ["📊", "Cronograma", "Gantt con dependencias e hitos"], ["📔", "Bitácora", "Clima, personal y avance diario"], ["📈", "Control", "Curva S · SPI/CPI · alertas"], ["⚖️", "Normativa", "NSR-10 y más, con citas por página"]];
tools.forEach(([ic, t, d], i) => {
  const x = 0.6 + (i % 3) * 4.18, y = 3.7 + Math.floor(i / 3) * 1.45;
  card(s, x, y, 3.95, 1.25);
  s.addText(ic, { x: x + 0.22, y: y + 0.3, w: 0.7, fontSize: 22 });
  s.addText([{ text: t + "\n", options: { bold: true, color: WHITE, fontSize: 15 } }, { text: d, options: { color: SOFT, fontSize: 11 } }], { x: x + 0.95, y: y + 0.18, w: 2.9, h: 1, lineSpacing: 17 });
});

demoSlide(4, "../docs/producto/img/herramientas-miembros.png", "Tu proyecto, tus herramientas, tu equipo", "Seis herramientas en el orden real de obra — e invitación al equipo por correo con roles.");

/* 5 — BIM */
s = p.addSlide(); bg(s); brand(s, 7);
kicker(s, "BIM nativo");
h1(s, "El modelo BIM habla\nde dinero y de tiempo.", 1.0, 44);
s.addText("3D · 4D · 5D — como los grandes, al precio de una PYME.", { x: 0.6, y: 2.75, w: 11, fontSize: 18, color: SOFT });
const bims = [["🧊", "Visor 3D en el navegador", "Sube el IFC, orbítalo, aísla por clase, inspecciona propiedades de cada elemento."], ["🔗", "Vínculos 4D", "Conecta elementos del modelo con tareas y reproduce la construcción en el tiempo."], ["💵", "Cantidades 5D", "El APU nace de las cantidades reales del modelo — presupuesto auditable desde el BIM."]];
bims.forEach(([ic, t, d], i) => {
  const y = 3.35 + i * 1.15;
  card(s, 0.6, y, 12.1, 1.0);
  s.addText(ic, { x: 0.9, y: y + 0.25, w: 0.7, fontSize: 22 });
  s.addText([{ text: t + "   ", options: { bold: true, color: WHITE, fontSize: 16 } }, { text: d, options: { color: SOFT, fontSize: 13 } }], { x: 1.7, y: y + 0.22, w: 10.6, lineSpacing: 19, valign: "middle" });
});

/* 5 — EL CIRCUITO */
s = p.addSlide(); bg(s); brand(s, 8);
kicker(s, "El circuito completo");
h1(s, "De la primera piedra a la\nasamblea del viernes.");
const steps = ["BIM\nModelo", "💰 APU\nPresupuesto", "📊 Gantt\nCronograma", "📔 Bitácora\nRealidad diaria", "📈 Curva S\nValor ganado", "🚨 Alertas\nEvidencia", "📊 PPTX\nAsamblea"];
steps.forEach(([t], i) => {
  const x = 0.55 + i * 1.79;
  s.addShape(p.ShapeType.roundRect, { x, y: 3.3, w: 1.6, h: 1.6, fill: { color: CARD }, line: { color: ACCENT, width: i === 6 ? 2 : 0.75 }, rectRadius: 0.14 });
  s.addText(t, { x, y: 3.3, w: 1.6, h: 1.6, align: "center", valign: "middle", fontSize: 13, bold: true, color: WHITE, lineSpacing: 16 });
  if (i < 6) s.addText("→", { x: x + 1.56, y: 3.72, w: 0.35, fontSize: 18, color: ACCENT, align: "center" });
});
s.addText("El viernes nadie navega seis herramientas:\nun botón genera el informe completo de la obra.", { x: 0.6, y: 5.5, w: 12, fontSize: 17, color: SOFT, align: "center", lineSpacing: 24 });

/* 6 — CONTROL */
s = p.addSlide(); bg(s); brand(s, 9);
kicker(s, "Control de obra");
h1(s, "El idioma de las asambleas:\nSPI, CPI y la verdad.");
const kpis = [["11,8%", "Avance real", GOOD], ["19,9%", "Avance plan", ACCENT], ["0,59", "SPI · atrasado", "EF4444"], ["23 ago", "Fin proyectado", WARN], ["5 h", "Lluvia (plazo)", ACCENT]];
kpis.forEach(([v, l, c], i) => {
  const x = 0.6 + i * 2.51;
  card(s, x, 2.9, 2.28, 1.7);
  s.addText(v, { x, y: 3.1, w: 2.28, align: "center", fontSize: 28, bold: true, color: c });
  s.addText(l, { x, y: 3.95, w: 2.28, align: "center", fontSize: 12, color: SOFT });
});
card(s, 0.6, 5.0, 12.1, 1.35);
s.addText([
  { text: "🚨 Alertas con evidencia y recomendación:  ", options: { bold: true, color: WHITE, fontSize: 15 } },
  { text: "tarea vencida · SPI bajo · lluvia acumulada (fuerza mayor) · bitácora sin registrar · estancamiento — listas para leer en la reunión.", options: { color: SOFT, fontSize: 14 } },
], { x: 0.95, y: 5.15, w: 11.4, lineSpacing: 21, valign: "middle" });

demoSlide(8, "../docs/producto/img/bitacora-diaria.png", "Bitácora diaria: la realidad de obra capturada", "Clima y lluvia, personal, equipo y avance por tarea — el registro legal que alimenta todo el sistema.");

demoSlide(9, "../docs/producto/img/control-curva-s.png", "Control de Obra: Curva S y valor ganado", "Avance real vs plan, SPI, fin proyectado y alertas — generado solo, desde la bitácora.");

/* 10 — COLABORACIÓN */
s = p.addSlide(); bg(s); brand(s, 10);
kicker(s, "Trabajo en equipo");
h1(s, "Invita a tu obra completa\ncon un correo.");
const roles = [["👀 Viewer", "Consulta todo, sin editar"], ["✏️ Editor", "Trabaja el proyecto completo"], ["🛡️ Admin", "Además gestiona el equipo"]];
roles.forEach(([t, d], i) => {
  const x = 0.6 + i * 4.18;
  card(s, x, 2.9, 3.95, 1.8);
  s.addText(t, { x: x + 0.3, y: 3.15, w: 3.3, fontSize: 20, bold: true, color: WHITE });
  s.addText(d, { x: x + 0.3, y: 3.85, w: 3.3, fontSize: 13, color: SOFT });
});
s.addText("Seguridad a nivel de base de datos (RLS): cada usuario solo ve\nlo que le corresponde. Sin excepciones.", { x: 0.6, y: 5.3, w: 12, fontSize: 16, color: SOFT, align: "center", lineSpacing: 23 });

/* 8 — DIFERENCIADOR */
s = p.addSlide(); bg(s); brand(s, 11);
kicker(s, "Por qué ganamos");
h1(s, "Clase mundial, precio PYME.");
card(s, 0.6, 2.5, 5.9, 3.6);
s.addText("ELLOS", { x: 0.95, y: 2.75, fontSize: 14, bold: true, color: MUT, charSpacing: 3 });
s.addText([{ text: "Procore · Autodesk · Glodon\n", options: { bold: true, color: WHITE, fontSize: 17 } }, { text: "USD 300–500 / usuario / mes\nEnterprise, inglés, semanas de implantación\nBIM o control: rara vez ambos", options: { color: SOFT, fontSize: 14 } }], { x: 0.95, y: 3.2, w: 5.2, lineSpacing: 24 });
card(s, 6.85, 2.5, 5.9, 3.6);
s.addText("ObraHub", { x: 7.2, y: 2.75, fontSize: 14, bold: true, color: ACCENT, charSpacing: 3 });
s.addText([{ text: "Todo el circuito en uno\n", options: { bold: true, color: WHITE, fontSize: 17 } }, { text: "BIM 3D/4D/5D + bitácora + asamblea\nEspañol técnico: NSR-10 · APU · AIU · COP\nCero instalación — abre y trabaja", options: { color: SOFT, fontSize: 14 } }], { x: 7.2, y: 3.2, w: 5.2, lineSpacing: 24 });
s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 6.25, w: 12.1, h: 0.55, fill: { color: "062033" }, line: { color: ACCENT, width: 0.75 }, rectRadius: 0.1 });
s.addText("APUs con fuente de precio, rendimiento y desperdicio — estándar de licitación pública.", { x: 0.6, y: 6.25, w: 12.1, h: 0.55, align: "center", valign: "middle", fontSize: 13, color: ACCENT });

/* 9 — HOY */
s = p.addSlide(); bg(s); brand(s, 12);
kicker(s, "Hoy, en producción");
h1(s, "No es un prototipo.\nEs un producto vivo.");
const tr = [["6", "herramientas"], ["64", "commits verificadas"], ["18", "formatos de archivo"], ["15+", "tablas con RLS"], ["1", "clic → PPTX asamblea"], ["∞", "proyectos por usuario"]];
tr.forEach(([v, l], i) => {
  const x = 0.6 + (i % 3) * 4.18, y = 2.9 + Math.floor(i / 3) * 1.6;
  card(s, x, y, 3.95, 1.35);
  s.addText(v, { x: x + 0.3, y: y + 0.12, w: 1.5, fontSize: 34, bold: true, color: ACCENT });
  s.addText(l, { x: x + 1.7, y: y + 0.2, w: 2.1, fontSize: 14, color: SOFT, valign: "middle", lineSpacing: 18 });
});

/* 10 — ROADMAP */
s = p.addSlide(); bg(s); brand(s, 13);
kicker(s, "Hacia dónde va");
h1(s, "De herramienta a ecosistema.");
const road = [["AHORA", "Beta con constructoras reales", "Fotos en bitácora · exportación total · móvil", ACCENT],
  ["SIGUIENTE", "Obra Go — contrataciones", "La base de profesionales se vuelve marketplace", GOOD],
  ["HORIZONTE", "Inteligencia predictiva + LATAM", "Riesgo de desviación por IA · México precargado", WARN]];
road.forEach(([k, t, d, c], i) => {
  const y = 2.8 + i * 1.35;
  card(s, 0.6, y, 12.1, 1.15);
  s.addShape(p.ShapeType.roundRect, { x: 0.85, y: y + 0.3, w: 2.1, h: 0.55, fill: { color: c }, rectRadius: 0.1 });
  s.addText(k, { x: 0.85, y: y + 0.3, w: 2.1, h: 0.55, align: "center", valign: "middle", fontSize: 12, bold: true, color: DARK });
  s.addText([{ text: t + "\n", options: { bold: true, color: WHITE, fontSize: 16 } }, { text: d, options: { color: SOFT, fontSize: 12 } }], { x: 3.3, y: y + 0.15, w: 9, lineSpacing: 18 });
});

/* 11 — RESPALDO */
s = p.addSlide(); bg(s); brand(s, 14);
kicker(s, "Quién está detrás");
h1(s, "Construido desde la obra,\npara la obra.");
card(s, 0.6, 2.9, 12.1, 2.6);
s.addText([
  { text: "Diego Orlando Pineda Escobar\n", options: { bold: true, color: WHITE, fontSize: 22 } },
  { text: "Fundador de ObraHub", options: { color: ACCENT, bold: true, fontSize: 16 } },
], { x: 1.0, y: 3.15, w: 11.3, lineSpacing: 30 });
const creds = [
  ["Tecnólogo en Construcción Arquitectónica", "UGC"],
  ["Ingeniero Constructor", "ITC · México"],
  ["Constructor y Gestor en Arquitectura", "UNICOLMAYOR"],
];
creds.forEach(([t, inst], i) => {
  const y = 4.05 + i * 0.55;
  s.addText([{ text: "🎓  " }, { text: t + "  —  ", options: { bold: true, color: WHITE, fontSize: 14 } }, { text: inst, options: { color: ACCENT, fontSize: 14 } }], { x: 1.0, y, w: 11, h: 0.5, valign: "middle" });
});
s.addText("Constructora Crateré S.A.S. — ejecución real de obra detrás de cada función", { x: 1.0, y: 5.75, w: 11, fontSize: 12, color: SOFT });

/* 12 — CIERRE */
s = p.addSlide(); bg(s);
s.addShape(p.ShapeType.ellipse, { x: -3, y: 3.4, w: 10, h: 10, fill: { color: "0B2545", transparency: 45 }, line: { type: "none" } });
s.addText("La obra ya generó los datos.\nNosotros los convertimos\nen decisiones.", { x: 0.8, y: 2.0, w: 11.7, fontSize: 40, bold: true, color: WHITE, align: "center", lineSpacing: 52 });
s.addText("ObraHub", { x: 0.8, y: 4.9, w: 11.7, fontSize: 20, bold: true, color: ACCENT, align: "center", charSpacing: 6 });
s.addText("constructoracratere@gmail.com · ObraHub 2026", { x: 0.8, y: 5.45, w: 11.7, fontSize: 13, color: SOFT, align: "center" });

p.writeFile({ fileName: "../docs/producto/presentacion-obrahub-v2.pptx" }).then(() => console.log("OK: ../docs/producto/presentacion-obrahub-v2.pptx"));
