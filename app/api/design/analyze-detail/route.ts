import { NextRequest, NextResponse } from "next/server";
import { llmJson } from "@/lib/ai/json";
import { AGENT_VISION_DETAIL } from "@/lib/design/knowledge-base";

/**
 * POST /api/design/analyze-detail
 * Recibe una imagen de detalle constructivo (data URL) → GPT-4o la
 * analiza → devuelve el JSON estructurado que alimenta la Biblioteca
 * Constructiva (materiales, dimensiones, técnica, NSR, lección).
 *
 * El bucle: foto de obra real → conocimiento estructurado → mejores
 * planos 2D y modelos IFC con cada imagen acumulada.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image = String(body.image ?? "");
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Se requiere una imagen (data URL)" }, { status: 400 });
    }
    if (image.length > 2_500_000) {
      return NextResponse.json({ error: "Imagen demasiado grande (máx ~1.8 MB tras compresión)" }, { status: 400 });
    }

    const t0 = Date.now();
    const res = await llmJson<Record<string, unknown>>("vision", {
      system: AGENT_VISION_DETAIL,
      user: "Analiza esta foto de detalle constructivo y devuelve el JSON.",
      images: [image],
      maxTokens: 1200,
      temperature: 0.3,
      timeoutMs: 60_000,
    });

    // Normalizar a ConstructionDetail.analysis
    const str = (v: unknown, max = 400) => String(v ?? "").slice(0, max);
    const analysis = {
      titulo: str(res.data.titulo, 120) || "Detalle constructivo",
      descripcion: str(res.data.descripcion, 600),
      materiales: Array.isArray(res.data.materiales) ? res.data.materiales.slice(0, 10).map((m: unknown) => str(m, 120)) : [],
      dimensiones: Array.isArray(res.data.dimensiones) ? res.data.dimensiones.slice(0, 8).map((d: unknown) => str(d, 120)) : [],
      tecnica: str(res.data.tecnica, 800),
      nsrRef: str(res.data.nsrRef, 30),
      leccion: str(res.data.leccion, 300),
      keywords: Array.isArray(res.data.keywords) ? res.data.keywords.slice(0, 8).map((k: unknown) => str(k, 40)) : [],
    };

    return NextResponse.json({
      analysis,
      provider: res.providerLabel,
      model: res.model,
      latencyMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 120) : "Error analizando el detalle" },
      { status: 500 },
    );
  }
}
