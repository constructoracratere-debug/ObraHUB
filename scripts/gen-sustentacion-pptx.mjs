// Genera la presentación de sustentación (.pptx) — estilo ObraHub (dark navy).
// Uso: node scripts/gen-sustentacion-pptx.mjs
import pptxgen from "pptxgenjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "universidad", "OBRahUB-Sustentacion.pptx");

const C = {
  bg: "0A1120", panel: "111B2E", blue: "3B82F6", cyan: "38BDF8", green: "10B981",
  amber: "F59E0B", purple: "8B5CF6", red: "F87171", text: "E2E8F0",
  muted: "94A3B8", white: "FFFFFF", line: "1E293B",
};

const p = new pptxgen();
p.author = "Diego Orlando Pineda Escobar";
p.company = "Cratere S.A.S. · ObraHub";
p.title = "OBRahUB — Sustentación de grado";
p.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
p.layout = "WIDE";

const bar = (s, color = C.blue) => s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color } });
const foot = (s, n) => {
  s.addText(`OBRahUB · Sustentación`, { x: 0.8, y: 7.05, w: 6, h: 0.4, fontSize: 11, color: C.muted });
  s.addText(`${n} / 15`, { x: 12.0, y: 7.05, w: 0.8, h: 0.4, fontSize: 11, color: C.muted, align: "right" });
};

function slide(num, title, kicker, color = C.blue) {
  const s = p.addSlide();
  s.background = { color: C.bg };
  bar(s, color);
  s.addText(kicker.toUpperCase(), { x: 0.8, y: 0.45, w: 11, h: 0.4, fontSize: 13, color, bold: true, charSpacing: 2 });
  s.addText(title, { x: 0.8, y: 0.85, w: 11.7, h: 0.9, fontSize: 30, color: C.white, bold: true });
  foot(s, num);
  return s;
}

const bullet = (t, opts = {}) => ({ text: t, options: { bullet: true, fontSize: 17, color: C.text, ...opts } });
const box = (s, x, y, w, h, fill = C.panel) => s.addShape("roundRect", { x, y, w, h, fill: { color: fill }, rectRadius: 0.08, line: { color: C.line } });

// 1 · Portada
{
  const s = p.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color: C.blue } });
  s.addShape("rect", { x: 0, y: 7.36, w: 13.33, h: 0.14, fill: { color: C.blue } });
  s.addText("TRABAJO DE GRADO · UNICOLMAYOR · 2026", { x: 0.8, y: 1.5, w: 11.7, h: 0.5, fontSize: 15, color: C.cyan, bold: true, charSpacing: 3 });
  s.addText("OBRahUB", { x: 0.8, y: 2.1, w: 11.7, h: 1.5, fontSize: 76, color: C.white, bold: true });
  s.addText("Sistema operativo de construcción con IA multiagente — del lenguaje natural a la licencia de construcción", { x: 0.8, y: 3.7, w: 11.7, h: 1.0, fontSize: 22, color: C.text });
  s.addText("Diego Orlando Pineda Escobar\nCratere S.A.S. · Corporación Universitaria Colmayor", { x: 0.8, y: 5.4, w: 11.7, h: 0.9, fontSize: 16, color: C.muted });
}

// 2 · Problema
{
  const s = slide(2, "La obra colombiana se gesta en Excel y WhatsApp", "El problema", C.red);
  box(s, 0.8, 1.9, 5.7, 4.6);
  box(s, 6.85, 1.9, 5.65, 4.6);
  s.addText("Hoy (fragmentado)", { x: 1.1, y: 2.1, w: 5, h: 0.5, fontSize: 18, color: C.red, bold: true });
  s.addText([
    bullet("Presupuestos en hojas de cálculo que se desvían"),
    bullet("Bitácora en papel o fotos sueltas de WhatsApp"),
    bullet("Planos y licencias: semanas y alto costo"),
    bullet("Cero trazabilidad para interventoría"),
    bullet("Procore/ACC: USD 100-410 por usuario, en inglés, sin NSR-10"),
  ], { x: 1.1, y: 2.6, w: 5.1, h: 3.6, valign: "top" });
  s.addText("Costo del desorden", { x: 7.15, y: 2.1, w: 5, h: 0.5, fontSize: 18, color: C.amber, bold: true });
  s.addText([
    bullet("$91,78 billones facturó el sector en 2025 — productividad muy por debajo del potencial"),
    bullet("12.000 MIPYME constructoras + 180.000 independientes sin herramienta integral"),
    bullet("La licencia de construcción es el cuello de botella del formalismo y de la VIS"),
  ], { x: 7.15, y: 2.6, w: 5.1, h: 3.6, valign: "top" });
}

