// Convierte docs/universidad/*.md → un solo .docx académico profesional.
// Uso: node scripts/build-universidad-docx.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, TableOfContents,
  Header, Footer, PageNumber, NumberFormat, ShadingType, convertMillimetersToTwip,
} from "docx";

const DIR = new URL("../docs/universidad/", import.meta.url);
const DIR_PATH = fileURLToPath(DIR).replace(/[\/]+$/, "");

const AZUL = "1F3A5F";
const GRIS = "444444";

// ── parseo markdown mínimo ──
function inlineRuns(text, base = {}) {
  // **bold** → TextRun bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) =>
    p.startsWith("**") && p.endsWith("**")
      ? new TextRun({ text: p.slice(2, -2), bold: true, ...base })
      : new TextRun({ text: p, ...base }),
  );
}

function mdToBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) { // código: saltar
      i++; while (i < lines.length && !/^```/.test(lines[i])) i++; i++; continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1])) {
      // tabla
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: "h", level, text: line.replace(/^#+\s*/, "") });
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({ type: "li", text: line.replace(/^\s*[-*]\s+/, "") });
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { i++; continue; }
    if (line.trim() === "") { i++; continue; }
    // párrafo (une líneas siguientes que no sean especiales)
    let buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|\||\s*[-*]\s|---+$|```)/.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

function blockToDocx(b, opts = {}) {
  if (b.type === "h") {
    const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][b.level];
    return new Paragraph({
      heading: H,
      spacing: { before: b.level === 1 ? 360 : 240, after: 140, line: 312 },
      children: inlineRuns(b.text, { color: b.level === 1 ? AZUL : GRIS, size: b.level === 1 ? 32 : b.level === 2 ? 26 : 24, bold: true }),
      pageBreakBefore: opts.pageBreakBefore && b.level === 1,
    });
  }
  if (b.type === "li") {
    return new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 60, line: 312 },
      children: inlineRuns(b.text, { size: 22 }),
    });
  }
  if (b.type === "table") {
    const mkCell = (txt, isHead) =>
      new TableCell({
        width: { size: Math.floor(9000 / Math.max(1, b.header.length)), type: WidthType.DXA },
        shading: isHead ? { type: ShadingType.CLEAR, fill: AZUL, color: "auto" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          spacing: { line: 276 },
          children: inlineRuns(txt, { size: 20, bold: isHead, color: isHead ? "FFFFFF" : "1A1A1A" }),
        })],
      });
    return new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: b.header.map((h) => mkCell(h, true)) }),
        ...b.rows.map((r) => new TableRow({ cantSplit: true, children: b.header.map((_, ci) => mkCell(r[ci] ?? "", false)) })),
      ],
    });
  }
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: inlineRuns(b.text, { size: 22 }),
  });
}

// ── portada académica ──
const cover = [
  new Paragraph({ spacing: { before: 2400 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "CORPORACIÓN UNIVERSITARIA UNICOLMAYOR", bold: true, size: 24, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Constructor y Gestor en Arquitectura", size: 22, color: GRIS })] }),
  new Paragraph({ spacing: { before: 1400 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "OBRahUB", bold: true, size: 72, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Construction Operating System para Colombia y Latinoamérica", size: 30, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2000 }, children: [new TextRun({ text: "Anteproyecto · Plan de Negocios · Estudio Financiero · Cronograma", size: 22, italics: true, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Diego Orlando Pineda Escobar", bold: true, size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Powered by Cratere S.A.S.", size: 22, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Bogotá D.C. — 2026", size: 22, color: GRIS })] }),
];

// ── cuerpo: los 4 documentos ──
const files = readdirSync(DIR_PATH).filter((f) => f.endsWith(".md")).sort();
const body = [];
body.push(
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 200 }, children: [new TextRun({ text: "CONTENIDO", bold: true, color: AZUL })] }),
  new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Nota: haga clic derecho sobre el índice → “Actualizar campos” para refrescar la paginación.", italics: true, size: 18, color: "888888" })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

for (const f of files) {
  const md = readFileSync(join(DIR_PATH, f), "utf8");
  const blocks = mdToBlocks(md);
  let firstH1 = true;
  for (const b of blocks) {
    body.push(blockToDocx(b, { pageBreakBefore: firstH1 }));
    if (b.type === "h" && b.level === 1) firstH1 = false;
  }
  if (f !== files[files.length - 1]) body.push(new Paragraph({ children: [new PageBreak()] }));
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  features: { updateFields: true },
  sections: [{
    properties: { page: { margin: { top: convertMillimetersToTwip(25), bottom: convertMillimetersToTwip(25), left: convertMillimetersToTwip(28), right: convertMillimetersToTwip(25) } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "OBRahUB — Documentos de Grado", size: 16, color: "999999" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT], size: 16, color: "999999" })] })] }) },
    children: [...cover, new Paragraph({ children: [new PageBreak()] }), ...body],
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(new URL("../docs/universidad/OBRahUB-Documentos-Universidad.docx", import.meta.url), buf);
console.log("OK — OBRahUB-Documentos-Universidad.docx generado (" + Math.round(buf.length / 1024) + " KB)");
process.exit(0);
