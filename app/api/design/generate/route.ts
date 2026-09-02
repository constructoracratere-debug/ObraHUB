import { NextRequest } from "next/server";

import { llmJson, type JsonEvent } from "@/lib/ai/json";
import { createClient } from "@/lib/supabase/server";
import {
  AGENT_ARCHITECT_ADAPT,
  AGENT_ARCHITECT_DRAFT,
  AGENT_ARCHITECT_REVISE,
  AGENT_CIVIL,
  AGENT_CONSTRUCTOR,
  AGENT_ELECTRICAL,
  AGENT_FINISHES,
  AGENT_HYDRO,
  AGENT_SITE,
  planContext,
} from "@/lib/design/agents";
import { sanitizeFloorPlan, type SiteFicha, type RevisionLog } from "@/lib/design/schema";
import { allGates, type Gate } from "@/lib/design/validate";

export const maxDuration = 60;

type Stage = "site" | "draft" | "experts" | "adapt" | "installations" | "finishes" | "revise";

type ConstructorMemo = {
  materials: Array<{ element: string; suggestion: string; reason: string; source?: string }>;
  methods: Array<{ stage: string; suggestion: string; reason: string; source?: string }>;
  logisticsNotes?: string;
  costSignals?: string[];
};

type CivilMemo = {
  system: string;
  justification: string;
  axes: Array<{ id: string; orientation: string; at: number }>;
  spanWarnings?: string[];
  foundation?: string;
  notesForArchitect?: string[];
};

type SiteMemo = Omit<SiteFicha, "latitude" | "longitude"> & { designDirectives?: string[] };

