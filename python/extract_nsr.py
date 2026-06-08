import pdfplumber
import json

pages_data = []
full_text = []

with pdfplumber.open("Documents/NSR10.pdf") as pdf:

    total_pages = len(pdf.pages)

    print(f"Total páginas: {total_pages}")

    for i, page in enumerate(pdf.pages):

        text = page.extract_text()

        if not text:
            text = ""

        pages_data.append({
            "page": i + 1,
            "text": text
        })

        full_text.append(text)

        if (i + 1) % 100 == 0:
            print(f"Procesadas {i + 1} páginas")

with open(
    "Documents/NSR10_pages.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        pages_data,
        f,
        ensure_ascii=False
    )

with open(
    "Documents/NSR10.txt",
    "w",
    encoding="utf-8"
) as f:

    f.write("\n\n".join(full_text))

print("EXTRACCIÓN COMPLETADA")