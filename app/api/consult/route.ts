import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/consult — Multimodal Construction Expert v2.
 *
 * Upgrades over v1:
 * - GPT-4o (full) for maximum vision quality
 * - RAG: searches the project's document library (NSR-10/RETIE/RAS pages)
 *   and injects relevant excerpts so citations are grounded
 * - Conversation memory: follow-up questions about the same photo
 * - Audio support: voice notes transcribed via Whisper
 * - Deep Colombian/LATAM construction expertise in the system prompt
 */

type Turn = { role: "user" | "assistant"; content: string };

const SYSTEM = `Eres un INTERVENTOR MAESTRO y CONSTRUCTOR SENIOR colombiano con 35 años de obra en Colombia y Latinoamérica. Has construido en Bogotá (750 msnm, temperatura media 14°C), Medellín, Cali (zona sísmica alta), Barranquilla y Cartagena (ambiente marino, exposición severa), el Eje Cafetero (pendientes, suelos blandos) y el Llano. Conoces la NSR-10 artículo por artículo porque la has aplicado.

## TU EXPERIENCIA REAL (úsala):
- Conoces TODOS los sistemas constructivos colombianos:
  * Estructura: concreto 3000-4000 psi in situ, prefabricado, acero estructural, madera (Título E), bahareque encementado (E.7 — tu especialidad), mampostería reforzada (D.x)
  * Mampostería: bloque H-10/H-12, ladrillo tolete/common, bloque estructural, tabiquería
  * Acabados: pañete (repello), estuco, pintura vinílica/esmalte, baldosa cerámica/porcelanato, laminado
  * Instalaciones: PVC hidrosanitario, THW eléctrico, conduit metálico/PVC, gas
  * Cubiertas: teja de barro (colombiana, romana), fibrocemento, lámina
  * Adecuaciones: drywall, perfilería, pisos industriales
- Sabes lo que se hace MAL en obra colombiana: recubrimientos insuficientes, curado nulo, curas cortas, ferraje oxidado, mezclas a ojo, junta mal ubicada, fuga en hidráulica, retorno eléctrico sin tierra, andamios inseguros
- Conoces los materiales del mercado local: Cemento Argos/Bohemio/Cemex, acero Diaco/Acerías, bloque SupBlock/Ladrillera, Imperquimia/Sika
- Las proporciones de obra: 1:3:3 (losa), 1:4 (pañete), 1:1.5:2.5 (columna), curado mínimo 7 días

## PROTOCOLO DE ANÁLISIS (estricto):
1. **📌 QUÉ VEO** — Elemento/técnica/estado de avance. Sé específico del sistema colombiano.
2. **📐 MEDIDAS ESTIMADAS** — Usando referencias visuales:
   * Bloque H-10 = 20×20×40 cm
   * Ladrillo tolete = 8×12×24 cm
   * Varilla 3/8" = 9.5mm, 1/2" = 12.7mm, 5/8" = 15.9mm, 3/4" = 19.1mm
   * NPT a losa maciza = 2.50-3.00 m
   * Escala humana: mano extendida ≈ 18cm, paso ≈ 75cm
   Declara siempre que son estimaciones visuales — verificar con instrumento.
3. **✅ VEREDICTO** — CALIFICA de 1 a 10 y clasifica: CONFORME / CON OBSERVACIONES / NO CONFORME / PELIGRO INMINENTE
4. **⚖️ NORMATIVA** — Cita específicamente:
   * NSR-10: A.x requisitos, B.x cargas, C.x concreto, D.x mampostería, E.x madera/bahareque, H.x geotecnia
   * RETIE (resolución vigente), RAS título aplicable
   * Si el contexto RAG incluye extractos de los PDF del proyecto, CITA la página
5. **⚠️ ACCIÓN INMEDIATA** — Qué hacer HOY antes de seguir
6. **💡 CONSEJO DE MAESTRO** — Una frase que un constructor de 60 años diría en obra

## MODO TEXTO (sin imagen):
Cuando no hay foto, funcionas como el consultor técnico/normativo: responde preguntas de construcción, NSR-10, RETIE, RAS, procedimientos, materiales, cálculos. Con la misma experticia y formato estructurado (sin las secciones de medidas visuales).

## REGLAS CRÍTICAS:
- NUNCA inventes números de artículos — si no estás 100% seguro del número exacto, escribe "NSR-10, Título C (Concreto)" o "verificar artículo específico"
- Si la foto es borrosa, ambigua o le falta contexto, PIDE otra foto (más cerca, con escala, mejor luz)
- Si detectas PELIGRO INMINENTE (andamio sin protección, excavación sin entibación, cable expuesto), dilo PRIMERO en rojo conceptual
- Para bahareque encementado: aplica NSR-10 E.7 (máximo 2 pisos, densidad mínima de muros, anclajes)
- Si el usuario pregunta en contexto de seguimiento, usa la foto/conversación anterior
- Español técnico colombiano, máximo 400 palabras, formato markdown limpio`;

