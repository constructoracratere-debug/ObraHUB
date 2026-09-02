/**
 * ✏️ llmJson — JSON confiable desde cualquier LLM de la cadena `structure`.
 *
 * Estrategia (primera vez que se usa la cadena "structure" del router):
 * 1. Pide response_format json_object al proveedor primario (OpenAI).
 * 2. Extracción robusta: strip de ```json fences + slice primer { → último }.
 * 3. Si el parse falla: 1 reintento con mensaje de corrección (el propio
 *    contenido roto + "devuelve SOLO JSON válido").
 * Nunca lanza por JSON malformado sin agotar el reintento.
 */

import { llmComplete, type LlmMessage, type LlmTask } from "./router";

export type LlmJsonResult<T> = {
  data: T;
  providerId: string;
  providerLabel: string;
  model: string;
  latencyMs: number;
  repaired: boolean;
};

/** Extrae el primer objeto JSON balanceado de un texto ruidoso. */
export function extractJson(raw: string): string | null {
  let s = raw.trim();
  // Fences ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

export async function llmJson<T = unknown>(
  task: LlmTask,
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<LlmJsonResult<T>> {
  const messages: LlmMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  let res = await llmComplete(task, {
    messages,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    responseFormat: "json",
  });

  let parsed: unknown;
  try {
    const candidate = extractJson(res.content);
    if (!candidate) throw new Error("sin objeto JSON en la respuesta");
    parsed = JSON.parse(candidate);
  } catch {
    // Reintento de reparación: el modelo ve su propio error.
    const rescue = await llmComplete(task, {
      messages: [
        ...messages,
        { role: "assistant", content: res.content.slice(0, 4000) },
        {
          role: "user",
          content:
            "Tu respuesta anterior no es JSON válido. Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto antes ni después) que cumpla el esquema pedido.",
        },
      ],
      maxTokens: params.maxTokens,
      temperature: 0,
      responseFormat: "json",
    });
    const candidate = extractJson(rescue.content);
    parsed = JSON.parse(candidate ?? "null");
    res = rescue;
    if (parsed == null) throw new Error("El modelo no pudo producir JSON válido tras reintento");
    return {
      data: parsed as T,
      providerId: res.providerId,
      providerLabel: res.providerLabel,
      model: res.model,
      latencyMs: res.latencyMs,
      repaired: true,
    };
  }

  return {
    data: parsed as T,
    providerId: res.providerId,
    providerLabel: res.providerLabel,
    model: res.model,
    latencyMs: res.latencyMs,
    repaired: false,
  };
}
