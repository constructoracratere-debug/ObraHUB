// Siembra el marco normativo esencial de construcción en Colombia.
// Correr: node scripts/seed-normative-framework.mjs
// Usa SUPABASE_SERVICE_ROLE_KEY de .env.local — sin SQL manual.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();

const FRAMEWORK = [
  { norm_type: "ley", number: "400", year: 1997, title: "Ley 400 de 1997 — Normas de diseño y construcción sismorresistente", summary: "Crea el Reglamento Colombiano de Construcción Sismo-Resistente. Base legal de la NSR-10.", affects: [{ nsr_title: "Marco completo" }], published_at: "1997-08-19" },
  { norm_type: "decreto", number: "926", year: 2010, title: "Decreto 926 de 2010 — Adopta la NSR-10 (Reglamento Colombiano de Construcción Sismo-Resistente)", summary: "Texto vigente de la NSR-10: Títulos A (requisos), B (cargas), C (concreto), D (mampostería), E (madera/bahareque), F (estructuras metálicas), H (geotecnia), J (instalaciones).", affects: [{ nsr_title: "Títulos A-J" }], published_at: "2010-03-19" },
  { norm_type: "decreto", number: "1077", year: 2015, title: "Decreto 1077 de 2015 — Decreto Único Reglamentario del Sector Vivienda, Ciudad y Territorio", summary: "Compila urbanismo, licencias de construcción, curadurías urbanas, espacio público y vivienda.", affects: [{ nsr_title: "Licencias (previo a obra)" }], published_at: "2015-05-26" },
  { norm_type: "ley", number: "1797", year: 2016, title: "Ley 1797 de 2016 — Racionalización de trámites de licencias y reconocimiento de edificaciones", summary: "Simplifica licencias de construcción y reconocimiento inmobiliario. Modifica el proceso del Decreto 1077.", affects: [{ nsr_title: "Licencias" }], published_at: "2016-10-19" },
  { norm_type: "ley", number: "2029", year: 2020, title: "Ley 2029 de 2020 — Agilización de licencias y autorizaciones urbanísticas", summary: "Racionaliza el otorgamiento de licencias de construcción: tiempos máximos, silencio administrativo positivo, modalidades simplificadas.", affects: [{ nsr_title: "Licencias" }], published_at: "2020-07-31" },
  { norm_type: "resolucion", number: "0330", year: 2017, title: "Resolución 330 de 2017 (MinVivienda) — Reglamento Técnico del Sector de Agua Potable y Saneamiento Básico (RAS)", summary: "Diseño de acueductos, alcantarillados, treatment y reuso. Reemplaza el RAS 2000. Aplica a instalaciones hidráulicas y sanitarias de proyectos.", affects: [{ nsr_title: "Instalaciones hidrosanitarias (Título J)" }], published_at: "2017-06-27" },
  { norm_type: "resolucion", number: "40139", year: 2021, title: "RETIE — Reglamento Técnico de Instalaciones Eléctricas (texto vigente MinEnergía)", summary: "Requisitos de seguridad de instalaciones eléctricas: puesta a tierra, circuitos, protecciones, distancias de seguridad. Verificar la resolución vigente en el sitio MinEnergía.", affects: [{ nsr_title: "Instalaciones eléctricas (Título J)" }], published_at: "2021-08-30" },
  { norm_type: "decreto", number: "1072", year: 2015, title: "Decreto 1072 de 2015 — Decreto Único Reglamentario del Sector Trabajo (SG-SST)", summary: "Sistema de Gestión de Seguridad y Salud en el Trabajo: obligatorio para toda obra. Incluye matriz de riesgos, capacitación y planes de emergencia.", affects: [{ nsr_title: "Seguridad en obra (complemento)" }], published_at: "2015-05-28" },
  { norm_type: "resolucion", number: "0312", year: 2019, title: "Resolución 312 de 2019 (MinTrabajo) — Estándares mínimos del SG-SST", summary: "Define los estándares mínimos del Sistema de Seguridad y Salud en el Trabajo según tamaño de empresa (incluye construcción).", affects: [{ nsr_title: "Seguridad en obra" }], published_at: "2019-03-21" },
  { norm_type: "resolucion", number: "2400", year: 1979, title: "Resolución 2400 de 1979 — Estatuto de Seguridad Industrial", summary: "Disposiciones sobre vivienda, higiene y seguridad en establecimientos de trabajo — obligatoria en obra (andamios, EPP, orden y aseo).", affects: [{ nsr_title: "Seguridad en obra" }], published_at: "1979-05-22" },
  { norm_type: "ley", number: "9", year: 1979, title: "Código Sanitario Nacional (Ley 9 de 1979)", summary: "Marco sanitario general: agua potable, disposiciones de aguas residuales, residuos sólidos. Antecedente del RAS.", affects: [{ nsr_title: "Instalaciones hidrosanitarias" }], published_at: "1979-01-24" },
  { norm_type: "ley", number: "142", year: 1994, title: "Ley 142 de 1994 — Régimen de Servicios Públicos Domiciliarios", summary: "Marco de acueducto, alcantarillado, aseo y gas. Define prestadores y tarifas — aplica a conexiones de proyectos.", affects: [{ nsr_title: "Conexiones domiciliarias" }], published_at: "1994-07-11" },
  { norm_type: "decreto", number: "1609", year: 2002, title: "Decreto 1609 de 2002 — Transporte de mercancías peligrosas en obra", summary: "Regula el transporte de materiales peligrosos (explosivos de voladura, combustibles, químicos) por carretera.", affects: [{ nsr_title: "Seguridad / logística" }], published_at: "2002-07-31" },
  { norm_type: "resolucion", number: "2184", year: 2018, title: "Resolución 2184 de 2018 — Señalización demarcación vial y dispositivos de seguridad en obra", summary: "Señalización temporal de obras en vías: dispositivos, velocidades y cierres. Obligatoria para obras que afecten espacio público/vías.", affects: [{ nsr_title: "Seguridad vial en obra" }], published_at: "2018-11-21" },
  { norm_type: "decreto", number: "1080", year: 2015, title: "Decreto 1080 de 2015 — Decreto Único Reglamentario del Sector Ambiente y Desarrollo Sostenible", summary: "Compila licencias ambientales, manejo de escombros, árboles y residuos de construcción (RCD).", affects: [{ nsr_title: "Aspectos ambientales de obra" }], published_at: "2015-05-28" },
  { norm_type: "ntc", number: "5551", year: 2008, title: "NTC 5551 — Acero de refuerzo — especificaciones (junto a NTC 2289 barras corrugadas)", summary: "Normas técnicas ICONTEC para acero de refuerzo (NTC 2289), cemento (NTC 121, 321), agregados (NTC 127, 174), ensayos (NTC 673, 1377).", affects: [{ nsr_title: "Título C — Concreto" }], published_at: "2008-07-23" },
];

const res = await fetch(`${URL_}/rest/v1/normative_updates?on_conflict=number,year`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(
    FRAMEWORK.map((f) => ({ ...f, source: "Marco legal colombiano", status: "vigente", relevance: "alta", url: null })),
  ),
});
if (!res.ok) {
  console.error("FAILED", res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.log(`OK — ${rows.length} normas del marco esencial sembradas (relevance=alta).`);
