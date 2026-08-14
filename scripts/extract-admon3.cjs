// Extrae texto de los materiales de clase de Admon 3
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DL = "C:/Users/sofya/Downloads";
const OUT = "C:/ObraHub/docs/admon3-material";
fs.mkdirSync(OUT, { recursive: true });

async function extractPdf(file, outName) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(file)) });
    const result = await parser.getText();
    fs.writeFileSync(path.join(OUT, outName), result.text);
    console.log(`OK PDF: ${outName} (${result.text.length} chars)`);
    await parser.destroy();
  } catch (e) {
    console.log(`ERR PDF ${file}: ${e.message}`);
  }
}

function extractZipXml(file, outName, kind) {
  try {
    const tmp = path.join(OUT, "_tmp_" + path.parse(file).name.replace(/\s+/g, "_"));
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    execSync(`unzip -o -q "${file}" -d "${tmp}"`, { shell: true });

    let text = "";
    if (kind === "docx") {
      const xml = fs.readFileSync(path.join(tmp, "word/document.xml"), "utf8");
      text = xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n");
    } else if (kind === "pptx") {
      const slides = fs.readdirSync(path.join(tmp, "ppt/slides")).filter(f => f.endsWith(".xml")).sort((a,b)=>{
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
      for (const s of slides) {
        const xml = fs.readFileSync(path.join(tmp, "ppt/slides", s), "utf8");
        const slideText = xml
          .replace(/<\/a:p>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        text += `=== ${s} ===\n${slideText}\n\n`;
      }
    } else if (kind === "xlsx") {
      // sheet names + shared strings
      let shared = [];
      const ssPath = path.join(tmp, "xl/sharedStrings.xml");
      if (fs.existsSync(ssPath)) {
        const ss = fs.readFileSync(ssPath, "utf8");
        shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
          m[1].replace(/<[^>]+>/g, "")
        );
      }
      const sheetsDir = path.join(tmp, "xl/worksheets");
      const sheets = fs.readdirSync(sheetsDir).filter(f => f.endsWith(".xml")).sort();
      for (const sh of sheets) {
        const xml = fs.readFileSync(path.join(sheetsDir, sh), "utf8");
        text += `=== HOJA ${sh} ===\n`;
        const rows = [...xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
        for (const row of rows) {
          const cells = [...row[2].matchAll(/<c[^>]*r="([A-Z]+\d+)"[^>]*?(?:t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>)?/g)];
          const line = cells.map(c => {
            if (c[2] === "s" && c[3] != null) return shared[parseInt(c[3])] ?? "";
            return c[3] ?? "";
          }).filter(Boolean).join(" | ");
          if (line.trim()) text += `${row[1]}: ${line}\n`;
        }
        text += "\n";
      }
    }
    fs.writeFileSync(path.join(OUT, outName), text);
    console.log(`OK ${kind.toUpperCase()}: ${outName} (${text.length} chars)`);
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    console.log(`ERR ${kind} ${file}: ${e.message}`);
  }
}

(async () => {
  // Esquemas PDF
  await extractPdf(path.join(DL, "2 ESQUEMA PRESENTACION INFORME INVESTIGACIÓN DE MERCADOS ANÁLISIS DE SEGMENTO.pdf"), "esquema-2-segmento.txt");
  await extractPdf(path.join(DL, "3 ESQUEMA PRESENTACION INFORME INVESTIGACIÓN DE MERCADOS ANÁLISIS DE LA COMPETENCIA.pdf"), "esquema-3-competencia.txt");
  await extractPdf(path.join(DL, "4 ESQUEMA PRESENTACION INFORME INVESTIGACIÓN DE MERCADOS PLAN DE MERKETING (1).pdf"), "esquema-4-marketing.txt");

  // Esquema 1 docx
  extractZipXml(path.join(DL, "1 ESQUEMA PRESENTACION INFORME INVESTIGACIÓN DE MERCADOS SECTOR ECONOMICO DE LA CONSTRUCCIÓN.docx"), "esquema-1-sector.txt", "docx");

  // Presentación clase
  extractZipXml(path.join(DL, "Presentación Admon de la Edificación III 2026.pptx"), "presentacion-clase.txt", "pptx");

  // Matriz iniciativas
  extractZipXml(path.join(DL, "Copia de Matriz Criterios Iniciativas 2026-2.xlsx"), "matriz-iniciativas.txt", "xlsx");

  console.log("\n--- LISTO ---");
})();
