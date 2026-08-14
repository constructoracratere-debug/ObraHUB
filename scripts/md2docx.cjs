// Conversor genérico Markdown → .docx para los informes de Admon 3
// Uso: node scripts/md2docx.cjs <input.md> <output.docx>
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber,
} = require("docx");
const fs = require("fs");

const AZUL = "1E3A8A";
const GRIS = "666666";

// --- Parser inline: **bold** ---
function runs(text, base = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return new TextRun({
      text: m ? m[1] : p.replace(/\*/g, ""),
      bold: m ? true : !!base.bold,
      italics: base.italics,
      size: base.size || 21,
      color: base.color || "0F172A",
    });
  });
}

function mdToBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^---\s*$/.test(line.trim())) { i++; continue; }
    if (line.startsWith("|")) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith("|")) { tbl.push(lines[i]); i++; }
      blocks.push({ type: "table", rows: tbl });
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      blocks.push({ type: `h${level}`, text: line.replace(/^#+\s*/, "") });
      i++; continue;
    }
    if (/^[-*]\s/.test(line)) {
      blocks.push({ type: "bullet", text: line.replace(/^[-*]\s*/, "") });
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
      i++; continue;
    }
    if (line.trim() === "") { i++; continue; }
    // párrafo (una línea = un párrafo)
    blocks.push({ type: "p", text: line });
    i++;
  }
  return blocks;
}

function cellParas(text, opts = {}) {
  // <br> separa líneas dentro de la celda
  const frags = String(text).split(/<br\s*\/?>/i);
  return frags.map((f) =>
    new Paragraph({
      children: runs(f, {
        bold: opts.header || opts.bold,
        size: opts.header ? 19 : (opts.size || 18),
        color: opts.header ? "FFFFFF" : "0F172A",
      }),
      alignment: opts.center ? AlignmentType.CENTER : undefined,
    })
  );
}

function buildTable(rawRows) {
  const parsed = rawRows
    .filter((r) => !/^\|[\s\-|:]+\|\s*$/.test(r)) // quitar separador
    .map((r) => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  if (parsed.length === 0) return null;
  const nCols = Math.max(...parsed.map((r) => r.length));
  const width = Math.floor(100 / nCols);
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
    rows: parsed.map((r, ri) =>
      new TableRow({
        tableHeader: ri === 0,
        children: Array.from({ length: nCols }, (_, ci) =>
          new TableCell({
            width: { size: width, type: WidthType.PERCENTAGE },
            shading: ri === 0 ? { fill: AZUL } : undefined,
            margins: { top: 70, bottom: 70, left: 110, right: 110 },
            children: cellParas(r[ci] ?? "", { header: ri === 0 }),
          })
        ),
      })
    ),
  });
}

function build(mdPath, docxPath, title) {
  const md = fs.readFileSync(mdPath, "utf8");
  const blocks = mdToBlocks(md);

  // Detectar portada: bloques iniciales antes del primer h1 "1. PRESENTACIÓN" o "CONTENIDO"
  const children = [];
  const firstH1 = blocks.findIndex((b) => b.type === "h1");
  blocks.forEach((b, idx) => {
    // portada = todo antes del primer h1 (títulos de portada en el md)
    const inPortada = idx < firstH1;
    switch (b.type) {
      case "h1":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 340, after: 200 },
          children: [new TextRun({ text: b.text, bold: true, size: 30, color: AZUL })],
        }));
        break;
      case "h2":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 260, after: 160 },
          children: [new TextRun({ text: b.text, bold: true, size: 25, color: AZUL })],
        }));
        break;
      case "h3":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 120 },
          children: [new TextRun({ text: b.text, bold: true, size: 22, color: "0F172A" })],
        }));
        break;
      case "bullet":
        children.push(new Paragraph({
          children: runs(b.text),
          bullet: { level: 0 },
          spacing: { after: 90, line: 285 },
        }));
        break;
      case "quote":
        children.push(new Paragraph({
          children: runs(b.text, { italics: true, color: GRIS }),
          spacing: { after: 120, line: 285 },
        }));
        break;
      case "table": {
        const t = buildTable(b.rows);
        if (t) { children.push(t); children.push(new Paragraph({ text: "", spacing: { after: 120 } })); }
        break;
      }
      default: {
        // portada: centrada y jerarquizada
        if (inPortada) {
          const isBig = /INFORME|INVESTIGACIÓN|MERCADO|MERCADOTECNIA|PLAN/i.test(b.text) && b.text === b.text.toUpperCase();
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: isBig ? 140 : 60 },
            children: runs(b.text, {
              size: isBig ? 28 : 22,
              bold: isBig || /UNIVERSIDAD|FACULTAD|ADMINISTRACIÓN/.test(b.text) && b.text === b.text.toUpperCase(),
              color: isBig ? AZUL : "0F172A",
            }),
          }));
        } else {
          children.push(new Paragraph({
            children: runs(b.text),
            spacing: { after: 160, line: 300 },
          }));
        }
      }
    }
  });

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "ObraHub · Administración de la Edificación III · Grupo IX B — pág. ", size: 16, color: GRIS }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS }),
      ],
    })],
  });

  const doc = new Document({
    creator: "Diego Orlando Pineda Escobar",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ properties: {}, footers: { default: footer }, children }],
  });

  return Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(docxPath, buf); console.log("OK:", docxPath); });
}

const [, , mdPath, docxPath, title] = process.argv;
build(mdPath, docxPath, title || "Informe Admon 3").catch((e) => { console.error(e); process.exit(1); });
