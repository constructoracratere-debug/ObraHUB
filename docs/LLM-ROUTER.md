# 🧠 Enrutador Multi-LLM de ObraHub

Un solo punto de entrada (`lib/ai/router.ts`) que reparte el trabajo entre varios
LLMs según la tarea, priorizando los **gratis** y pagando solo lo complejo.
Todos los proveedores usan APIs compatibles con OpenAI — mismo SDK, distinto `baseURL`.

## Estrategia por tarea

| Tarea | Cadena (en orden de intento) | Uso en ObraHub |
|---|---|---|
| `chat` | Gemini Flash **(gratis)** → Kimi K2 **(gratis)** → Qwen **(gratis)** → Grok → DeepSeek V3 **(gratis)** → GPT-4.1-mini (pagado) | Biblioteca normativa — mayor volumen |
| `docs` | Gemini Flash 1M ctx **(gratis)** → DeepSeek V3 **(gratis)** → GPT-4.1-mini (pagado) | Documentos de millones de caracteres |
| `vision` | **GPT-4o (pagado — la mejor lectura de imágenes)** → Gemini Flash | Interventor IA (fotos de obra) |
| `structure` | GPT-4.1-mini (pagado) → DeepSeek V3 → Qwen | JSON estructurado (APU, cronogramas) |

Si un proveedor falla, se agota la cuota del día o no responde en su timeout,
la cadena salta al siguiente automáticamente. La respuesta incluye
`provider` y `latencyMs` — la app muestra "⚡ Respondió Kimi K2 (gratis) · 3.2s".

## Cómo activar los gratuitos (todos opcionales)

Sin llaves extra, todo funciona igual que hoy (solo OpenAI). Agrega lo que quieras
en `.env.local` y en **Vercel → Settings → Environment Variables**:

### 1. Google Gemini — el más valioso (1M tokens de contexto + visión, gratis)
1. Entra a https://aistudio.google.com/apikey con tu cuenta Google.
2. "Create API key" → copia.
3. `GEMINI_API_KEY=AIza...`
   - Free tier ≈ 1.500 requests/día de `gemini-2.5-flash`.

### 2. OpenRouter — Kimi K2, DeepSeek V3, GLM, Llama en una sola llave
1. Crea cuenta en https://openrouter.ai/settings/keys.
2. Genera la llave → `OPENROUTER_API_KEY=sk-or-v1-...`
   - Modelos `:free` sin costo: 50 requests/día gratis; si cargas **US$10 una
     sola vez** (no se consume en los free), sube a 1.000/día.
   - Modelos usados: `moonshotai/kimi-k2:free`, `deepseek/deepseek-chat-v3.1:free`.

### 3. Qwen (Alibaba DashScope) — cuota gratuita propia
1. Cuenta en https://www.alibabacloud.com/product/dashscope (Model Studio).
2. `DASHSCOPE_API_KEY=sk-...` → modelo `qwen-plus` con cuota gratuita inicial.

### 4. Grok (xAI) — barato (opcional)
1. Cuenta en https://console.x.ai → API key.
2. `XAI_API_KEY=xai-...` → modelo `grok-4-fast`.

## Variables de configuración

```bash
OPENAI_API_KEY=...        # pagado — visión GPT-4o + respaldo final (requerida)
GEMINI_API_KEY=...        # gratis — prioridad en chat/docs
OPENROUTER_API_KEY=...    # gratis — Kimi K2 + DeepSeek V3
DASHSCOPE_API_KEY=...     # gratis — Qwen Plus
XAI_API_KEY=...           # barato — Grok 4 Fast

# Overrides opcionales de modelos:
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_FREE_MODEL=moonshotai/kimi-k2:free
OPENROUTER_FREE_MODEL_2=deepseek/deepseek-chat-v3.1:free
QWEN_MODEL=qwen-plus
XAI_MODEL=grok-4-fast
```

## Ahorro esperado

La biblioteca normativa responde hoy con GPT-4.1-mini (~US$0.0004/consulta con
RAG). Con la cadena gratis activa, el 80-90% de las consultas de texto las
absorben Gemini/Kimi/Qwen a **costo cero**, y OpenAI queda solo para fotos
(GPT-4o) y JSON crítico — exactamente donde su calidad justifica el precio.
