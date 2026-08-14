// Genera los archivos entregables de Admon 3: matriz .xlsx
// (Word y PowerPoint se generan en scripts separados)
const ExcelJS = require("exceljs");
const path = require("path");

const OUT = "C:/ObraHub/docs/admon3";

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Diego Orlando Pineda Escobar";
  const ws = wb.addWorksheet("Matriz Iniciativas", {
    properties: { defaultRowHeight: 18 },
  });

  // Título
  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = "Plantilla de Criterios - Administración de la Edificación III";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = "CURSO: IX-B   ·   DOCENTE: Carlos Alberto Corrales Medina   ·   2026-2   ·   Estudiante: Diego Orlando Pineda Escobar";
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getCell("A2").font = { size: 10, color: { argb: "FF666666" } };

  // Encabezados criterios
  const headerRow = 4;
  ws.getCell(`A${headerRow}`).value = "CRITERIO (Calificar de 1 a 10)";
  ws.mergeCells(`A${headerRow}:B${headerRow}`);
  ws.getCell(`C${headerRow}`).value = "INICIATIVA 1: ObraHub — Sistema Operativo de la Construcción con integración BIM";
  ws.getCell(`D${headerRow}`).value = "INICIATIVA 2 (reserva): Consultoría BIM para pymes";
  ws.getCell(`E${headerRow}`).value = "INICIATIVA 3 (reserva): Base de datos de precios de insumos";
  for (const col of ["A", "C", "D", "E"]) {
    const c = ws.getCell(`${col}${headerRow}`);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  ws.getRow(headerRow).height = 34;

  const data = [
    ["Demanda potencial",
      "Que se perciba un amplio grupo de clientes potenciales que tengan la necesidad de este tipo de producto o servicio.",
      "9 — El sector emplea ~1,5 millones de personas (6,9% del empleo nacional, DANE) y agrupa miles de firmas constructoras (pymes, arquitectos, interventores) que gestionan obras con herramientas fragmentadas. La Estrategia Nacional BIM que culmina en 2026 amplia la demanda a todo el ecosistema constructor, incluidos subcontratistas de obra pública.",
      "7", "6"],
    ["Innovador",
      "El producto o servicio debe presentar un diferenciador que marque diferencia con los productos o servicios sustitutos del mercado (materiales, características, funcionalidad, proceso, uso de tecnología, atributos y beneficios).",
      "9 — (1) Visualiza modelos IFC nativamente en el navegador (WebAssembly) sin licencias de escritorio; (2) genera APU con IA sobre base de precios colombiana (AIU 22%, IVA 19%) — ningún competidor internacional incluye normativa colombiana; (3) consultas normativas NSR-10/RETIE con IA y respuestas citadas; (4) vínculo BIM 4D modelo↔cronograma. Integra 4 herramientas en una sola plataforma local.",
      "5", "4"],
    ["Realizable",
      "La iniciativa debe estar dentro de las posibilidades de que los emprendedores puedan hacer un prototipo.",
      "8 — El prototipo ya está construido y desplegado en producción (obra-hub-gray.vercel.app), desarrollado por el estudiante con tecnologías web estándar (Next.js, Supabase, web-ifc, Three.js). Costo de mantenimiento bajo (serverless). Pendiente: escalar base de precios y formalizar la empresa.",
      "9", "7"],
    ["Relación con la construcción",
      "La iniciativa debe estar dentro del ámbito de las actividades del sector de la construcción.",
      "10 — 100% endógena al sector: presupuestación de obra (APU), programación y seguimiento (Gantt y bitácora), gestión documental de planos DWG/DXF y modelos BIM (IFC), y cumplimiento normativo constructivo (NSR-10, RETIE, RETILAP, RAS).",
      "10", "10"],
  ];

  let r = headerRow + 1;
  for (const [criterio, definicion, just, n2, n3] of data) {
    ws.getCell(`A${r}`).value = criterio;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`C${r}`).value = `${just}`;
    ws.getCell(`C${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`D${r}`).value = n2;
    ws.getCell(`E${r}`).value = n3;
    ws.getCell(`D${r}`).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(`E${r}`).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 96;
    // Definición del criterio debajo
    ws.getCell(`A${r + 1}`).value = definicion;
    ws.mergeCells(`A${r + 1}:B${r + 1}`);
    ws.getCell(`A${r + 1}`).font = { size: 9, italic: true, color: { argb: "FF666666" } };
    ws.getCell(`A${r + 1}`).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(`D${r + 1}:E${r + 1}`);
    r += 2;
  }

  // Totales
  ws.getCell(`A${r}`).value = "TOTAL";
  ws.getCell(`A${r}`).font = { bold: true };
  ws.mergeCells(`A${r}:B${r}`);
  ws.getCell(`C${r}`).value = "36 / 40 — INICIATIVA SELECCIONADA PARA EL PROYECTO DE GRADO";
  ws.getCell(`C${r}`).font = { bold: true, color: { argb: "FF10B981" } };
  ws.getCell(`D${r}`).value = "31 / 40";
  ws.getCell(`E${r}`).value = "27 / 40";
  for (const col of ["A", "C", "D", "E"]) {
    ws.getCell(`${col}${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  }
  ws.getCell(`D${r}`).alignment = { horizontal: "center" };
  ws.getCell(`E${r}`).alignment = { horizontal: "center" };

  // Conclusión
  r += 2;
  ws.mergeCells(`A${r}:E${r + 1}`);
  ws.getCell(`A${r}`).value =
    "CONCLUSIÓN: La iniciativa 1 (ObraHub) obtiene la mayor calificación (36/40) y se consolida como la iniciativa a desarrollar: máxima relación con el sector de la construcción, alto diferenciador tecnológico, demanda creciente por el mandato BIM 2026 y un prototipo ya en funcionamiento que acredita su realizabilidad.";
  ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };

  ws.getColumn("A").width = 24;
  ws.getColumn("B").width = 30;
  ws.getColumn("C").width = 70;
  ws.getColumn("D").width = 14;
  ws.getColumn("E").width = 16;

  const file = path.join(OUT, "3-matriz-iniciativas.xlsx");
  await wb.xlsx.writeFile(file);
  console.log("OK:", file);
}

main().catch((e) => { console.error(e); process.exit(1); });