// 3 · Solución
{
  const s = slide(3, "Un sistema operativo de la construcción, en español y con norma colombiana", "La solución", C.green);
  const tools = [
    ["📁", "Documentos", "Visores IFC 3D y DXF nativos,ZIP import"],
    ["✏️", "Diseño IA", "Estudio multiagente → lámina de licencia"],
    ["💰", "Costos", "Presupuestos APU con precios vivos"],
    ["📊", "Seguimiento", "Gantt + 4D vinculado a elementos BIM"],
    ["📔", "Bitácora", "Diaria digital con evidencia"],
    ["📈", "Control", "Curva S, SPI/CPI, informes"],
  ];
  tools.forEach(([icon, t, d], i) => {
    const x = 0.8 + (i % 3) * 4.05, y = 1.95 + Math.floor(i / 3) * 2.3;
    box(s, x, y, 3.85, 2.05);
    s.addText(icon, { x: x + 0.2, y: y + 0.18, w: 0.8, h: 0.7, fontSize: 26 });
    s.addText(t, { x: x + 0.95, y: y + 0.25, w: 2.7, h: 0.5, fontSize: 17, color: C.white, bold: true });
    s.addText(d, { x: x + 0.25, y: y + 0.95, w: 3.4, h: 0.95, fontSize: 13, color: C.muted });
  });
}

// 4 · La joya: estudio multiagente
{
  const s = slide(4, "El estudio de diseño: 7 agentes, 1 profesional al mando", "El aporte central", C.purple);
  const steps = [
    ["📍", "Urbanista", "POT, clima, vientos, materiales de la zona"],
    ["🏛️", "Arquitecto", "Planta + memoria de diseño justificada"],
    ["👷🏗️", "Constructor ∥ Ing. Civil", "Materiales locales · sistema NSR-10"],
    ["📐", "Adaptación", "Redibuja con retícula del ingeniero"],
    ["⚡💧", "Eléctrico ∥ Hidro", "RETIE · RAS"],
    ["🎨", "Interiores", "Acabados y equipos"],
  ];
  steps.forEach(([icon, t, d], i) => {
    const x = 0.8 + (i % 3) * 4.05, y = 1.9 + Math.floor(i / 3) * 1.55;
    box(s, x, y, 3.85, 1.35, C.panel);
    s.addText(icon, { x: x + 0.15, y: y + 0.12, w: 0.7, h: 0.6, fontSize: 20 });
    s.addText(t, { x: x + 0.8, y: y + 0.12, w: 2.9, h: 0.45, fontSize: 15, color: C.white, bold: true });
    s.addText(d, { x: x + 0.8, y: y + 0.55, w: 2.95, h: 0.7, fontSize: 12, color: C.muted });
  });
  box(s, 0.8, 5.15, 11.7, 1.3, "0F2A1E");
  s.addText("El profesional (arquitecto/ingeniero/constructor) revisa, sugiere y el arquitecto redibuja — con registro de cambios. La responsabilidad intelectual sigue siendo humana.", { x: 1.05, y: 5.35, w: 11.2, h: 0.95, fontSize: 15, color: C.green, italic: true });
}

// 5 · Filosofía: IA piensa, motores dibujan
{
  const s = slide(5, "«La IA piensa, los motores dibujan»", "Cómo eliminamos la alucinación", C.cyan);
  const flow = [
    ["🗣️", "Lenguaje natural", "\"Casa 2 pisos, 3 alcobas, 85 m², Bogotá\""],
    ["🧠", "Agentes → JSON", "Esquema estricto sanitizado (clamps, cm)"],
    ["🛡️", "Puertas de verificación", "Mínimos Neufert/NTC · NSR-10 A.6 · RETIE · RAS"],
    ["🖨️", "Motores determinísticos", "SVG · DXF R12 por capas · expediente"],
  ];
  flow.forEach(([icon, t, d], i) => {
    const x = 0.8 + i * 3.13;
    box(s, x, 2.2, 2.85, 2.6);
    s.addText(icon, { x: x + 0.15, y: 2.4, w: 1, h: 0.7, fontSize: 24 });
    s.addText(t, { x: x + 0.2, y: 3.1, w: 2.45, h: 0.7, fontSize: 14, color: C.white, bold: true });
    s.addText(d, { x: x + 0.2, y: 3.7, w: 2.45, h: 1.0, fontSize: 11.5, color: C.muted });
    if (i < 3) s.addText("→", { x: x + 2.82, y: 3.2, w: 0.5, h: 0.6, fontSize: 24, color: C.cyan, bold: true });
  });
  s.addText("Misma entrada → mismo byte de salida. 28/28 pruebas del motor DXF en verde, determinismo verificado.", { x: 0.8, y: 5.5, w: 11.7, h: 0.7, fontSize: 15, color: C.cyan, italic: true });
}

