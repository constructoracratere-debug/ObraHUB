"use client";

/**
 * ✏️ Diseño IA — Estudio de diseño multi-agente.
 *
 * Wizard de 6 etapas (roadmap Fase 1 ampliado):
 *  0 Sitio → 1 Boceto arquitecto → 2 Expertos (∥) → 3 Adaptación
 *  → 4 Instalaciones (∥) → 5 Acabados → expediente + DXF por capas.
 * Cada etapa pasa por puertas de verificación determinísticas (validate.ts).
 * El plano se dibuja en SVG (viewBox pan/zoom, patrón dwg-preview).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type FloorPlan,
  roomArea,
  totalArea,
  ROOM_COLORS,
  STRUCTURE_LABELS,
} from "@/lib/design/schema";
import type { Gate } from "@/lib/design/validate";
import { gateFails } from "@/lib/design/validate";
import { planToDxf } from "@/lib/design/dxf";
import { buildLicenseExpediente } from "@/lib/design/expediente";
import type { RevisionLog } from "@/lib/design/schema";

type SiteMemo = {
  city?: string;
  department?: string;
  climate?: string;
  wind?: string;
  potNotes?: string;
  localMaterials?: string[];
  localMethods?: string[];
  risks?: string[];
  designDirectives?: string[];
};

type ConstructorMemo = {
  materials?: Array<{ element: string; suggestion: string; reason: string; source?: string }>;
  methods?: Array<{ stage: string; suggestion: string; reason: string; source?: string }>;
  logisticsNotes?: string;
  costSignals?: string[];
};

type CivilMemo = {
  system?: string;
  justification?: string;
  axes?: Array<{ id: string; orientation: string; at: number }>;
  spanWarnings?: string[];
  foundation?: string;
  notesForArchitect?: string[];
};

type Equipment = Array<{ item: string; room?: string; note?: string }>;

type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const STAGES: Array<{ n: Stage; title: string; agent: string; icon: string }> = [
  { n: 0, title: "Sitio", agent: "Urbanista — POT y contexto", icon: "📍" },
  { n: 1, title: "Boceto", agent: "Arquitecto", icon: "🏛️" },
  { n: 2, title: "Expertos", agent: "Constructor ∥ Ing. Civil", icon: "👷" },
  { n: 3, title: "Adaptación", agent: "Arquitecto + mesa técnica", icon: "📐" },
  { n: 4, title: "Instalaciones", agent: "Eléctrico ∥ Hidrosanitario", icon: "⚡" },
  { n: 5, title: "Acabados", agent: "Interiores", icon: "🎨" },
];

const EXAMPLES = [
  "Apartamento 2 alcobas de 58 m² en Bogotá, 1 baño y balcón",
  "Casa unifamiliar 1 piso, 3 habitaciones (1 principal), 2 baños, 92 m² en Medellín",
  "Vivienda guadua 2 pisos en el Eje Cafetero, 3 alcobas, 80 m²",
];

export function DesignTool({ projectSlug, initialPrompt }: { projectSlug?: string; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [location, setLocation] = useState("");
  const [stage, setStage] = useState<Stage>(0);
  const [busy, setBusy] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string | null>(null);

  const [siteMemo, setSiteMemo] = useState<SiteMemo | null>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [constructorMemo, setConstructorMemo] = useState<ConstructorMemo | null>(null);
  const [civilMemo, setCivilMemo] = useState<CivilMemo | null>(null);
  const [equipment, setEquipment] = useState<Equipment>([]);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Bucle de revisión con el profesional + paquete de licencia.
  const [feedback, setFeedback] = useState("");
  const [revisions, setRevisions] = useState<RevisionLog[]>([]);
  const [revBusy, setRevBusy] = useState(false);

  // Consola en vivo: líneas {agent, kind, text} — deltas coalescidos.
  const [consoleLines, setConsoleLines] = useState<Array<{ agent: string | null; kind: "say" | "delta" | "provider" | "status" | "fallback" | "error"; text: string }>>([]);

  useEffect(() => { if (initialPrompt) setPrompt(initialPrompt); }, [initialPrompt]);

  const pushLine = useCallback((line: { agent: string | null; kind: "say" | "delta" | "provider" | "status" | "fallback" | "error"; text: string }) => {
    setConsoleLines((prev) => {
      const next = [...prev, line];
      // Coalesce: un delta consecutivo del mismo agente se acumula en 1 línea.
      const last = next[next.length - 2];
      if (line.kind === "delta" && last && last.kind === "delta" && last.agent === line.agent) {
        const merged = (last.text + line.text).slice(-220);
        next.splice(next.length - 2, 2, { agent: last.agent, kind: "delta", text: merged });
      }
      return next.slice(-140);
    });
  }, []);

  const call = useCallback(async (body: Record<string, unknown>, attempt = 0): Promise<Record<string, unknown>> => {
    if (attempt === 0) setConsoleLines([]);
    const res = await fetch("/api/design/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* 504 etc. */ }
      const e = data.error;
      const msg =
        typeof e === "string" ? e
        : typeof (e as { message?: string })?.message === "string" ? (e as { message: string }).message
        : res.status === 504
          ? "La etapa tardó demasiado (proveedores IA saturados). Reintenta — la 2ª vez suele ser más rápida."
          : `Error ${res.status}`;
      throw new Error(msg);
    }
    // NDJSON en streaming: cada línea es un evento de la consola.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: Record<string, unknown> | null = null;
    for (;;) {
      const { value, done: eof } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: Record<string, unknown>;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "say") {
          pushLine({ agent: (ev.agent as string) ?? null, kind: "say", text: ev.text as string });
        } else if (ev.type === "json") {
          const e = ev.e as { type?: string; text?: string };
          const kind = e.type === "delta" || e.type === "provider" || e.type === "fallback" || e.type === "status" ? e.type : "status";
          pushLine({ agent: (ev.agent as string) ?? null, kind, text: e.text ?? "" });
        } else if (ev.type === "error") {
          throw new Error(ev.error as string);
        } else if (ev.type === "done") {
          done = ev;
        }
      }
      if (eof) break;
    }
    if (!done) {
      // Corte de conexión (p. ej. límite de 60 s con proveedor lento): reintento
      // automático — la consola lo narra y la siguiente va más rápida.
      if (attempt < 2) {
        pushLine({ agent: "mesa", kind: "fallback", text: `🔁 Conexión cortada por tiempo — reintentando automáticamente (${attempt + 2}/3)…` });
        return call(body, attempt + 1);
      }
      throw new Error("La etapa no devolvió resultado tras 3 intentos. Vuelve a lanzarla en un momento.");
    }
    return done;
  }, [pushLine]);

  /** Envuelve una etapa: reintentos automáticos con narrativa ante errores de
   *  proveedores saturados — el usuario no debe apretar "intentar de nuevo". */
  const callWithRetries = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call(body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /falló en la etapa|saturad|timed out|no devolvió resultado|Error 5\d\d|vacía/i.test(msg);
        if (attempt >= 3 || !retryable) throw err;
        pushLine({ agent: "mesa", kind: "fallback", text: `⚠️ ${msg.slice(0, 90)} — reintentando automáticamente (${attempt + 1}/3)…` });
      }
    }
  }, [call, pushLine]);

  const runSite = async () => {
    setBusy(0); setError(null);
    try {
      const data = await callWithRetries({ stage: "site", location, prompt });
      setSiteMemo(data.siteMemo as SiteMemo);
      setProviderInfo(`📍 ${String(data.provider)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
      setStage(1);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runDraft = async () => {
    setBusy(1); setError(null);
    try {
      const data = await callWithRetries({ stage: "draft", prompt, siteMemo });
      setPlan(data.plan as FloorPlan); setGates(data.gates as Gate[]);
      setProviderInfo(`🏛️ ${String(data.provider)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
      setStage(2);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runExperts = async () => {
    if (!plan) return;
    setBusy(2); setError(null);
    try {
      const data = await callWithRetries({ stage: "experts", previousPlan: plan, siteMemo });
      setConstructorMemo(data.constructorMemo as ConstructorMemo); setCivilMemo(data.civilMemo as CivilMemo);
      setProviderInfo(`👷 ${String((data.providers as any).constructor)} + ${String((data.providers as any).civil)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
      setStage(3);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runAdapt = async () => {
    if (!plan || !constructorMemo || !civilMemo) return;
    setBusy(3); setError(null);
    try {
      const data = await callWithRetries({ stage: "adapt", previousPlan: plan, constructorMemo, civilMemo });
      setPlan(data.plan as FloorPlan); setGates(data.gates as Gate[]);
      setProviderInfo(`📐 ${String(data.provider)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
      setStage(4);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runInstallations = async () => {
    if (!plan) return;
    setBusy(4); setError(null);
    try {
      const data = await callWithRetries({ stage: "installations", previousPlan: plan });
      setPlan(data.plan as FloorPlan); setGates(data.gates as Gate[]);
      setProviderInfo(`⚡ ${String((data.providers as any).electrical)} + ${String((data.providers as any).hydro)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
      setStage(5);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runFinishes = async () => {
    if (!plan) return;
    setBusy(5); setError(null);
    try {
      const data = await callWithRetries({ stage: "finishes", previousPlan: plan, constructorMemo });
      setPlan(data.plan as FloorPlan); setEquipment((data.equipment as Equipment) ?? []); setGates(data.gates as Gate[]);
      setProviderInfo(`🎨 ${String(data.provider)} · ${((data.latencyMs as number) / 1000).toFixed(1)}s`);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const runStage = (s: Stage) =>
    ({ 0: runSite, 1: runDraft, 2: runExperts, 3: runAdapt, 4: runInstallations, 5: runFinishes })[s]();

  // ── DXF (client-side, instantáneo) ────────────────────────────────────────
  const dxfBlob = useMemo(() => {
    if (!plan) return null;
    return new Blob([planToDxf(plan)], { type: "application/dxf" });
  }, [plan]);

  // ── Revisión del profesional: feedback → redibujo ─────────────────────
  const runRevise = async () => {
    if (!plan || !feedback.trim()) return;
    setRevBusy(true); setError(null);
    try {
      const data = await callWithRetries({ stage: "revise", previousPlan: plan, feedback, gates: gates ?? undefined });
      const rev = data.revision as RevisionLog | undefined;
      setPlan(data.plan as FloorPlan);
      setGates(data.gates as Gate[]);
      if (rev) setRevisions((prev) => [...prev, rev]);
      setProviderInfo(`📝 ${String(data.provider)} · ${(data.latencyMs as number) / 1000 | 0}s — ${rev?.changes.length ?? 0} cambio(s)`);
      setFeedback("");
    } catch (e) { setError(e instanceof Error ? e.message : "Error en la revisión"); }
    setRevBusy(false);
  };

  // ── Expediente de licencia (documento completo) ────────────────────────
  const expedienteText = () => plan ? buildLicenseExpediente({ plan, constructorMemo, civilMemo, gates, revisions }) : "";
  const downloadExpediente = () => {
    if (!plan) return;
    const blob = new Blob([expedienteText()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expediente-licencia-${slugify(plan.name)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadDxf = () => {
    if (!dxfBlob || !plan) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(dxfBlob);
    a.download = `${slugify(plan.name)}.dxf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveToDocs = async () => {
    if (!dxfBlob || !plan || !projectSlug) return;
    setSaving("saving");
    try {
      // 1) Asegura carpeta "Diseño IA" del proyecto (path string "A/B", no array).
      const f = await fetch(`/api/projects/${projectSlug}/folders/ensure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "Diseño IA" }),
      });
      const fd = await f.json();
      if (!f.ok) throw new Error(fd.error ?? "No se pudo crear la carpeta");
      // 2) Sube el DXF por la ruta multipart estándar (≤4 MB).
      const file = new File([dxfBlob], `${slugify(plan.name)}.dxf`, { type: "application/dxf" });
      const form = new FormData();
      form.append("files", file);
      const u = await fetch(`/api/folders/${fd.folderId}/files`, { method: "POST", body: form });
      const ud = await u.json();
      if (!u.ok) throw new Error(ud.error ?? "No se pudo subir el DXF");
      setSaving("saved");
    } catch {
      setSaving("error");
    }
  };

  const canDownload = !!plan;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Stepper de etapas */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-[#070d1a] px-3 py-2">
        {STAGES.map((s, i) => {
          const done = stage > s.n || (s.n === 5 && equipment.length > 0);
          const active = stage === s.n;
          return (
            <div key={s.n} className="flex items-center">
              <button
                type="button"
                onClick={() => setStage(s.n)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                  active ? "bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40"
                  : done ? "text-emerald-300 hover:bg-white/[0.05]"
                  : "text-slate-500 hover:bg-white/[0.04]"
                }`}
                title={s.agent}
              >
                <span>{done ? "✓" : s.icon}</span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < STAGES.length - 1 && <span className="text-slate-700">·</span>}
            </div>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Panel izquierdo: etapa actual */}
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-b border-white/[0.06] p-3 lg:w-80 lg:border-b-0 lg:border-r">
          <StagePanel
            stage={stage}
            prompt={prompt} setPrompt={setPrompt}
            location={location} setLocation={setLocation}
            siteMemo={siteMemo} plan={plan} constructorMemo={constructorMemo}
            civilMemo={civilMemo} equipment={equipment}
            busy={busy} onRun={() => runStage(stage)}
          />
          {providerInfo && <p className="text-[10px] text-slate-500">⚡ {providerInfo}</p>}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
          )}

          {/* Revisión del profesional — su criterio manda */}
          {plan && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                📝 Sugerir cambios (profesional)
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="Ej: agranda el baño principal a 2.0×2.2, mueve la cocina junto a la lavandería, la alcoba sur necesita ventana más grande…"
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#0a1120] px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <button
                type="button" onClick={runRevise} disabled={revBusy || !feedback.trim()}
                className="mt-2 w-full rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/40 transition hover:bg-amber-500/30 disabled:opacity-50"
              >
                {revBusy ? "Redibujando…" : "✏️ Redibujar con mis cambios"}
              </button>
              <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
                El arquitecto ejecuta tus indicaciones, actualiza la memoria de diseño y registra cada cambio en el expediente.
              </p>
            </div>
          )}

          {/* Paquete de licencia de construcción */}
          {plan && (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
                🏛️ Paquete de licencia
              </p>
              <div className="mt-2 space-y-1 text-[10px] text-slate-300">
                <p>✅ Plano arquitectónico (DXF por capas)</p>
                <p>✅ Memoria de diseño {plan.designReport ? "" : "(pendiente — regenera)"}</p>
                <p>✅ Cuadro de áreas ({plan.rooms.length} espacios)</p>
                <p>✅ Memoria estructural {plan.structure ? "" : "(falta etapa expertos)"}</p>
                <p>✅ Instalaciones {(plan.electrical || plan.hydro) ? "" : "(falta etapa instalaciones)"}</p>
                <p>✅ Registro de revisiones ({revisions.length})</p>
                <p className="text-slate-500">⬜ F.U.N. · CTL · suelos · firmas (checklist dentro)</p>
              </div>
              <button
                type="button" onClick={downloadExpediente}
                className="mt-2 w-full rounded-lg bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-100 ring-1 ring-indigo-400/40 transition hover:bg-indigo-500/30"
              >
                📄 Descargar expediente completo
              </button>
            </div>
          )}

          {/* Acciones de salida */}
          {canDownload && (
            <div className="mt-1 space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Entregables</p>
              <button
                type="button" onClick={downloadDxf}
                className="w-full rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/30"
              >
                ⬇️ Descargar DXF por capas
              </button>
              {projectSlug && (
                <button
                  type="button" onClick={saveToDocs} disabled={saving === "saving"}
                  className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/[0.1] disabled:opacity-50"
                >
                  {saving === "saving" ? "Guardando…" : saving === "saved" ? "✓ Guardado en Documentos" : "💾 Guardar en Documentos"}
                </button>
              )}
              <p className="text-[9px] leading-relaxed text-slate-500">
                Esquema conceptual generado por IA. Debe ser revisado y firmado por profesionales matriculados.
              </p>
            </div>
          )}
        </div>

        {/* Centro: plano SVG + consola de agentes en vivo */}
        <div className="relative min-h-[320px] flex-1 bg-[#0a1120]">
          {plan ? (
            <PlanSvg plan={plan} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">✏️</div>
                <p className="text-sm text-slate-400">El plano aparece aquí cuando el arquitecto termine el boceto.</p>
                <p className="mt-1 text-xs text-slate-600">Empieza por la ficha de sitio (etapa 0).</p>
              </div>
            </div>
          )}
          {/* Consola EN VIVO — el estudio narrando su trabajo (como un agente) */}
          {(busy !== null || consoleLines.length > 0) && (
            <AgentConsole lines={consoleLines} working={busy !== null} />
          )}
        </div>

        {/* Derecha: expediente (gates + memos) */}
        <div className="w-full shrink-0 overflow-y-auto border-t border-white/[0.06] p-3 lg:w-80 lg:border-t-0 lg:border-l">
          <Dossier
            gates={gates} plan={plan}
            constructorMemo={constructorMemo} civilMemo={civilMemo}
            equipment={equipment} revisions={revisions}
          />
        </div>
      </div>
    </div>
  );
}

// ── Panel de la etapa activa ─────────────────────────────────────────────────
function StagePanel(props: {
  stage: Stage; prompt: string; setPrompt: (v: string) => void;
  location: string; setLocation: (v: string) => void;
  siteMemo: SiteMemo | null; plan: FloorPlan | null;
  constructorMemo: ConstructorMemo | null; civilMemo: CivilMemo | null;
  equipment: Equipment; busy: Stage | null; onRun: () => void;
}) {
  const { stage, busy, onRun } = props;
  const running = busy === stage;
  const s = STAGES[stage];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">
        {s.icon} Etapa {stage + 1}/6 · {s.agent}
      </p>

      {stage === 0 && (
        <>
          <label className="mt-2 block text-xs font-medium text-slate-300">Ubicación del proyecto</label>
          <input
            value={props.location}
            onChange={(e) => props.setLocation(e.target.value)}
            placeholder="Ej: Pereira, Risaralda — o coordenadas"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a1120] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
          />
          <label className="mt-3 block text-xs font-medium text-slate-300">Encargo (programa)</label>
          <textarea
            value={props.prompt}
            onChange={(e) => props.setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe el proyecto: m², habitaciones, pisos, estilo…"
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#0a1120] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => props.setPrompt(ex)}
                className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-slate-400 transition hover:bg-white/[0.1] hover:text-slate-200">
                {ex.slice(0, 38)}…
              </button>
            ))}
          </div>
          <RunButton onClick={onRun} running={running} label="Investigar sitio (POT, clima, materiales)" />
        </>
      )}

      {stage === 1 && (
        <>
          <textarea
            value={props.prompt}
            onChange={(e) => props.setPrompt(e.target.value)}
            rows={5}
            placeholder="Apartamento 2 alcobas de 58 m² en Bogotá…"
            className="w-full resize-none rounded-lg border border-white/10 bg-[#0a1120] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
          />
          {props.siteMemo && (
            <p className="mt-2 rounded-lg bg-cyan-500/[0.08] p-2 text-[10px] leading-relaxed text-cyan-200">
              📍 Ficha activa: {props.siteMemo.city ?? "—"} · clima {props.siteMemo.climate?.slice(0, 60) ?? "—"}…
            </p>
          )}
          <RunButton onClick={onRun} running={running} label="Bocetar planta arquitectónica" />
        </>
      )}

      {stage === 2 && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            El constructor y el ingeniero civil analizan el boceto EN PARALELO:
            materiales y métodos locales; sistema estructural y retícula (NSR-10).
          </p>
          <RunButton onClick={onRun} running={running} label="Convocar mesa de expertos" />
        </>
      )}

      {stage === 3 && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            El arquitecto adapta la planta a los memos: alinea muros a la retícula,
            respeta luces del sistema estructural.
          </p>
          {props.civilMemo?.system && (
            <p className="mt-2 rounded-lg bg-amber-500/[0.08] p-2 text-[10px] text-amber-200">
              🏗️ Sistema propuesto: {STRUCTURE_LABELS[props.civilMemo.system as keyof typeof STRUCTURE_LABELS] ?? props.civilMemo.system}
            </p>
          )}
          <RunButton onClick={onRun} running={running} label="Adaptar planta a expertos" />
        </>
      )}

      {stage === 4 && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            El experto eléctrico (RETIE) y el hidrosanitario (RAS) diseñan sus
            capas sobre la planta final, en paralelo.
          </p>
          <RunButton onClick={onRun} running={running} label="Diseñar instalaciones" />
        </>
      )}

      {stage === 5 && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Acabados por espacio y equipos sugeridos, coherentes con los
            materiales del constructor.
          </p>
          <RunButton onClick={onRun} running={running} label="Proponer acabados y equipos" doneLabel={props.equipment.length > 0 ? "✓ Acabados listos" : undefined} />
        </>
      )}
    </div>
  );
}

