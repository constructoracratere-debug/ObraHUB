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

import { llmComplete, type LlmEvent, type LlmMessage, type LlmTask } from "./router";

export type LlmJsonResult<T> = {
  data: T;
  providerId: string;
  providerLabel: string;
  model: string;
  latencyMs: number;
  repaired: boolean;
};

export type JsonEvent = LlmEvent | { type: "status"; text: string };

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

/** Intenta reparar JSON truncado (recorte por maxTokens): cierra los
 *  contenedores abiertos y reintenta el parse. */
function repairTruncatedJson(s: string): unknown | null {
  // Conteos de contenedores sin cerrar (fuera de strings, aproximado).
  let inStr = false, esc = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (stack.length === 0) return null;
  let fixed = inStr ? s.slice(0, s.lastIndexOf('"')) : s.replace(/[,:\s]+$/, "");
  for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i] === "{" ? "}" : "]";
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

export async function llmJson<T = unknown>(
  task: LlmTask,
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
    /** Presupuesto por proveedor — evita que los fallbacks sumen >60 s (504). */
    timeoutMs?: number;
    /** Consola en vivo: tokens + estados de extracción/reparación. */
    onEvent?: (e: JsonEvent) => void;
  },
): Promise<LlmJsonResult<T>> {
  const messages: LlmMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  const emit = (e: JsonEvent) => params.onEvent?.(e);
  let res = await llmComplete(task, {
    messages,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    responseFormat: "json",
    ...(params.timeoutMs != null ? { timeoutMs: params.timeoutMs } : {}),
    ...(params.onEvent ? { onEvent: params.onEvent } : {}),
  });

  let parsed: unknown;
  try {
    emit({ type: "status", text: "🔧 Extrayendo el objeto JSON de la respuesta…" });
    const candidate = extractJson(res.content);
    if (!candidate) throw new Error("sin objeto JSON en la respuesta");
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // Truncado por maxTokens: cierra contenedores y reintenta.
      emit({ type: "status", text: "♻️ JSON truncado — cerrando contenedores abiertos…" });
      const repaired = repairTruncatedJson(candidate);
      if (repaired == null) throw new Error("JSON incompleto");
      parsed = repaired;
      emit({ type: "status", text: "✅ JSON reparado" });
    }
  } catch {
    // Reintento de reparación: el modelo ve su propio error.
    emit({ type: "status", text: "🔁 La respuesta no fue JSON válido — pidiendo corrección al modelo…" });
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
      ...(params.timeoutMs != null ? { timeoutMs: params.timeoutMs } : {}),
      ...(params.onEvent ? { onEvent: params.onEvent } : {}),
    });
    const candidate = extractJson(rescue.content);
    try {
      parsed = JSON.parse(candidate ?? "null");
      if (parsed == null) parsed = candidate ? repairTruncatedJson(candidate) : null;
    } catch {
      parsed = candidate ? repairTruncatedJson(candidate) : null;
    }
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