// 6 · La lámina
{
  const s = slide(6, "La lámina completa de curaduría, en minutos", "El entregable", C.blue);
  box(s, 0.8, 1.9, 6.6, 4.7, "071020");
  s.addText("🗂️ LÁMINA GENERADA", { x: 1.1, y: 2.1, w: 6, h: 0.5, fontSize: 16, color: C.blue, bold: true });
  s.addText([
    bullet("Planta(s) por nivel con ejes estructurales"),
    bullet("Cortes A-A' y B-B' con marcas de nivel ▲"),
    bullet("4 fachadas: parapeto, doble marco, puertas"),
    bullet("Cuadro de áreas con totales"),
    bullet("Poché 45° · flecha norte · escala gráfica · cajetín"),
    bullet("Convenciones Ching + dimensiones Neufert/Plazola/Panero", { fontSize: 14 }),
  ], { x: 1.1, y: 2.6, w: 6.0, h: 3.8, valign: "top" });
  box(s, 7.7, 1.9, 4.8, 4.7, "1A0F2A");
  s.addText("EXPEDIENTE (documento)", { x: 8.0, y: 2.1, w: 4.3, h: 0.5, fontSize: 16, color: C.green, bold: true });
  s.addText([
    bullet("Memoria de diseño (viento, luz, orientación)"),
    bullet("Memoria estructural NSR-10"),
    bullet("Memorias RETIE y RAS"),
    bullet("Materiales, método y acabados"),
    bullet("Checklist de radicación: F.U.N., CTL, suelos, firmas"),
  ], { x: 8.0, y: 2.6, w: 4.2, h: 3.4, valign: "top" });
  s.addText("Descargable como DXF por capas (AutoCAD/LibreCAD) — verificado en el visor propio", { x: 0.8, y: 6.7, w: 11.7, h: 0.5, fontSize: 13, color: C.muted, italic: true });
}

// 7 · Consola viva (experiencia)
{
  const s = slide(7, "El usuario VE a los agentes trabajar", "Experiencia", C.amber);
  box(s, 0.8, 1.95, 11.7, 4.4, "050B14");
  s.addText([
    { text: "📍 📚 Revisando marco del POT, clima y vientos…\n", options: { fontSize: 16, color: C.text } },
    { text: "🏛️ 📐 Dimensionando con la tabla Neufert/Plazola…\n", options: { fontSize: 16, color: C.text } },
    { text: "⚡ GPT-4.1-mini está pensando…\n", options: { fontSize: 16, color: C.cyan } },
    { text: "▎{ \"name\": \"Habitación 2\", \"x\": 2.85, ▊\n", options: { fontSize: 16, color: "34D399" } },
    { text: "⚠ Gemini saturado → MiniMax entra (failover narrado)\n", options: { fontSize: 16, color: C.amber } },
    { text: "🛡️ Puerta de verificación 1: 7 observaciones\n", options: { fontSize: 16, color: C.text } },
    { text: "✏️ 9 cambio(s) aplicado(s) — planta redibujada con tus sugerencias", options: { fontSize: 16, color: C.green } },
  ], { x: 1.15, y: 2.25, w: 11, h: 3.6, valign: "top", lineSpacingMultiple: 1.4 });
  s.addText("Streaming token a token + reintentos automáticos: cero \"modelos saturados, intente de nuevo\"", { x: 0.8, y: 6.55, w: 11.7, h: 0.5, fontSize: 13, color: C.muted });
}