function RunButton({ onClick, running, label, doneLabel }: { onClick: () => void; running: boolean; label: string; doneLabel?: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={running}
      className="mt-3 w-full rounded-lg bg-blue-500/20 px-3 py-2.5 text-sm font-semibold text-blue-100 ring-1 ring-blue-400/40 transition hover:bg-blue-500/30 disabled:opacity-60"
    >
      {running ? "…" : doneLabel ?? `⚡ ${label}`}
    </button>
  );
}

// ── Consola de agentes en vivo ───────────────────────────────────────────────
// El estudio narrando su trabajo en tiempo real: pasos de cada persona,
// proveedores IA pensando, tokens escribiéndose, failovers y reparaciones.
const AGENT_META: Record<string, { icon: string; color: string }> = {
  urbanista: { icon: "📍", color: "text-cyan-300" },
  arquitecto: { icon: "🏛️", color: "text-blue-300" },
  constructor: { icon: "👷", color: "text-amber-300" },
  civil: { icon: "🏗️", color: "text-orange-300" },
  electrico: { icon: "⚡", color: "text-yellow-300" },
  hidro: { icon: "💧", color: "text-sky-300" },
  interiores: { icon: "🎨", color: "text-fuchsia-300" },
  mesa: { icon: "🛠️", color: "text-emerald-300" },
};

