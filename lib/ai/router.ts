import OpenAI from "openai";

/**
 * 🧠 Enrutador multi-LLM de ObraHub.
 *
 * Estrategia: modelos GRATUITOS (freemium) para el volumen de texto y
 * OpenAI pagado solo para lo complejo (visión GPT-4o, tareas estructuradas).
 *
 * Todos los proveedores exponen APIs compatibles con OpenAI, así que reusamos
 * el SDK oficial cambiando `baseURL` + modelo. Si un proveedor falla, se agota
 * la cuota gratuita o se tarda demasiado, la cadena salta al siguiente.
 *
 * Llaves (todas OPCIONALES salvo OPENAI; la cadena se adapta a lo que haya):
 *   OPENAI_API_KEY      — pagado, calidad máxima (gpt-4o visión, gpt-4.1-mini)
 *   GEMINI_API_KEY      — gratis: gemini-2.5-flash, 1M tokens de contexto, visión
 *                          (Google AI Studio: aistudio.google.com/apikey)
 *   OPENROUTER_API_KEY  — gratis: Kimi K2, DeepSeek V3, GLM, Llama (openrouter.ai)
 *   DASHSCOPE_API_KEY   — gratis: Qwen (Alibaba, contiene cuota gratuita)
 *   XAI_API_KEY         — Grok barato (api.x.ai)
 */

export type LlmTask = "chat" | "docs" | "vision" | "structure";

type ProviderSpec = {
  id: string;
  label: string;
  baseURL?: string;
  apiKey?: string;
  model: string;
  paid: boolean;
  timeoutMs: number;
  /** Header extra (OpenRouter pide referer para ranking público). */
  defaultHeaders?: Record<string, string>;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://obra-hub-diego-pineda-s-projects.vercel.app";

function gemini(): ProviderSpec {
  return {
    id: "gemini",
    label: "Gemini 3.6 Flash (gratis)",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    paid: false,
    timeoutMs: 20_000,
  };
}

function openrouter(model: string, label: string): ProviderSpec {
  return {
    id: `openrouter:${model}`,
    label,
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    model,
    paid: false,
    timeoutMs: 25_000,
    defaultHeaders: { "HTTP-Referer": APP_URL, "X-Title": "ObraHub" },
  };
}

function dashscope(): ProviderSpec {
  return {
    id: "dashscope",
    label: "Qwen Plus (gratis)",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.DASHSCOPE_API_KEY,
    model: process.env.QWEN_MODEL ?? "qwen-plus",
    paid: false,
    timeoutMs: 20_000,
  };
}

function xai(): ProviderSpec {
  return {
    id: "xai",
    label: "Grok 4 Fast",
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL ?? "grok-4-fast",
    paid: false,
    timeoutMs: 20_000,
  };
}

function openai(model: string, label: string, timeoutMs: number): ProviderSpec {
  return {
    id: `openai:${model}`,
    label,
    apiKey: process.env.OPENAI_API_KEY,
    model,
    paid: true,
    timeoutMs,
  };
}

/** Cadena de proveedores por tarea — el primero que responda gana. */
export function providerChain(task: LlmTask): ProviderSpec[] {
  // Slugs free verificados contra el catálogo vivo de OpenRouter (ago/2026).
  const orGlm = openrouter(process.env.OPENROUTER_FREE_MODEL ?? "z-ai/glm-5.2:free", "GLM 5.2 (gratis)");
  const orMiniMax = openrouter(process.env.OPENROUTER_FREE_MODEL_2 ?? "minimax/minimax-m3:free", "MiniMax M3 (gratis)");
  const orNemotron = openrouter("nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super (gratis)");

  switch (task) {
    // Biblioteca normativa: texto puro, mucho volumen → gratis primero.
    case "chat":
      return [gemini(), orGlm, orMiniMax, dashscope(), xai(), orNemotron, openai("gpt-4.1-mini", "GPT-4.1-mini (pagado)", 30_000)];
    // Documentos largos: Gemini y MiniMax M3 ofrecen 1M de contexto gratis.
    case "docs":
      return [gemini(), orMiniMax, orNemotron, openai("gpt-4.1-mini", "GPT-4.1-mini (pagado)", 45_000)];
    // Visión (fotos de obra): la mejor lectura de imágenes manda — GPT-4o.
    case "vision":
      return [openai("gpt-4o", "GPT-4o (pagado)", 55_000), gemini()];
    // JSON estructurado (APU, cronogramas): fiabilidad ante todo.
    case "structure":
      return [openai("gpt-4.1-mini", "GPT-4.1-mini (pagado)", 40_000), orGlm, orMiniMax];
  }
}

const clientCache = new Map<string, OpenAI>();

function clientFor(spec: ProviderSpec): OpenAI {
  const cacheKey = `${spec.id}:${spec.apiKey?.slice(-6) ?? ""}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;
  const client = new OpenAI({
    apiKey: spec.apiKey,
    baseURL: spec.baseURL,
    defaultHeaders: spec.defaultHeaders,
  });
  clientCache.set(cacheKey, client);
  return client;
}

export type LlmMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export type LlmResult = {
  content: string;
  providerId: string;
  providerLabel: string;
  model: string;
  latencyMs: number;
  failures: Array<{ provider: string; error: string }>;
};

/**
 * Ejecuta un chat completion recorriendo la cadena de la tarea hasta que un
 * proveedor responda. Lanza solo si TODOS fallan (los manejadores de ruta ya
 * muestran el error al usuario).
 */
export async function llmComplete(
  task: LlmTask,
  params: {
    messages: LlmMessage[];
    maxTokens?: number;
    temperature?: number;
    /** Modo JSON estricto — solo proveedores compatibles lo usan (ver llmJson). */
    responseFormat?: "json";
  },
): Promise<LlmResult> {
  const chain = providerChain(task).filter((p) => p.apiKey);
  if (chain.length === 0) {
    throw new Error("Ningún proveedor de IA está configurado (falta OPENAI_API_KEY)");
  }

  const failures: LlmResult["failures"] = [];
  for (const spec of chain) {
    const t0 = Date.now();
    // El modo json_object no es universal: solo el proveedor primario de la
    // cadena (OpenAI) lo pide; los fallbacks gratuitos van con prompt puro.
    const wantsJson = params.responseFormat === "json" && spec.id === "openai";
    try {
      const completion = await clientFor(spec).chat.completions.create(
        {
          model: spec.model,
          messages: params.messages,
          ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
          ...(params.temperature != null ? { temperature: params.temperature } : {}),
          ...(wantsJson ? { response_format: { type: "json_object" as const } } : {}),
        },
        { timeout: spec.timeoutMs },
      );
      const content = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!content) throw new Error("respuesta vacía");
      return {
        content,
        providerId: spec.id,
        providerLabel: spec.label,
        model: spec.model,
        latencyMs: Date.now() - t0,
        failures,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ provider: spec.label, error: msg.slice(0, 200) });
      console.warn(`[llm:${task}] ${spec.label} falló (${spec.paid ? "pagado" : "gratis"}): ${msg.slice(0, 160)}`);
    }
  }
  throw new Error(
    `Todos los proveedores fallaron para "${task}": ${failures.map((f) => `${f.provider} (${f.error})`).join(" · ")}`.slice(0, 500),
  );
}

/** Diagnóstico sin exponer llaves — para logs y depuración. */
export function llmStatus(): Record<string, unknown> {
  const configured = providerChain("chat")
    .filter((p) => p.apiKey)
    .map((p) => `${p.label} → ${p.model}`);
  return { taskChains: { chat: configured.length }, providers: configured };
}