// 8 · Mercado (4 segmentos)
{
  const s = slide(8, "Cuatro segmentos, una hoja de ruta", "Mercado", C.blue);
  const segs = [
    ["🏗️", "Constructoras", "Top-10: $16,6 B en 2025 (Metro Línea 1, Marval, Amarilo…). MIPYME Camacol = ICP", "SaaS por obra: 150-800k COP/mes", C.amber],
    ["🏛️", "Gubernamentales", "MinTIC · MinVivienda · ANI · INVÍAS · Findeter · MinEducación · Alcaldías", "SECOP II: 50-200M COP/año", C.blue],
    ["🏢", "Privadas", "Uniandes · Javeriana · EAFIT · clínicas · corporativo — todos en expansión", "Licencia por obra: 20-60M COP", C.purple],
    ["👷", "Independientes", "180.000 multi-proyecto (obra gris, remodeladores, interventores…)", "Freemium → Pro 49-99k/mes", C.green],
  ];
  segs.forEach(([icon, t, d, m, col], i) => {
    const x = 0.8 + (i % 2) * 5.95, y = 1.9 + Math.floor(i / 2) * 2.35;
    box(s, x, y, 5.7, 2.1);
    s.addText(icon, { x: x + 0.18, y: y + 0.15, w: 0.7, h: 0.6, fontSize: 22 });
    s.addText(t, { x: x + 0.85, y: y + 0.18, w: 4.5, h: 0.45, fontSize: 16, color: C.white, bold: true });
    s.addText(d, { x: x + 0.85, y: y + 0.62, w: 4.7, h: 0.85, fontSize: 11.5, color: C.muted });
    s.addText(m, { x: x + 0.85, y: y + 1.5, w: 4.7, h: 0.45, fontSize: 12.5, color: col, bold: true });
  });
}

// 9 · Competencia
{
  const s = slide(9, "Por qué no nos aplastan los gigantes", "Competencia", C.red);
  s.addText([
    bullet("Procore / ACC: USD 375-410 por usuario/mes — inglés, sin NSR-10, sin APU local", {}),
    bullet("Apps locales puntuales: una sola función, sin circuito completo", {}),
    bullet("Excel: gratis… hasta la primera desviación del 15%", {}),
  ], { x: 0.8, y: 2.0, w: 11.7, h: 1.9, valign: "top" });
  box(s, 0.8, 4.1, 11.7, 2.3, "0F2A1E");
  s.addText("Foso defensivo", { x: 1.1, y: 4.3, w: 5, h: 0.5, fontSize: 17, color: C.green, bold: true });
  s.addText([
    bullet("Barrera normativa colombiana difícil de replicar desde el exterior"),
    bullet("Base de precios APU vivos alimentada por la comunidad"),
    bullet("Costo serverless ~10× menor: podemos cobrar 1/10 y seguir con margen"),
  ], { x: 1.1, y: 4.8, w: 11, h: 1.5, valign: "top" });
}

// 10 · Modelo de negocio
{
  const s = slide(10, "Cómo se hace dinero", "Modelo de negocio", C.green);
  const rows = [
    ["Segmento", "Producto", "Precio"],
    ["Independientes (volumen)", "Freemium → Pro mensual", "COP 49-99k/mes"],
    ["MIPYME constructoras", "SaaS por obra activa", "COP 150-300k/mes"],
    ["Constructoras grandes", "Plan Obra + interventoría", "COP 400-800k/mes"],
    ["Instituciones privadas", "Licencia por proyecto / académica", "COP 20-60M por obra"],
    ["Sector público", "Convenio anual SECOP", "COP 50-200M/año"],
  ];
  const table = rows.map((r, i) => r.map((c, j) => ({
    text: c, options: {
      fontSize: i === 0 ? 14 : 15, bold: i === 0, color: i === 0 ? C.cyan : (j === 2 ? C.green : C.text),
      fill: { color: i === 0 ? C.panel : (i % 2 ? "0D1526" : C.bg) }, align: j === 2 ? "right" : "left", valign: "middle",
    },
  })));
  s.addTable(table, { x: 0.8, y: 2.0, w: 11.7, rowH: 0.62, border: { pt: 1, color: C.line } });
  s.addText("Meta 24 meses: COP 30-50M MRR (fase 2) → contratos anuales 200M+ (fase 3)", { x: 0.8, y: 6.1, w: 11.7, h: 0.5, fontSize: 15, color: C.amber, bold: true });
}