function AgentConsole({ lines, working }: {
  lines: Array<{ agent: string | null; kind: string; text: string }>;
  working: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [lines]);

  const kindClass: Record<string, string> = {
    say: "text-slate-200",
    delta: "text-emerald-300/80 font-mono",
    provider: "text-blue-300",
    status: "text-slate-400",
    fallback: "text-amber-300",
    error: "text-red-300",
  };
  const activeAgents = [...new Set(lines.map((l) => l.agent).filter(Boolean))];

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 overflow-hidden rounded-xl border border-white/[0.08] bg-[#050b14]/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-2 sm:w-[420px]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          {working ? (
            <span className="animate-pulse">
              {activeAgents.slice(0, 3).map((a) => AGENT_META[a ?? ""]?.icon).join(" ")} trabajando…
            </span>
          ) : (
            <span className="text-slate-500">Consola del estudio</span>
          )}
        </p>
        <span className={`h-2 w-2 shrink-0 rounded-full ${working ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} />
      </div>
      <div ref={boxRef} className="max-h-[38vh] space-y-0.5 overflow-y-auto px-3 py-2">
        {lines.map((l, i) => {
          const meta = l.agent ? AGENT_META[l.agent] : null;
          return (
            <p key={i} className={`text-[10.5px] leading-relaxed ${kindClass[l.kind] ?? "text-slate-300"}`}>
              {meta && l.kind !== "delta" && <span className={meta.color}>{meta.icon} </span>}
              {l.kind === "delta" && <span className="text-emerald-500/70">▎</span>}
              {l.text}
              {l.kind === "delta" && i === lines.length - 1 && <span className="animate-pulse text-emerald-300">▊</span>}
            </p>
          );
        })}
        {lines.length === 0 && <p className="text-[10.5px] text-slate-500">Iniciando…</p>}
      </div>
    </div>
  );
}

// ── Plano SVG con pan/zoom ───────────────────────────────────────────────────
function PlanSvg({ plan }: { plan: FloorPlan }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);

  const { width: W, depth: D } = plan.outline;
  const pad = 2.2;
  const full = { x: -pad, y: -pad, w: W + pad * 2, h: D + pad * 2 };
  const vb = view ?? full;

  useEffect(() => { setView(null); }, [W, D]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.12 : 0.89;
    setView((v) => {
      const base = v ?? full;
      const cx = base.x + base.w / 2;
      const cy = base.y + base.h / 2;
      const w = Math.min(base.w * k, full.w * 3);
      const h = w * (base.h / base.w);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  };

  const svgY = (m: number) => D - m; // SVG y invertida → CAD y arriba

  const roomsByLevel = useMemo(() => {
    const map = new Map<number, typeof plan.rooms>();
    for (const r of plan.rooms) {
      const arr = map.get(r.level) ?? [];
      arr.push(r);
      map.set(r.level, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan.rooms]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden"
      onWheel={onWheel}
      onPointerDown={(e) => { dragRef.current = { px: e.clientX, py: e.clientY, vx: vb.x, vy: vb.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const rect = hostRef.current?.getBoundingClientRect();
        if (!rect) return;
        const scale = vb.w / rect.width;
        setView({ ...vb, x: d.vx - (e.clientX - d.px) * scale, y: d.vy - (e.clientY - d.py) * scale });
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onDoubleClick={() => setView(null)}
      style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
    >
      <svg className="h-full w-full" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0a1120" />
        {roomsByLevel.map(([level, rooms]) => (
          <g key={level} transform={plan.levels > 1 ? `translate(${(W + pad * 2) * level + pad * level}, 0)` : undefined}>
            {/* Envuelvente */}
            <rect x={0} y={svgY(D)} width={W} height={D} fill="none" stroke="#e2e8f0" strokeWidth={0.09} />
            {/* Espacios */}
            {rooms.map((r) => {
              const c = ROOM_COLORS[r.type];
              return (
                <g key={`${r.name}-${level}`}>
                  <rect
                    x={r.x} y={svgY(r.y + r.depth)} width={r.width} height={r.depth}
                    fill={c} fillOpacity={0.16} stroke={c} strokeOpacity={0.85} strokeWidth={0.07}
                  />
                  <text x={r.x + r.width / 2} y={svgY(r.y + r.depth / 2) + 0.06} textAnchor="middle" fontSize={0.24} fill="#e2e8f0">
                    {r.name}
                  </text>
                  <text x={r.x + r.width / 2} y={svgY(r.y + r.depth / 2) - 0.28} textAnchor="middle" fontSize={0.19} fill="#94a3b8">
                    {roomArea(r).toFixed(1)} m²
                  </text>
                </g>
              );
            })}
            {/* Puertas: arco de giro */}
            {plan.doors.filter((d) => d.level === level).map((d, i) => {
              const dir = d.swing === "in" ? 1 : -1;
              const hx = d.hinge === "left" ? d.x - d.width / 2 : d.x + d.width / 2;
              return (
                <g key={`door-${i}`}>
                  <line x1={d.x - d.width / 2} y1={svgY(d.y)} x2={d.x + d.width / 2} y2={svgY(d.y)} stroke="#34d399" strokeWidth={0.05} />
                  <line x1={hx} y1={svgY(d.y)} x2={hx} y2={svgY(d.y + d.width * dir)} stroke="#34d399" strokeWidth={0.05} />
                  <path
                    d={`M ${d.x + d.width / 2 - (d.hinge === "left" ? d.width : 0) * 0} ${svgY(d.y)} A ${d.width} ${d.width} 0 0 ${dir === 1 ? 1 : 0} ${hx} ${svgY(d.y + d.width * dir)}`}
                    fill="none" stroke="#34d399" strokeWidth={0.04} strokeDasharray="0.15 0.1"
                  />
                </g>
              );
            })}
            {/* Ventanas */}
            {plan.windows.filter((w) => w.level === level).map((w, i) => {
              const r = rooms.find((rr) => rr.name.replace(/\s+/g, "").toLowerCase() === w.room.replace(/\s+/g, "").toLowerCase());
              if (!r) return null;
              const y2 = r.y + r.depth, x2 = r.x + r.width;
              if (w.wall === "norte" || w.wall === "sur") {
                const yy = w.wall === "norte" ? y2 : r.y;
                return <line key={`win-${i}`} x1={w.x - w.width / 2} y1={svgY(yy)} x2={w.x + w.width / 2} y2={svgY(yy)} stroke="#38bdf8" strokeWidth={0.1} />;
              }
              const xx = w.wall === "este" ? x2 : r.x;
              return <line key={`win-${i}`} x1={xx} y1={svgY(w.x - w.width / 2)} x2={xx} y2={svgY(w.x + w.width / 2)} stroke="#38bdf8" strokeWidth={0.1} />;
            })}
            {/* Retícula estructural */}
            {plan.structure?.axes.filter((a) => plan.levels === 1 || true).map((a, i) =>
              a.orientation === "vertical" ? (
                <g key={`ax-${i}`}>
                  <line x1={a.at} y1={svgY(-1.2)} x2={a.at} y2={svgY(D + 1.2)} stroke="#f87171" strokeWidth={0.04} strokeDasharray="0.4 0.25" />
                  <text x={a.at - 0.08} y={svgY(D + 1.5)} fontSize={0.26} fill="#f87171">{a.id}</text>
                </g>
              ) : (
                <g key={`ax-${i}`}>
                  <line x1={-1.2} y1={svgY(a.at)} x2={W + 1.2} y2={svgY(a.at)} stroke="#f87171" strokeWidth={0.04} strokeDasharray="0.4 0.25" />
                  <text x={-1.1} y={svgY(a.at) + 0.1} fontSize={0.26} fill="#f87171">{a.id}</text>
                </g>
              ),
            )}
            {/* Eléctrico */}
            {plan.electrical?.points.filter((p) => p.level === level).map((p, i) => (
              <g key={`el-${i}`}>
                <circle cx={p.x} cy={svgY(p.y)} r={0.13} fill="none" stroke="#fbbf24" strokeWidth={0.05} />
                <text x={p.x} y={svgY(p.y) + 0.08} textAnchor="middle" fontSize={0.16} fill="#fbbf24">
                  {p.kind === "tablero" ? "TB" : p.kind === "iluminacion" ? "L" : p.kind === "interruptor" ? "I" : p.kind === "tomacorriente_especial" ? "TE" : "T"}
                </text>
              </g>
            ))}
            {/* Hidrosanitario */}
            {plan.hydro?.points.filter((p) => p.level === level).map((p, i) => (
              <g key={`hy-${i}`}>
                <circle cx={p.x} cy={svgY(p.y)} r={0.14} fill="none" stroke="#60a5fa" strokeWidth={0.05} />
                <text x={p.x} y={svgY(p.y) + 0.08} textAnchor="middle" fontSize={0.14} fill="#93c5fd">
                  {p.kind === "sanitario" ? "SA" : p.kind === "lavamanos" ? "LM" : p.kind === "ducha" ? "DU" : p.kind === "lavaplatos" ? "LP" : p.kind === "lavadero" ? "LD" : p.kind === "calentador" ? "CA" : "PH"}
                </text>
              </g>
            ))}
            {/* Cotas totales */}
            <g stroke="#a78bfa" strokeWidth={0.045} fill="#c4b5fd">
              <line x1={0} y1={svgY(-0.9)} x2={W} y2={svgY(-0.9)} />
              <line x1={0} y1={svgY(-1.05)} x2={0} y2={svgY(-0.75)} />
              <line x1={W} y1={svgY(-1.05)} x2={W} y2={svgY(-0.75)} />
              <text x={W / 2} y={svgY(-1.2)} textAnchor="middle" fontSize={0.26}>{W.toFixed(2)} m</text>
              <line x1={-0.9} y1={svgY(0)} x2={-0.9} y2={svgY(D)} />
              <text x={-1.15} y={svgY(D / 2)} textAnchor="middle" fontSize={0.26} transform={`rotate(-90 ${-1.15} ${svgY(D / 2)})`}>{D.toFixed(2)} m</text>
            </g>
            {/* Título */}
            <text x={0} y={svgY(D + 1.9)} fontSize={0.3} fill="#e2e8f0">
              {plan.name}{plan.levels > 1 ? ` — Nivel ${level + 1}` : ""}
            </text>
          </g>
        ))}
      </svg>
      {/* Leyenda flotante */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-[#070d1a]/85 p-2 text-[9px] leading-relaxed text-slate-400 backdrop-blur">
        <p><span className="text-emerald-400">─</span> puertas · <span className="text-sky-400">━</span> ventanas · <span className="text-red-400">┄</span> retícula · <span className="text-amber-400">◯</span> eléctrico · <span className="text-blue-400">◯</span> hidro</p>
        <p className="mt-0.5 text-slate-500">arrastrar = mover · rueda = zoom · doble clic = ajustar</p>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-[#070d1a]/85 px-2.5 py-1.5 text-right backdrop-blur">
        <p className="text-xs font-semibold text-slate-200">{plan.name}</p>
        <p className="text-[10px] text-slate-500">
          {plan.levels} nivel(es) · {totalArea(plan).toFixed(1)} m²
          {plan.structure ? ` · ${STRUCTURE_LABELS[plan.structure.system]}` : ""}
        </p>
      </div>
    </div>
  );
}

// ── Expediente derecho: gates + memos ────────────────────────────────────────
function Dossier({ gates, plan, constructorMemo, civilMemo, equipment, revisions }: {
  gates: Gate[] | null; plan: FloorPlan | null;
  constructorMemo: ConstructorMemo | null; civilMemo: CivilMemo | null;
  equipment: Equipment; revisions: RevisionLog[];
}) {
  return (
    <div className="space-y-3">
      {/* Puertas de verificación */}
      {gates?.map((g) => {
        const fails = gateFails(g);
        return (
          <div key={g.stage} className={`rounded-xl border p-3 ${fails === 0 ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.05]"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${fails === 0 ? "text-emerald-300" : "text-amber-300"}`}>
              {fails === 0 ? "✓" : "⚠"} {g.title} {fails > 0 && `· ${fails} por corregir`}
            </p>
            <div className="mt-1.5 space-y-1">
              {g.checks.filter((c) => !c.pass).slice(0, 6).map((c) => (
                <p key={c.id} className="text-[10px] leading-relaxed text-amber-200/90">
                  ✗ <span className="font-medium">{c.label}:</span> {c.detail}
                  {c.ref && <span className="text-amber-500/70"> ({c.ref})</span>}
                </p>
              ))}
              {fails === 0 && <p className="text-[10px] text-emerald-200/80">Todas las verificaciones pasaron ({g.checks.length} checks)</p>}
            </div>
          </div>
        );
      })}

      {/* Memoria de diseño del arquitecto (por qué así) */}
      {plan?.designReport && (
        <Memo title="🏛️ Memoria de diseño — por qué así">
          {plan.designReport.orientation && <p className="text-[10px] leading-relaxed text-slate-300">🧭 <span className="text-slate-500">Orientación:</span> {plan.designReport.orientation}</p>}
          {plan.designReport.wind && <p className="text-[10px] leading-relaxed text-slate-300">🌬️ <span className="text-slate-500">Ventilación:</span> {plan.designReport.wind}</p>}
          {plan.designReport.lighting && <p className="text-[10px] leading-relaxed text-slate-300">💡 <span className="text-slate-500">Iluminación:</span> {plan.designReport.lighting}</p>}
          {plan.designReport.zoning && <p className="text-[10px] leading-relaxed text-slate-300">🏘️ <span className="text-slate-500">Zonificación:</span> {plan.designReport.zoning}</p>}
          {plan.designReport.dimensioning && <p className="text-[10px] leading-relaxed text-slate-300">📐 <span className="text-slate-500">Dimensionamiento:</span> {plan.designReport.dimensioning}</p>}
          {plan.designReport.decisions.slice(0, 6).map((d, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-slate-400">• <span className="text-slate-300">{d.issue}:</span> {d.decision} — <span className="text-slate-500">{d.reason}</span></p>
          ))}
        </Memo>
      )}

      {/* Registro de revisiones del profesional */}
      {revisions.length > 0 && (
        <Memo title={`📝 Revisiones del profesional (${revisions.length})`}>
          {revisions.map((rev, i) => (
            <div key={i} className="rounded-lg bg-white/[0.03] p-2">
              <p className="text-[10px] text-amber-200">R{i + 1} · "{rev.feedback.slice(0, 90)}"</p>
              {rev.changes.map((c, j) => (
                <p key={j} className="text-[10px] leading-relaxed text-slate-300">✏️ {c.change} — <span className="text-slate-500">{c.why}</span></p>
              ))}
            </div>
          ))}
        </Memo>
      )}

      {/* Memo constructor */}
      {constructorMemo && (
        <Memo title="👷 Constructor — materiales y métodos">
          {constructorMemo.materials?.slice(0, 8).map((m, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-slate-300">
              <span className="text-slate-500">{m.element}:</span> {m.suggestion} — <span className="text-slate-500">{m.reason}</span>
            </p>
          ))}
          {constructorMemo.methods?.slice(0, 4).map((m, i) => (
            <p key={`m${i}`} className="text-[10px] leading-relaxed text-slate-400">
              🔧 {m.stage}: {m.suggestion}
            </p>
          ))}
        </Memo>
      )}

      {/* Memo ingeniero civil */}
      {civilMemo && (
        <Memo title="🏗️ Ingeniero Civil — estructura (NSR-10)">
          <p className="text-[10px] font-medium text-slate-200">
            {STRUCTURE_LABELS[civilMemo.system as keyof typeof STRUCTURE_LABELS] ?? civilMemo.system}
            {civilMemo.foundation ? ` · ${civilMemo.foundation}` : ""}
          </p>
          <p className="text-[10px] leading-relaxed text-slate-400">{civilMemo.justification}</p>
          {civilMemo.spanWarnings?.slice(0, 3).map((w, i) => (
            <p key={i} className="text-[10px] text-amber-300/80">⚠ {w}</p>
          ))}
        </Memo>
      )}

      {/* Tabla resumen de espacios */}
      {plan && plan.rooms.length > 0 && (
        <Memo title="📋 Programa de espacios">
          <div className="space-y-0.5">
            {plan.rooms.map((r) => (
              <div key={r.name} className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate text-slate-300">{r.name}</span>
                <span className="shrink-0 font-mono text-slate-500">
                  {r.width.toFixed(1)}×{r.depth.toFixed(1)} · {roomArea(r).toFixed(1)} m²
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[10px] font-medium text-slate-300">
            Total: {totalArea(plan).toFixed(1)} m² · {plan.levels} nivel(es)
          </p>
        </Memo>
      )}

      {/* Acabados */}
      {plan?.finishes && plan.finishes.length > 0 && (
        <Memo title="🎨 Acabados por espacio">
          {plan.finishes.map((f, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-slate-300">
              <span className="text-slate-500">{f.room}:</span> {f.floor} · {f.walls}
            </p>
          ))}
        </Memo>
      )}

      {/* Equipos */}
      {equipment.length > 0 && (
        <Memo title="🔌 Equipos sugeridos">
          {equipment.map((e, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-slate-300">
              • {e.item}{e.room ? <span className="text-slate-500"> ({e.room})</span> : null}
            </p>
          ))}
        </Memo>
      )}

      {!gates && !constructorMemo && !civilMemo && (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
          El expediente se construye etapa por etapa: verificaciones, memos de
          expertos, programa y acabados.
        </p>
      )}
    </div>
  );
}

function Memo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "plano";
}