/**
 * POST /api/design/generate — respuesta STREAMING NDJSON (una línea = evento).
 * Eventos: {type:"say",agent?,text} narrativa · {type:"json",...} eventos LLM
 * (provider/delta/status/fallback) · {type:"done",...payload final} · {type:"error"}.
 * El cliente los pinta en la consola de agentes en vivo.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: {
    stage?: Stage;
    prompt?: string;
    location?: string;
    previousPlan?: unknown;
    constructorMemo?: ConstructorMemo;
    civilMemo?: CivilMemo;
    siteMemo?: SiteMemo;
    feedback?: string;
    gates?: Gate[];
    revisions?: RevisionLog[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const t0 = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* cliente desconectado */
        }
      };
      const say = (text: string, agent?: string) => send({ type: "say", agent, text });
      const live = (agent?: string) => (e: JsonEvent) => send({ type: "json", agent, e });

      try {
        await runStage(body, { say, live, send });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[design:${body.stage}] ${msg.slice(0, 300)}`);
        send({ type: "error", error: `El estudio falló en la etapa "${body.stage}". ${msg.slice(0, 180)}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });

  // ── Motor de etapas (mismo flujo, ahora narrado) ─────────────────────────
  async function runStage(
    b: typeof body,
    h: {
      say: (text: string, agent?: string) => void;
      live: (agent?: string) => (e: JsonEvent) => void;
      send: (obj: unknown) => void;
    },
  ) {
    const { say, live, send } = h;

    switch (b.stage) {
      // ── Etapa 0 · Ficha de sitio ─────────────────────────────────────────
      case "site": {
        const location = (b.location ?? "").trim().slice(0, 200);
        const brief = (b.prompt ?? "").trim().slice(0, 600);
        if (!location && !brief) throw new Error("Indica la ubicación del proyecto");

        say(`📍 Urbanista: investigando ${location || "la zona"}…`, "urbanista");
        say("📚 Revisando marco del POT, clima, vientos dominantes y riesgos…", "urbanista");
        say("🧱 Identificando materiales y métodos constructivos de la zona…", "urbanista");
        const res = await llmJson<SiteMemo>("structure", {
          system: AGENT_SITE,
          user: `Ubicación: ${location || "no indicada — asume Colombia"}.\nEncargo: ${brief || "vivienda unifamiliar"}.`,
          maxTokens: 1800,
          temperature: 0.4,
          timeoutMs: 18000,
          onEvent: live("urbanista"),
        });
        say("✅ Ficha de sitio lista — el arquitecto ya puede arrancar.", "urbanista");
        send({ type: "done", siteMemo: res.data, provider: res.providerLabel, model: res.model, latencyMs: Date.now() - t0 });
        return;
      }

      // ── Etapa 1 · Boceto del arquitecto ──────────────────────────────────
      case "draft": {
        const prompt = (b.prompt ?? "").trim().slice(0, 1500);
        if (!prompt) throw new Error("Describe el proyecto a diseñar");
        say("🏛️ Arquitecto: interpretando el encargo del cliente…", "arquitecto");
        if (b.siteMemo) say("📍 Aplicando directrices de la ficha de sitio (POT/clima/materiales).", "arquitecto");
        say("📐 Dimensionando espacios con la tabla Neufert/Plazola/Panero…", "arquitecto");
        say("🚪 Ubicando puertas (≥0.90 m accesible) y ventilación cruzada…", "arquitecto");
        const ficha = b.siteMemo ? JSON.stringify(b.siteMemo).slice(0, 2200) : "";
        const res = await llmJson<Record<string, unknown>>("structure", {
          system: AGENT_ARCHITECT_DRAFT,
          user: `ENCARGO DEL CLIENTE:\n${prompt}\n\nFICHA DE SITIO (si hay): ${ficha || "no disponible"}`,
          maxTokens: 4500,
          temperature: 0.5,
          timeoutMs: 18000,
          onEvent: live("arquitecto"),
        });
        say("🧹 Sanitizando geometría (clamps, redondeo a cm, anclajes)…", "arquitecto");
        const plan = sanitizeFloorPlan(res.data);
        say(`🛡️ Puerta de verificación 1: ${allGates(plan)[0].checks.filter((c) => !c.pass).length} observaciones.`, "arquitecto");
        send({ type: "done", plan, gates: allGates(plan), provider: res.providerLabel, model: res.model, latencyMs: Date.now() - t0 });
        return;
      }

      // ── Etapa 2 · Expertos en paralelo ───────────────────────────────────
      case "experts": {
        const plan = sanitizeFloorPlan(b.previousPlan);
        if (plan.rooms.length === 0) throw new Error("Genera primero el boceto arquitectónico");
        say("👷 Constructor e 🏗️ ingeniero civil trabajando EN PARALELO…");
        const ficha = b.siteMemo ? JSON.stringify(b.siteMemo).slice(0, 1800) : "";
        const ctx = planContext(plan);
        say("👷 Evaluando materiales disponibles y métodos locales (Plazola)…", "constructor");
        say("🏗️ Calculando sistema estructural y retícula según NSR-10…", "civil");
        const [constructor, civil] = await Promise.all([
          llmJson<ConstructorMemo>("structure", {
            system: AGENT_CONSTRUCTOR,
            user: `FICHA DE SITIO: ${ficha || "no disponible"}\nPROGRAMA: ${ctx}`,
            maxTokens: 3200,
            temperature: 0.4,
            timeoutMs: 18000,
            onEvent: live("constructor"),
          }),
          llmJson<CivilMemo>("structure", {
            system: AGENT_CIVIL,
            user: `FICHA DE SITIO: ${ficha || "no disponible"}\nPLANTA ACTUAL: ${ctx}`,
            maxTokens: 3000,
            temperature: 0.3,
            timeoutMs: 18000,
            onEvent: live("civil"),
          }),
        ]);
        say("✅ Ambos memos listos — el arquitecto los tiene en la mesa.", "mesa");
        send({
          type: "done",
          constructorMemo: constructor.data,
          civilMemo: civil.data,
          providers: { constructor: constructor.providerLabel, civil: civil.providerLabel },
          latencyMs: Date.now() - t0,
        });
        return;
      }

      // ── Etapa 3 · Adaptación ─────────────────────────────────────────────
      case "adapt": {
        const plan = sanitizeFloorPlan(b.previousPlan);
        if (plan.rooms.length === 0) throw new Error("Falta el boceto");
        if (!b.constructorMemo || !b.civilMemo) throw new Error("Faltan los memos de los expertos");
        say("📐 Arquitecto en mesa técnica: alineando muros a la retícula del ingeniero…", "arquitecto");
        say("📏 Respetando luces máximas del sistema estructural elegido…", "arquitecto");
        const gatesText = (b.gates ?? [])
          .flatMap((g) => g.checks.filter((c) => !c.pass).map((c) => `· [${g.stage}] ${c.label}: ${c.detail}`))
          .join("\n");
        if (gatesText) say(`🛡️ Corrigiendo observaciones de verificación:\n${gatesText.slice(0, 400)}`, "arquitecto");
        const res = await llmJson<Record<string, unknown>>("structure", {
          system: AGENT_ARCHITECT_ADAPT,
          user:
            `PLANTA ACTUAL (JSON):\n${JSON.stringify(plan).slice(0, 6000)}\n\n` +
            `MEMO DEL CONSTRUCTOR:\n${JSON.stringify(b.constructorMemo).slice(0, 2200)}\n\n` +
            `MEMO DEL INGENIERO CIVIL:\n${JSON.stringify(b.civilMemo).slice(0, 2200)}`,
          maxTokens: 4500,
          temperature: 0.4,
          timeoutMs: 18000,
          onEvent: live("arquitecto"),
        });
        const adapted = sanitizeFloorPlan(res.data);
        say("🛡️ Puerta de verificación 2 (estructura + retícula + puertas).", "arquitecto");
        send({ type: "done", plan: adapted, gates: allGates(adapted), provider: res.providerLabel, model: res.model, latencyMs: Date.now() - t0 });
        return;
      }

      // ── Etapa 4 · Instalaciones en paralelo ─────────────────────────────
      case "installations": {
        const plan = sanitizeFloorPlan(b.previousPlan);
        if (plan.rooms.length === 0) throw new Error("Falta la planta adaptada");
        say("⚡ Experto eléctrico y 💧 hidrosanitario trabajando EN PARALELO…");
        const ctx = planContext(plan);
        say("⚡ Diseñando circuitos, tablero y puntos (RETIE/NTC 2050)…", "electrico");
        say("💧 Ubicando aparatos y puntos húmedos (RAS)…", "hidro");
        const [electrical, hydro] = await Promise.all([
          llmJson<{ points: unknown[]; notes?: string }>("structure", {
            system: AGENT_ELECTRICAL,
            user: `PLANTA FINAL: ${ctx}`,
            maxTokens: 2500,
            temperature: 0.3,
            timeoutMs: 18000,
            onEvent: live("electrico"),
          }),
          llmJson<{ points: unknown[]; notes?: string }>("structure", {
            system: AGENT_HYDRO,
            user: `PLANTA FINAL: ${ctx}`,
            maxTokens: 1800,
            temperature: 0.3,
            timeoutMs: 18000,
            onEvent: live("hidro"),
          }),
        ]);
        const merged = sanitizeFloorPlan({
          ...plan,
          electrical: { points: electrical.data.points ?? [], notes: electrical.data.notes ?? "" },
          hydro: { points: hydro.data.points ?? [], notes: hydro.data.notes ?? "" },
        });
        say("🔌 Capas ELÉCTRICO e HIDROSANITARIO fusionadas al plano.", "mesa");
        send({
          type: "done",
          plan: merged,
          gates: allGates(merged),
          providers: { electrical: electrical.providerLabel, hydro: hydro.providerLabel },
          latencyMs: Date.now() - t0,
        });
        return;
      }

      // ── Etapa 5 · Acabados ───────────────────────────────────────────────
      case "finishes": {
        const plan = sanitizeFloorPlan(b.previousPlan);
        if (plan.rooms.length === 0) throw new Error("Falta la planta");
        say("🎨 Interiores: proponiendo acabados coherentes con el sistema y el segmento…", "interiores");
        const res = await llmJson<{ finishes?: unknown[]; equipment?: Array<{ item: string; room?: string; note?: string }> }>("structure", {
          system: AGENT_FINISHES,
          user: `PLANTA FINAL: ${planContext(plan)}\nMEMO CONSTRUCTOR: ${JSON.stringify(b.constructorMemo ?? {}).slice(0, 1600)}`,
          maxTokens: 2200,
          temperature: 0.5,
          timeoutMs: 18000,
          onEvent: live("interiores"),
        });
        const merged = sanitizeFloorPlan({ ...plan, finishes: res.data.finishes ?? [] });
        say("🏁 Expediente completo — entregables listos.", "interiores");
        send({
          type: "done",
          plan: merged,
          equipment: res.data.equipment ?? [],
          gates: allGates(merged),
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
        return;
      }

      // ── Etapa R · Revisión con el profesional (redibujo con su feedback) ──
      case "revise": {
        const plan = sanitizeFloorPlan(b.previousPlan);
        if (plan.rooms.length === 0) throw new Error("Falta la planta");
        const feedback = (b.feedback ?? "").trim().slice(0, 1200);
        if (!feedback) throw new Error("Escribe la sugerencia o corrección para el arquitecto");
        say("📝 El profesional dejó feedback — el arquitecto redibuja…", "arquitecto");
        say(`💬 "${feedback.slice(0, 120)}"`, "arquitecto");
        const gatesText = (b.gates ?? [])
          .flatMap((g) => g.checks.filter((c) => !c.pass).map((c) => `· [${g.stage}] ${c.label}: ${c.detail}`))
          .join("\n");
        if (gatesText) say("🛡️ Aprovecha para corregir observaciones pendientes de las gates.", "arquitecto");
        const res = await llmJson<Record<string, unknown>>("structure", {
          system: AGENT_ARCHITECT_REVISE,
          user:
            `FEEDBACK DEL PROFESIONAL (manda sobre todo lo demás, salvo mínimos normativos — si choca, explícalo en revisionChanges):\n${feedback}\n\n` +
            `PLANTA ACTUAL (JSON):\n${JSON.stringify(plan).slice(0, 7000)}\n\n` +
            `OBSERVACIONES PENDIENTES:\n${gatesText || "ninguna"}`,
          maxTokens: 4500,
          temperature: 0.35,
          timeoutMs: 18000,
          onEvent: live("arquitecto"),
        });
        const changes = Array.isArray((res.data as any)?.revisionChanges) ? (res.data as any).revisionChanges : [];
        const revised = sanitizeFloorPlan(res.data);
        const revision: RevisionLog = {
          feedback,
          changes: changes.slice(0, 10).map((c: any) => ({
            change: String(c?.change ?? "").slice(0, 200),
            why: String(c?.why ?? "").slice(0, 300),
          })),
          at: new Date().toISOString(),
        };
        say(`✏️ ${revision.changes.length} cambio(s) aplicado(s) — planta redibujada.`, "arquitecto");
        send({
          type: "done",
          plan: revised,
          gates: allGates(revised),
          revision,
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
        return;
      }

      default:
        throw new Error("Etapa desconocida");
    }
  }
}