// 11 · Demo / producto vivo
{
  const s = slide(11, "No es un mockup: está en producción", "Producto", C.cyan);
  s.addText([
    bullet("Desplegado en Vercel con integración continua — cada función verificada E2E en navegador"),
    bullet("Generación real verificada: \"VIS 2 alcobas 52 m² Manizales\" → lámina completa en minutos"),
    bullet("Visor IFC: selección táctil con halo, simulación 4D, extracción de cantidades"),
    bullet("Router LLM: GPT-4.1-mini primario + failover gratuito narrado en vivo"),
    bullet("Arquitectura serverless: Next.js · Supabase · Postgres + Storage · Vercel"),
  ], { x: 0.8, y: 2.1, w: 11.7, h: 3.2, valign: "top" });
  box(s, 0.8, 5.5, 11.7, 1.1, C.panel);
  s.addText("obra-hub-cratere.vercel.app", { x: 0.8, y: 5.7, w: 11.7, h: 0.6, fontSize: 22, color: C.cyan, bold: true, align: "center", fontFace: "Consolas" });
}

// 12 · Roadmap
{
  const s = slide(12, "De la lámina al ciclo de vida completo", "Roadmap", C.purple);
  const ph = [
    ["✓ Fase 1", "Plataforma núcleo: visores, APU, Gantt+4D, bitácora, control", C.green],
    ["✓ Fase 2", "Estudio multiagente + lámina de licencia DXF + expediente", C.green],
    ["→ Fase 3", "Modelo IFC 3D desde el mismo JSON (BIM verificable en visor propio)", C.purple],
    ["Fase 4", "Pasaporte de materiales y vida útil (sostenibilidad, economía circular)", C.blue],
    ["Fase 5", "Canal estatal (SECOP) y desmonte/vida útil como plataforma pública", C.cyan],
  ];
  ph.forEach(([t, d, col], i) => {
    const y = 1.95 + i * 0.95;
    s.addShape("circle", { x: 1.0, y: y + 0.12, w: 0.35, h: 0.35, fill: { color: col } });
    s.addText(t, { x: 1.55, y, w: 1.8, h: 0.6, fontSize: 16, color: col, bold: true });
    s.addText(d, { x: 3.4, y, w: 9.2, h: 0.6, fontSize: 15, color: C.text });
  });
}

// 13 · Impacto
{
  const s = slide(13, "Impacto: no solo software", "Impacto", C.green);
  s.addText([
    bullet("Democratiza el paquete de licencia: la VIS y los municipios intermedios acceden a diseño con estándares"),
    bullet("Formaliza la gestión de obra con evidencia auditable (transparencia pública)"),
    bullet("El profesional mantiene la responsabilidad intelectual: la IA asiste, no firma"),
    bullet("Educación: licencia académica gratuita para facultades de ingeniería y arquitectura"),
    bullet("Origen colombiano: soberanía tecnológica en un mercado dominado por extranjeros"),
  ], { x: 0.8, y: 2.1, w: 11.7, h: 4.0, valign: "top" });
}

// 14 · Conclusiones
{
  const s = slide(14, "Conclusiones", "Cierre", C.blue);
  s.addText([
    bullet("Es posible unificar diseño-costo-programa-control-licencia en una plataforma serverless de bajo costo con norma colombiana."),
    bullet("«La IA piensa, los motores dibujan» elimina la alucinación geométrica: geometría determinística, reproducible y auditable."),
    bullet("El bucle de revisión humana es la clave de la adopción profesional y del marco de responsabilidad."),
    bullet("El mercado (4 segmentos, top-10 identificado por segmento) valida un modelo multimodal de ingresos."),
    bullet("Línea futura inmediata: IFC 3D desde el mismo formato intermedio y pilotos con curadurías."),
  ], { x: 0.8, y: 2.1, w: 11.7, h: 4.2, valign: "top" });
}

// 15 · Gracias
{
  const s = p.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color: C.green } });
  s.addText("Gracias", { x: 0.8, y: 2.6, w: 11.7, h: 1.4, fontSize: 60, color: C.white, bold: true });
  s.addText("¿Preguntas? — Demo en vivo disponible", { x: 0.8, y: 4.2, w: 11.7, h: 0.8, fontSize: 22, color: C.green });
  s.addText("Diego Orlando Pineda Escobar · Cratere S.A.S. · constructoracratere@gmail.com", { x: 0.8, y: 6.3, w: 11.7, h: 0.5, fontSize: 14, color: C.muted });
}

p.writeFile({ fileName: OUT }).then(() => console.log("✅ Presentación generada:", OUT));