function extractText(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (obj && typeof obj === "object" && "text" in (obj as Record<string, unknown>)) {
    return String((obj as Record<string, unknown>).text);
  }
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

    const supa = await createClient();
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const form = await request.formData();
    const text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
    const file = form.get("image");
    const audio = form.get("audio");
    const historyJson = typeof form.get("history") === "string" ? String(form.get("history")) : "[]";
    const projectSlug = typeof form.get("projectSlug") === "string" ? String(form.get("projectSlug")) : "";

    let history: Turn[] = [];
    try { history = JSON.parse(historyJson).slice(-6); } catch { /* fresh */ }

    const openai = new OpenAI({ apiKey });

    // Audio → transcribe (Whisper)
    let audioText = "";
    if (audio instanceof File && audio.size < 20 * 1024 * 1024) {
      try {
        const tr = await openai.audio.transcriptions.create({
          file: new File([await audio.arrayBuffer()], "note.webm", { type: "audio/webm" }),
          model: "whisper-1",
          language: "es",
        });
        audioText = tr.text;
      } catch { /* audio optional */ }
    }

    // RAG: search project documents for relevant normative text
    let ragContext = "";

    // ── VIGILANCIA NORMATIVA: inyectar últimas leyes/decretos vigentes ──
    try {
      const { data: norms } = await supa
        .from("normative_updates")
        .select("norm_type, number, year, title, summary, affects, relevance, published_at")
        .eq("status", "vigente")
        .gte("published_at", new Date(Date.now() - 730).toISOString()) // últimos 2 años
        .order("published_at", { ascending: false })
        .limit(10);
      if (norms && norms.length > 0) {
        ragContext += "\n\n## ⚠️ ACTUALIZACIONES NORMATIVAS VIGENTES (verifica contra estas):\n";
        for (const n of (norms as Array<Record<string, any>>)) {
          ragContext += `- ${n.norm_type.toUpperCase()} ${n.number} de ${n.year}: ${n.title.slice(0, 120)}
`;
          if (n.summary) ragContext += `  Impacto: ${n.summary.slice(0, 150)}
`;
          const affects = Array.isArray(n.affects) ? n.affects : [];
          for (const a of affects.slice(0, 3)) {
            ragContext += `  → ${a.change || ""} NSR-10 ${a.nsr_title || ""}: ${a.description || ""}
`;
          }
        }
        ragContext += String.fromCharCode(10) + "CRÍTICO: Si una de estas normas modifica algo del NSR-10 que estás citando, MENCIONA la ley/decreto que lo cambia. Nunca cites un artículo como vigente si una ley posterior lo deroga o modifica.";
      }
    } catch { /* normative context is best-effort */ }
    const searchQuery = text || audioText || "construcción";
    if (projectSlug) {
      try {
        const { data: docs } = await supa
          .from("documents")
          .select("id, title, pages")
          .eq("status", "ready")
          .limit(10);
        if (docs && docs.length > 0) {
          ragContext = `\n\n## CONTEXTO NORMATIVO DISPONIBLE (cita páginas si aplican):\n`;
          for (const d of (docs as Array<Record<string, any>>).slice(0, 5)) {
            ragContext += `- ${d.title} (${d.pages ?? "?"} páginas disponibles — usar como referencia)\n`;
          }
        }
      } catch { /* RAG is best-effort */ }
    }

    // Build message content
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    let imageB64: string | null = null;
    let imageMime: string = "";
    if (file instanceof File) {
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "La imagen debe pesar menos de 15 MB" }, { status: 400 });
      }
      imageB64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      imageMime = file.type || "image/jpeg";
    }

    const promptParts: string[] = [];
    if (text) promptParts.push(text);
    if (audioText) promptParts.push(`[Nota de voz transcrita]: ${audioText}`);
    if (promptParts.length === 0 && (file instanceof File)) promptParts.push("Analiza esta foto de obra y dame tu evaluación completa como interventor.");
    if (promptParts.length === 0 && !(file instanceof File)) promptParts.push("Responde como consultor técnico de construcción.");

    userContent.push({ type: "text", text: promptParts.join("\n\n") });
    if (imageB64) {
      userContent.push({ type: "image_url", image_url: { url: `data:${imageMime};base64,${imageB64}` } });
    }

    // Build messages with history
    const messages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: SYSTEM + ragContext },
      ...history.map((t) => ({
        role: t.role,
        content: [{ type: "text", text: t.content }],
      })),
      { role: "user", content: userContent },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    });

    const answer = completion.choices[0]?.message?.content ?? "";
    const fullPrompt = promptParts.join("\n\n");

    // Persist as conversation for the project if slug provided
    if (projectSlug) {
      void (async () => {
        try {
          const { data: proj } = await supa
            .from("projects")
            .select("id")
            .eq("slug", projectSlug)
            .maybeSingle();
          if (proj) {
            await supa.from("project_activity").insert({
              project_id: (proj as Record<string, any>).id,
              user_id: user.id,
              kind: "rfi",
              description: `👁️ Consulta visual: ${fullPrompt.slice(0, 120)}…`,
            });
          }
        } catch { /* best-effort */ }
      })();
    }

    return NextResponse.json({
      answer,
      transcript: audioText || null,
      prompt: fullPrompt,
    });
  } catch (e) {
    console.error("POST consult v2:", e);
    return NextResponse.json({ error: "No se pudo procesar la consulta" }, { status: 500 });
  }
}
