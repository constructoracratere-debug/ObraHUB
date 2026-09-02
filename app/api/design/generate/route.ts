import { NextRequest, NextResponse } from "next/server";

import { llmJson } from "@/lib/ai/json";
import { createClient } from "@/lib/supabase/server";
import {
  AGENT_ARCHITECT_ADAPT,
  AGENT_ARCHITECT_DRAFT,
  AGENT_CIVIL,
  AGENT_CONSTRUCTOR,
  AGENT_ELECTRICAL,
  AGENT_FINISHES,
  AGENT_HYDRO,
  AGENT_SITE,
  planContext,
} from "@/lib/design/agents";
import { sanitizeFloorPlan, type SiteFicha } from "@/lib/design/schema";
import { allGates } from "@/lib/design/validate";

export const maxDuration = 60;

type Stage = "site" | "draft" | "experts" | "adapt" | "installations" | "finishes";

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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: {
    stage?: Stage;
    prompt?: string;
    location?: string;
    previousPlan?: unknown;
    constructorMemo?: ConstructorMemo;
    civilMemo?: CivilMemo;
    siteMemo?: SiteMemo;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const stage = body.stage;
  const t0 = Date.now();

  try {
    switch (stage) {
      // ── Etapa 0 · Ficha de sitio (POT/clima/materiales/métodos de la zona)
      case "site": {
        const location = (body.location ?? "").trim().slice(0, 200);
        const brief = (body.prompt ?? "").trim().slice(0, 600);
        if (!location && !brief) {
          return NextResponse.json({ error: "Indica la ubicación del proyecto" }, { status: 400 });
        }
        const res = await llmJson<SiteMemo>("docs", {
          system: AGENT_SITE,
          user: `Ubicación: ${location || "no indicada — pídela, pero asume Colombia"}.\nEncargo: ${brief || "vivienda unifamiliar"}.`,
          maxTokens: 1800,
          temperature: 0.4,
        timeoutMs: 25000,
        });
        return NextResponse.json({
          siteMemo: res.data,
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
      }

      // ── Etapa 1 · Boceto del arquitecto
      case "draft": {
        const prompt = (body.prompt ?? "").trim().slice(0, 1500);
        if (!prompt) return NextResponse.json({ error: "Describe el proyecto a diseñar" }, { status: 400 });
        const ficha = body.siteMemo ? JSON.stringify(body.siteMemo).slice(0, 2200) : "";
        const res = await llmJson<Record<string, unknown>>("structure", {
          system: AGENT_ARCHITECT_DRAFT,
          user: `ENCARGO DEL CLIENTE:\n${prompt}\n\nFICHA DE SITIO (si hay): ${ficha || "no disponible"}`,
          maxTokens: 4500,
          temperature: 0.5,
        timeoutMs: 25000,
        });
        const plan = sanitizeFloorPlan(res.data);
        return NextResponse.json({
          plan,
          gates: allGates(plan),
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
      }

      // ── Etapa 2 · Expertos en paralelo (constructor ∥ ingeniero civil)
      case "experts": {
        const plan = sanitizeFloorPlan(body.previousPlan);
        if (plan.rooms.length === 0) {
          return NextResponse.json({ error: "Genera primero el boceto arquitectónico" }, { status: 400 });
        }
        const ficha = body.siteMemo ? JSON.stringify(body.siteMemo).slice(0, 1800) : "";
        const ctx = planContext(plan);
        const [constructor, civil] = await Promise.all([
          llmJson<ConstructorMemo>("docs", {
            system: AGENT_CONSTRUCTOR,
            user: `FICHA DE SITIO: ${ficha || "no disponible"}\nPROGRAMA: ${ctx}`,
            maxTokens: 2200,
            temperature: 0.4,
          timeoutMs: 25000,
          }),
          llmJson<CivilMemo>("structure", {
            system: AGENT_CIVIL,
            user: `FICHA DE SITIO: ${ficha || "no disponible"}\nPLANTA ACTUAL: ${ctx}`,
            maxTokens: 2200,
            temperature: 0.3,
          timeoutMs: 25000,
          }),
        ]);
        return NextResponse.json({
          constructorMemo: constructor.data,
          civilMemo: civil.data,
          providers: { constructor: constructor.providerLabel, civil: civil.providerLabel },
          latencyMs: Date.now() - t0,
        });
      }

      // ── Etapa 3 · El arquitecto adapta la planta a los expertos
      case "adapt": {
        const plan = sanitizeFloorPlan(body.previousPlan);
        if (plan.rooms.length === 0) {
          return NextResponse.json({ error: "Falta el boceto" }, { status: 400 });
        }
        if (!body.constructorMemo || !body.civilMemo) {
          return NextResponse.json({ error: "Faltan los memos de los expertos" }, { status: 400 });
        }
        const res = await llmJson<Record<string, unknown>>("structure", {
          system: AGENT_ARCHITECT_ADAPT,
          user:
            `PLANTA ACTUAL (JSON):\n${JSON.stringify(plan).slice(0, 6000)}\n\n` +
            `MEMO DEL CONSTRUCTOR:\n${JSON.stringify(body.constructorMemo).slice(0, 2200)}\n\n` +
            `MEMO DEL INGENIERO CIVIL:\n${JSON.stringify(body.civilMemo).slice(0, 2200)}`,
          maxTokens: 4500,
          temperature: 0.4,
        timeoutMs: 25000,
        });
        const adapted = sanitizeFloorPlan(res.data);
        return NextResponse.json({
          plan: adapted,
          gates: allGates(adapted),
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
      }

      // ── Etapa 4 · Instalaciones en paralelo (eléctrico ∥ hidrosanitario)
      case "installations": {
        const plan = sanitizeFloorPlan(body.previousPlan);
        if (plan.rooms.length === 0) {
          return NextResponse.json({ error: "Falta la planta adaptada" }, { status: 400 });
        }
        const ctx = planContext(plan);
        const [electrical, hydro] = await Promise.all([
          llmJson<{ points: unknown[]; notes?: string }>("structure", {
            system: AGENT_ELECTRICAL,
            user: `PLANTA FINAL: ${ctx}`,
            maxTokens: 2500,
            temperature: 0.3,
          timeoutMs: 25000,
          }),
          llmJson<{ points: unknown[]; notes?: string }>("structure", {
            system: AGENT_HYDRO,
            user: `PLANTA FINAL: ${ctx}`,
            maxTokens: 1800,
            temperature: 0.3,
          timeoutMs: 25000,
          }),
        ]);
        // Fusiona las capas en el plan sanitizado de una sola vez.
        const merged = sanitizeFloorPlan({
          ...plan,
          electrical: { points: electrical.data.points ?? [], notes: electrical.data.notes ?? "" },
          hydro: { points: hydro.data.points ?? [], notes: hydro.data.notes ?? "" },
        });
        return NextResponse.json({
          plan: merged,
          gates: allGates(merged),
          providers: { electrical: electrical.providerLabel, hydro: hydro.providerLabel },
          latencyMs: Date.now() - t0,
        });
      }

      // ── Etapa 5 · Acabados y equipos
      case "finishes": {
        const plan = sanitizeFloorPlan(body.previousPlan);
        if (plan.rooms.length === 0) {
          return NextResponse.json({ error: "Falta la planta" }, { status: 400 });
        }
        const res = await llmJson<{ finishes?: unknown[]; equipment?: Array<{ item: string; room?: string; note?: string }> }>("docs", {
          system: AGENT_FINISHES,
          user: `PLANTA FINAL: ${planContext(plan)}\nMEMO CONSTRUCTOR: ${JSON.stringify(body.constructorMemo ?? {}).slice(0, 1600)}`,
          maxTokens: 2200,
          temperature: 0.5,
        timeoutMs: 25000,
        });
        const merged = sanitizeFloorPlan({ ...plan, finishes: res.data.finishes ?? [] });
        return NextResponse.json({
          plan: merged,
          equipment: res.data.equipment ?? [],
          gates: allGates(merged),
          provider: res.providerLabel,
          model: res.model,
          latencyMs: Date.now() - t0,
        });
      }

      default:
        return NextResponse.json({ error: "Etapa desconocida" }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[design:${stage}] ${msg.slice(0, 300)}`);
    return NextResponse.json(
      { error: `El estudio de diseño falló en la etapa "${stage}". ${msg.slice(0, 180)}` },
      { status: 502 },
    );
  }
}
