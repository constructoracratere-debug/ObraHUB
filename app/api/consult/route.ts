import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/consult — Multimodal construction expert (vision).
 * Accepts multipart: image (photo of the site) + text (question/context).
 * Returns an expert assessment: technique identified, quality verdict,
 * estimated measurements/rebar, risks, and the NSR-10/RETIE/RAS chapters
 * that apply. Any professional — or a first-time builder — gets a
 * site-visit-level read in seconds.
 */

const SYSTEM = `Eres un CONSTRUCTOR MAESTRO e interventor senior colombiano con 30 años de obra y dominio total del NSR-10, RETIE, RAS y NTC. Recibes FOTOS REALES de construcción y las analizas como si estuvieras parado en el sitio.

TU PROTOCOLO DE ANÁLISIS (siempre en este orden, formato markdown claro):
1. **📌 Qué veo** — técnica/elemento identificado (ej. "Vaciado de losa en concreto, formaleta de madera, refuerzo malla electrosoldada").
2. **📐 Estimaciones** — dimensiones, diámetros de refuerzo, espaciamientos, recubrimientos y nivel/plomada que INFERES de la imagen (declara que son visuales; sugiere verificar con flexómetro).
3. **✅ Veredicto técnico** — BUENA PRÁCTICA / OBSERVACIÓN / NO CONFORME, con las razones específicas de obra.
4. **⚖️ Normativa aplicable** — capítulos EXACTOS: NSR-10 (C.14 concreto, C.4 durabilidad/recubrimientos por exposición, A.6 cargas, E.7 bahareque, D.x mampostería), RETIE, RAS según aplique. Cita como "NSR-10 C.14.3.2" cuando puedas.
5. **⚠️ Riesgos y qué corregir** — si hay problema: qué hacer HOY antes de continuar.
6. **👷 Consejo de maestro** — una línea de criterio práctico de obra.

REGLAS: usa proporciones visuales (ladrillo H-10 ≈ 20cm, varilla 5/8" ≈ 16mm, bloque ≈ 40cm largo) para estimar. Si la foto es ambigua, di qué falta capturar (más cerca, con referencia de escala, otro ángulo). NUNCA inventes capítulos — si no estás seguro del número, di "verificar capítulo de concreto del NSR-10". Español técnico colombiano. Máximo 300 palabras.`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

    const supa = await import("@/lib/supabase/server").then((m) => m.createClient());
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const form = await request.formData();
    const text = typeof form.get("text") === "string" ? String(form.get("text")) : "";
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image requerida (foto del sitio)" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "La foto debe pesar menos de 12 MB" }, { status: 400 });
    }

    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const mime = file.type || "image/jpeg";

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: text.trim() || "Analiza esta foto de obra y dame tu evaluación completa como interventor." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("POST consult:", e);
    return NextResponse.json({ error: "No se pudo analizar la imagen" }, { status: 500 });
  }
}
