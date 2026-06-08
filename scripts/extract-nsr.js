const fs = require("fs");
const pdf = require("pdf-parse");

async function extractPDF() {
  try {
    const pdfPath = "./Documents/Norma-Sismo-Resistente-NSR-10.pdf";

    const dataBuffer = fs.readFileSync(pdfPath);

    console.log("Leyendo PDF...");

    const data = await pdf(dataBuffer);

    console.log("Páginas:", data.numpages);
    console.log("Caracteres:", data.text.length);

    fs.writeFileSync(
      "./Documents/NSR10.txt",
      data.text,
      "utf8"
    );

    console.log("Archivo guardado:");
    console.log("./Documents/NSR10.txt");

  } catch (error) {
    console.error("Error:", error);
  }
}

extractPDF();
