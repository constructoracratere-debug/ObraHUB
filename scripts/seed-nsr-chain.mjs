// Siembra TODAS las normas que están por encima o reescriben la NSR-10.
// Fuentes verificadas: Función Pública (Gestor Normativo), MinVivienda,
// Secretaría del Senado, Camacol — agosto 2026.
// Correr: node scripts/seed-nsr-chain.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();

const CHAIN = [
  // ═══ NIVEL LEY (por encima de todo reglamento) ═══
  { norm_type: "ley", number: "400", year: 1997, title: "Ley 400 de 1997 — Normas de diseño y construcción sismorresistente (ley marco)", summary: "Crea el Reglamento Colombiano de Construcción Sismo-Resistente. Base legal de toda la NSR. Todo lo demás la desarrolla o modifica.", affects: [{ nsr_title: "Marco completo", change: "nueva" }], published_at: "1997-08-19" },
  { norm_type: "ley", number: "1229", year: 2008, title: "Ley 1229 de 2008 — Modifica artículos de la Ley 400 de 1997", summary: "Modifica parágrafos de la Ley 400 (responsabilidad y alcance). Ver texto consolidado en Secretaría del Senado.", affects: [{ nsr_title: "Ley 400 (arts. modificados)", change: "modifica" }], published_at: "2008-07-16" },
  { norm_type: "ley", number: "1796", year: 2016, title: "Ley 1796 de 2016 — Ley de Vivienda Segura: protección al comprador, seguridad de edificaciones, interventoría y supervisión técnica", summary: "FORTALECE la Ley 400: revisión INDEPENDIENTE de diseños estructurales, supervisión técnica obligatoria, responsable del diseño estructural en la licencia, y responsabilidad patrimonial del constructor frente al comprador de vivienda.", affects: [{ nsr_title: "Supervisión técnica (Ley 400 cap. V)", change: "modifica" }, { nsr_title: "Revisión independiente de diseños", change: "adiciona" }], published_at: "2016-07-13" },
  { norm_type: "ley", number: "2439", year: 2024, title: "Ley 2439 de 2024 — Modificaciones al Estatuto del Consumidor (Ley 1480 de 2011)", summary: "Refuerza protección al comprador de vivienda nueva: garantías, responsabilidad del constructor/vendedor por vicios. Aplica a entregas de inmuebles a partir de su vigencia.", affects: [{ nsr_title: "Protección comprador (complemento Ley 1796)", change: "adiciona" }], published_at: "2024-08-20" },

  // ═══ DECRETOS QUE MODIFICAN EL NSR-10 (Decreto 926 de 2010) ═══
  { norm_type: "decreto", number: "926", year: 2010, title: "Decreto 926 de 2010 — Adopta la NSR-10 (texto base del Reglamento)", summary: "Expide el Reglamento Colombiano de Construcción Sismo Resistente NSR-10 completo. Modificado por los decretos 2525/2010, 92/2011, 340/2012, 945/2017, 1711/2021 y 1401/2023.", affects: [{ nsr_title: "Títulos A-J", change: "nueva" }], published_at: "2010-03-19" },
  { norm_type: "decreto", number: "2525", year: 2010, title: "Decreto 2525 de 2010 — Modifica el Decreto 926 de 2010 (vigencia)", summary: "Primera modificación al NSR-10: ajusta disposiciones de vigencia y entrada en aplicación del reglamento.", affects: [{ nsr_title: "Vigencia NSR-10", change: "modifica" }], published_at: "2010-07-13" },
  { norm_type: "decreto", number: "92", year: 2011, title: "Decreto 92 de 2011 — Modificaciones técnicas y científicas al NSR-10", summary: "Ajusta ordinales, numerales, literales, figuras, tablas y notas del NSR-10. Regula el Título E para vivienda de 1 y 2 pisos (mampostería confinada y bahareque encementado).", affects: [{ nsr_title: "Título E (vivienda 1-2 pisos)", change: "modifica" }], published_at: "2011-01-19" },
  { norm_type: "decreto", number: "340", year: 2012, title: "Decreto 340 de 2012 — Modificación parcial del NSR-10", summary: "Cambios técnicos al texto del reglamento (incluye ajuste a la Figura K.4.3-0 y numerales varios).", affects: [{ nsr_title: "Ajustes técnicos varios", change: "modifica" }], published_at: "2012-02-13" },
  { norm_type: "decreto", number: "945", year: 2017, title: "Decreto 945 de 2017 — Modificación parcial del NSR-10", summary: "Modificación parcial del reglamento sismorresistente: ajustes técnicos a varios títulos.", affects: [{ nsr_title: "Ajustes técnicos varios", change: "modifica" }], published_at: "2017-06-05" },
  { norm_type: "decreto", number: "1711", year: 2021, title: "Decreto 1711 de 2021 — Modifica el NSR-10: incorpora AIS-610-EP-2017 (Evaluación e Intervención de edificaciones existentes)", summary: "CRÍTICO para remodelaciones: incorpora el documento AIS C-2017 para evaluar y intervenir edificaciones EXISTENTES (refuerzo, rehabilitación, cambio de uso). Aplica a toda intervención de estructura preexistente.", affects: [{ nsr_title: "Título A.10 y anexos (edificaciones existentes)", change: "adiciona" }], published_at: "2021-12-03" },
  { norm_type: "decreto", number: "1401", year: 2023, title: "Decreto 1401 de 2023 — Modifica parcialmente la NSR-10 (última modificación vigente)", summary: "Modificación parcial MÁS RECIENTE del NSR-10: precisa intervenciones que no requieren licencia (mejoras locativas no estructurales) y ajustes al Título E de vivienda de 1-2 pisos.", affects: [{ nsr_title: "Título E + obra menor", change: "modifica" }], published_at: "2023-08-25" },

  // ═══ DEROGADO (contexto histórico) ═══
  { norm_type: "decreto", number: "33", year: 1998, title: "Decreto 33 de 1998 — Adoptaba la NSR-98 (DEROGADA por el Decreto 926 de 2010)", summary: "Texto anterior del reglamento sismorresistente. DEROGADO: nunca citar la NSR-98 como vigente.", affects: [{ nsr_title: "Marco completo", change: "deroga" }], published_at: "1998-01-09" },

  // ═══ REGLAMENTOS PARALELOS QUE REESCRIBEN TÍTULOS ESPECÍFICOS ═══
  { norm_type: "resolucion", number: "0330", year: 2017, title: "Resolución 330 de 2017 (MinVivienda) — RAS: Reglamento Técnico del Sector de Agua Potable", summary: "Reescribe el diseño hidrosanitario (acueducto, alcantarillado, tratamiento). Reemplaza el RAS 2000.", affects: [{ nsr_title: "Instalaciones hidráulicas (complementa Título J)", change: "nueva" }], published_at: "2017-06-27" },
  { norm_type: "resolucion", number: "40139", year: 2021, title: "RETIE — Reglamento Técnico de Instalaciones Eléctricas (texto vigente MinEnergía)", summary: "Reescribe las instalaciones eléctricas: puesta a tierra, protecciones, distancias. Verificar resolución compilada vigente en MinEnergía.", affects: [{ nsr_title: "Instalaciones eléctricas (complementa Título J)", change: "nueva" }], published_at: "2021-08-30" },
  { norm_type: "decreto", number: "1077", year: 2015, title: "Decreto 1077 de 2015 — Decreto Único del Sector Vivienda: licencias y curadurías", summary: "Compila todo el régimen de licencias de construcción y urbanismo. Modificado por Decretos 1230/2020, 1166/2025 (excepciones para subsidios).", affects: [{ nsr_title: "Licencias (antes de obra)", change: "nueva" }], published_at: "2015-05-26" },
  { norm_type: "decreto", number: "1166", year: 2025, title: "Decreto 1166 de 2025 — Excepciones al licenciamiento para subsidios de vivienda", summary: "Excepciones a la licencia para obras bajo subsidios de mejoramiento, vivienda progresiva o construcción.", affects: [{ nsr_title: "Licencias (Decreto 1077)", change: "modifica" }], published_at: "2025-06-27" },
  { norm_type: "ley", number: "2029", year: 2020, title: "Ley 2029 de 2020 — Agilización de licencias urbanísticas", summary: "Racionaliza licencias: tiempos máximos, silencio administrativo positivo, modalidades simplificadas.", affects: [{ nsr_title: "Licencias", change: "modifica" }], published_at: "2020-07-31" },

  // ═══ EN TRÁMITE (post-terremoto 10 de agosto de 2026) ═══
  { norm_type: "otro", number: "PL-2026-NSR", year: 2026, title: "Proyecto de Ley (2026) — Reforma a la Ley 400: actualización obligatoria del NSR cada 5 años + licencia sísmica", summary: "Radicado tras el terremoto del 10-Ago-2026 (M7.4) por la senadora Norma Hurtado: obliga a actualizar el NSR máximo cada 5 años, revisiones periódicas de edificaciones y supervisión técnica obligatoria por vida útil. EN TRÁMITE — no es ley vigente aún. Proyecto paralelo: 'Colombia Construye Seguro'.", affects: [{ nsr_title: "Marco completo (propuesta)", change: "modifica" }], published_at: "2026-08-19" },
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
    CHAIN.map((f) => ({
      ...f,
      source: "Gestor Normativo Función Pública / MinVivienda / Congreso",
      status: f.number === "33" ? "derogada" : f.number === "PL-2026-NSR" ? "en_estudio" : "vigente",
      relevance: "alta",
      url: null,
    })),
  ),
});
if (!res.ok) {
  console.error("FAILED", res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
const byStatus = {};
rows.forEach((r) => (byStatus[r.status] = (byStatus[r.status] ?? 0) + 1));
console.log(`OK — ${rows.length} normas de la cadena NSR sembradas:`, JSON.stringify(byStatus));
process.exit(0);
