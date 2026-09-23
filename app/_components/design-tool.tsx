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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type FloorPlan,
  roomArea,
  totalArea,
  sanitizeFloorPlan,
  ROOM_COLORS,
  STRUCTURE_LABELS,
} from "@/lib/design/schema";
import type { Gate } from "@/lib/design/validate";
import { gateFails } from "@/lib/design/validate";
import { penWidth, PEN_BY_LAYER } from "@/lib/design/knowledge";
import { planToDxf } from "@/lib/design/dxf";
import { planToIfc } from "@/lib/design/ifc";
import { buildLicenseExpediente } from "@/lib/design/expediente";
import { sectionPrimitives, facadePrimitives, sheetPrimitives, primsBounds, plantaPrimitives, areaTablePrimitives, type Prim } from "@/lib/design/views";
import { furnishRoom, labelSpot } from "@/lib/design/symbols";
import { takeoff } from "@/lib/passport/takeoff";
import { valueTakeoff, recommendations } from "@/lib/passport/value";
import { buildEnvironmentalReport } from "@/lib/passport/report";
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

// SHA del build (inyectado en build-time). Visible en el stepper: con una
// captura sabemos de inmediato si un dispositivo corre un build viejo.
const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev").slice(0, 7);

/** Convierte cualquier crash de render en un mensaje visible — jamás pantalla en blanco. */
class DesignErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-semibold">El estudio tuvo un error interno.</p>
            <p className="mt-1 break-words font-mono text-[11px] text-red-300/80">
              {String(this.state.error?.message ?? this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold ring-1 ring-red-400/40 hover:bg-red-500/30"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DesignToolInner({ projectSlug, initialPrompt }: { projectSlug?: string; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  // 🖼️ Referencia visual del cliente para el boceto (data URL ≤1024px).
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
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
  const [promptOpen, setPromptOpen] = useState(true); // barra ámbar minimizable
  const [revisions, setRevisions] = useState<RevisionLog[]>([]);
  const [revBusy, setRevBusy] = useState(false);
  // Vista del centro: planta, corte, fachadas o LÁMINA completa.
  const [view, setView] = useState<"planta" | "corte" | "fachadas" | "lamina" | "pasaporte">("planta");
  // 🖨️ Vista previa de IMPRESIÓN B/N: curaduría imprime en láser blanco y
  // negro — así se ve si el plano sobrevive la fotocopiadora.
  const [printMode, setPrintMode] = useState(false);
  // 📄 Láminas A-01/A-02/A-03 en A2 apaisado, monocromas — Ctrl+P → PDF vectorial.
  const [sheetsOpen, setSheetsOpen] = useState(false);
  // El PLANO es el protagonista: paneles como drawers overlay (estilo Figma).
  // Sin plan aún, el estudio (form) ocupa el centro.
  // El estudio arranca ABIERTO: antes, al aparecer el plan el panel se
  // ocultaba solo y el flujo parecía "morirse". Ahora solo el usuario lo cierra.
  const [drawer, setDrawer] = useState<"estudio" | "expediente" | null>("estudio");

  // Consola en vivo: líneas {agent, kind, text} — deltas coalescidos.
  const [consoleLines, setConsoleLines] = useState<Array<{ agent: string | null; kind: "say" | "delta" | "provider" | "status" | "fallback" | "error"; text: string }>>([]);

  useEffect(() => { if (initialPrompt) setPrompt(initialPrompt); }, [initialPrompt]);
  // Ultimo plano disponible para la herramienta Pasaporte (tool propia).
  useEffect(() => {
    if (plan) { try { localStorage.setItem("obrahub-last-plan", JSON.stringify(plan)); } catch { /* */ } }
  }, [plan]);

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
      const data = await callWithRetries({ stage: "draft", prompt, siteMemo, ...(referenceImage ? { referenceImages: [referenceImage] } : {}) });
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

  // Modelo BIM 3D: obra gris por capas + instalaciones (IFC4).
  const ifcBlob = useMemo(() => {
    if (!plan) return null;
    return new Blob([planToIfc(plan)], { type: "application/x-step" });
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

  const downloadIfc = () => {
    if (!ifcBlob || !plan) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(ifcBlob);
    a.download = `${slugify(plan.name)}.ifc`;
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
        <span
          className="ml-auto shrink-0 self-center px-1 text-[9px] font-mono text-slate-700"
          title={`Build ${process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"} — si esto no coincide con el último deploy, tu navegador tiene caché vieja (Ctrl+Shift+R)`}
        >
          v{BUILD_SHA}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop móvil/tablet cuando un drawer está abierto */}
        {drawer && (
          <button
            type="button" aria-label="Cerrar panel"
            onClick={() => setDrawer(null)}
            className="absolute inset-0 z-20 bg-black/50 lg:hidden"
          />
        )}
        {/* Drawer ESTUDIO (etapa + acciones) — overlay. EL PLANO ES EL
            PROTAGONISTA: se puede cerrar SIEMPRE (con o sin plan) desde ⚙️
            Estudio; sin plan, el centro ofrece un CTA para reabrirlo. */}
        {drawer === "estudio" && (
        <div className="absolute inset-y-0 left-0 z-30 flex w-[88%] max-w-sm flex-col gap-3 overflow-y-auto border-r border-white/[0.1] bg-[#070d1a]/95 p-3 backdrop-blur-xl lg:w-80">
          <StagePanel
            stage={stage}
            prompt={prompt} setPrompt={setPrompt}
            location={location} setLocation={setLocation}
            siteMemo={siteMemo} plan={plan} constructorMemo={constructorMemo}
            civilMemo={civilMemo} equipment={equipment}
            busy={busy} onRun={() => runStage(stage)}
            referenceImage={referenceImage} setReferenceImage={setReferenceImage}
          />
          {providerInfo && <p className="text-[10px] text-slate-500">⚡ {providerInfo}</p>}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
          )}

          {/* Paquete de licencia de construcción */}
          {plan && (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
                🏛️ Paquete de licencia
              </p>
              <div className="mt-2 space-y-1 text-[10px] text-slate-300">
                <p>✅ Modelo BIM IFC (muros por capas, estructura, MEP)</p>
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
              <button
                type="button" onClick={downloadIfc}
                className="w-full rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-100 ring-1 ring-sky-400/30 transition hover:bg-sky-500/30"
              >
                🧱 Descargar modelo IFC 3D (obra gris + instalaciones)
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
        )}

        {/* ✏️ Modificar cualquier detalle con prompt — siempre accesible;
            minimizable a un botón para dejar el plano protagonista. */}
        {plan && !revBusy && !promptOpen && (
          <button
            type="button" onClick={() => setPromptOpen(true)}
            title="Modificar cualquier detalle del plano"
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-500/40 bg-[#070d1a]/92 px-4 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur-xl transition hover:bg-amber-500/20"
          >
            ✏️ Modificar
          </button>
        )}
        {plan && !revBusy && promptOpen && (
          <div className="absolute bottom-2 left-1/2 z-10 w-[94%] max-w-2xl -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-[#070d1a]/92 p-1.5 backdrop-blur-xl">
              <span className="pl-2 text-sm">✏️</span>
              <input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Modifica cualquier detalle: «agrupa baño con lavandería», «agranda la sala a 4×3.5», «más ventanas al norte»…"
                className="min-w-0 flex-1 bg-transparent px-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
              <button
                type="button" onClick={runRevise} disabled={!feedback.trim()}
                className="shrink-0 rounded-lg bg-amber-500/25 px-3 py-1.5 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-400/40 transition hover:bg-amber-500/40 disabled:opacity-40"
              >
                Redibujar
              </button>
              <button
                type="button" onClick={() => setPromptOpen(false)}
                title="Minimizar — más espacio para el plano"
                aria-label="Minimizar barra de modificación"
                className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
              >
                ▾
              </button>
            </div>
          </div>
        )}
        {revBusy && (
          <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 animate-pulse rounded-xl border border-amber-400/40 bg-[#070d1a]/92 px-4 py-2 text-xs font-semibold text-amber-200 backdrop-blur-xl">
            ✏️ Arquitecto redibujando con tus cambios… (mira la consola)
          </div>
        )}

        {/* Botones flotantes para abrir drawers — el plano manda.
            ⚙️ Estudio SIEMPRE visible: el usuario decide cuándo ver textos. */}
        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <button type="button" onClick={() => setDrawer(drawer === "estudio" ? null : "estudio")}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur transition ${drawer === "estudio" ? "border-blue-400/50 bg-blue-500/25 text-blue-100" : "border-white/[0.08] bg-[#0a1120]/85 text-slate-300 hover:bg-white/[0.08]"}`}>
            ⚙️ Estudio
          </button>
          {plan && (
            <button type="button" onClick={() => setDrawer(drawer === "expediente" ? null : "expediente")}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur transition ${drawer === "expediente" ? "border-blue-400/50 bg-blue-500/25 text-blue-100" : "border-white/[0.08] bg-[#0a1120]/85 text-slate-300 hover:bg-white/[0.08]"}`}>
              📋 Expediente
            </button>
          )}
        </div>

        {/* Centro: plano SVG + consola de agentes en vivo */}
        <div className={`absolute inset-0 ${printMode ? "bg-white" : "bg-[#0a1120]"}`} style={printMode ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}>
          {plan && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0a1120]/85 p-0.5 backdrop-blur">
              {([["planta", "📐 Planta"], ["corte", "✂️ Corte"], ["fachadas", "🏞️ Fachadas"], ["lamina", "🗂️ Lámina"], ["pasaporte", "🌱 Pasaporte"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setView(id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${view === id ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30" : "text-slate-400 hover:bg-white/[0.06]"}`}>
                  {label}
                </button>
              ))}
              <button
                type="button" onClick={() => setPrintMode((v) => !v)}
                title="Vista previa de impresión B/N — como la ve curaduría"
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${printMode ? "bg-zinc-400/30 text-zinc-100 ring-1 ring-zinc-300/40" : "text-slate-400 hover:bg-white/[0.06]"}`}>
                🖨️ B/N
              </button>
              <button
                type="button" onClick={() => setSheetsOpen(true)}
                title="Láminas A-01/A-02/A-03 en A2 — imprimir o guardar como PDF"
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.06]">
                📄 PDF
              </button>
            </div>
          )}
          {plan ? (
            view === "planta" ? <PlanSvg plan={plan} onEdit={(np) => setPlan(np)} />
            : view === "corte" ? <PrimsSvg prims={sectionPrimitives(plan)} title="Cortes" />
            : view === "fachadas" ? <PrimsSvg prims={(["sur", "oeste", "este", "norte"] as const).flatMap((side) => facadePrimitives(plan, side))} title="Fachadas" />
            : view === "pasaporte" ? <PassportPanel plan={plan} />
            : <PrimsSvg prims={sheetPrimitives(plan)} title="Lámina de curaduría" fitSmall />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">✏️</div>
                <p className="text-sm text-slate-400">El plano aparece aquí cuando el arquitecto termine el boceto.</p>
                <p className="mt-1 text-xs text-slate-600">Empieza por la ficha de sitio (etapa 0).</p>
                {drawer !== "estudio" && (
                  <button
                    type="button"
                    onClick={() => setDrawer("estudio")}
                    className="mt-4 rounded-lg bg-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-100 ring-1 ring-blue-400/40 transition hover:bg-blue-500/30"
                  >
                    📍 Abrir el estudio de sitio
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Consola EN VIVO — el estudio narrando su trabajo (como un agente) */}
          {(busy !== null || consoleLines.length > 0) && (
            <AgentConsole lines={consoleLines} working={busy !== null} />
          )}
        </div>

        {sheetsOpen && plan && (
          <PrintSheets plan={plan} onClose={() => setSheetsOpen(false)} />
        )}

        {/* Drawer EXPEDIENTE (gates + memos + memoria + revisiones) */}
        {drawer === "expediente" && (
        <div className="absolute inset-y-0 right-0 z-30 w-[88%] max-w-sm overflow-y-auto border-l border-white/[0.1] bg-[#070d1a]/95 p-3 backdrop-blur-xl lg:w-80">
          <Dossier
            gates={gates} plan={plan}
            constructorMemo={constructorMemo} civilMemo={civilMemo}
            equipment={equipment} revisions={revisions}
          />
        </div>
        )}
      </div>
    </div>
  );
}

/** Export blindado: cualquier crash de render se muestra, nunca pantalla vacía. */
export function DesignTool(props: { projectSlug?: string; initialPrompt?: string }) {
  return (
    <DesignErrorBoundary>
      <DesignToolInner {...props} />
    </DesignErrorBoundary>
  );
}

// ── Panel de la etapa activa ─────────────────────────────────────────────────
function StagePanel(props: {
  stage: Stage; prompt: string; setPrompt: (v: string) => void;
  location: string; setLocation: (v: string) => void;
  siteMemo: SiteMemo | null; plan: FloorPlan | null;
  constructorMemo: ConstructorMemo | null; civilMemo: CivilMemo | null;
  equipment: Equipment; busy: Stage | null; onRun: () => void;
  referenceImage: string | null; setReferenceImage: (v: string | null) => void;
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
          {/* 🖼️ Referencia visual del cliente — "lo que tengo en la mente" */}
          <div className="mt-2">
            {props.referenceImage ? (
              <div className="relative overflow-hidden rounded-lg border border-violet-500/30">
                <img src={props.referenceImage} alt="Referencia del cliente" className="h-28 w-full object-cover" />
                <button
                  type="button" onClick={() => props.setReferenceImage(null)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 hover:bg-red-600/80"
                >
                  ✕ quitar
                </button>
                <p className="bg-violet-500/15 px-2 py-1 text-[10px] text-violet-200">
                  🖼️ El arquitecto usará esta referencia (distribución, proporciones, estilo)
                </p>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/[0.05] px-3 py-2.5 text-[11px] text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/10">
                🖼️ Subir imagen de referencia (plano o foto de lo que imaginas)
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!f || !f.type.startsWith("image/")) return;
                    // Redimensiona en el cliente (≤1024px, JPEG) — payload liviano.
                    const img = new Image();
                    img.onload = () => {
                      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
                      const c = document.createElement("canvas");
                      c.width = Math.round(img.width * k);
                      c.height = Math.round(img.height * k);
                      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
                      props.setReferenceImage(c.toDataURL("image/jpeg", 0.78));
                    };
                    img.src = URL.createObjectURL(f);
                  }}
                />
              </label>
            )}
          </div>
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

// ── SVG genérico de primitivas (corte/fachadas — vistas.ts) ─────────────────
const PRIM_COLORS: Record<string, string> = {
  CORTE: "#e2e8f0",
  "FACHADA-NORTE": "#38bdf8", "FACHADA-SUR": "#38bdf8",
  "FACHADA-ESTE": "#38bdf8", "FACHADA-OESTE": "#38bdf8",
  EJES: "#f87171", COTAS: "#a78bfa", TEXTOS: "#cbd5e1",
  MOBILIARIO: "#d4b483", SANITARIOS: "#7dd3fc", MUROS: "#e2e8f0",
};

// Grosor de línea NORMATIVO: plumas ISO 128 a ESC 1:75 desde la KB
// (knowledge.ts PENS + penWidth) — corte 0.70 mm, perfil 0.35, textura
// 0.25, auxiliar 0.13. La jerarquía 2:1 hace que el plano se lea por
// pesos, como enseña Ching §2. Nada de números mágicos aquí.

/** Grosor en PÍXELES constante (non-scaling-stroke) para cortes/fachadas:
 *  en pantalla el viewBox se ajusta a ~14 m y las plumas a escala de modelo
 *  quedaban 2-3× más gruesas que en papel. Con grosor fijo en px la
 *  jerarquía ISO se conserva y el zoom no engorda las líneas (como el
 *  "lineweight display" de CAD). */
const PEN_PX: Record<string, number> = { cut: 2.1, profile: 1.25, thin: 0.9, extra: 0.7 };
function penPx(layer: string, thin = false): number {
  const base = PEN_PX[PEN_BY_LAYER[layer] ?? "profile"];
  return thin ? base * 0.75 : base;
}

function PrimsSvg({ prims, title, fitSmall }: { prims: Prim[]; title: string; fitSmall?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);

  const b = primsBounds(prims);
  const pad = fitSmall ? 0.8 : 1.2;
  // sy() mapea CAD→SVG invirtiendo Y: el contenido vive en [minY-pad, maxY+pad].
  const full = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
  const vb = view ?? full;

  useEffect(() => { setView(null); }, [prims]);

  // Pan/zoom IDÉNTICO al de la planta (misma experiencia en cortes/fachadas).
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.12 : 0.89;
    setView((v) => {
      const base = v ?? full;
      const cx = base.x + base.w / 2;
      const cy = base.y + base.h / 2;
      const w = Math.min(base.w * k, full.w * 4);
      const h = w * (base.h / base.w);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  };

  // SVG Y invertida respecto a CAD.
  const sy = (y: number) => b.maxY + pad - (y - (b.minY - pad));

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
        <defs>
          {/* Sombra proyectada 45° (Ching §shades): profundidad inmediata,
              unidades de MODELO para escalar con el zoom. */}
          <filter id="plan-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.09" dy="-0.09" stdDeviation="0.035" floodOpacity="0.38" />
          </filter>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0a1120" />
        {prims.map((p, i) => {
          if (p.t === "F") {
            // Poché: TONO, no barra — opacidad moderada para que la mancha
            // lea como material cortado sin tapar el dibujo (Ching).
            return (
              <rect key={`f${i}`} x={p.x} y={sy(p.y + p.h)} width={p.w} height={p.h}
                fill={PRIM_COLORS[p.l] ?? "#94a3b8"} fillOpacity={0.45} />
            );
          }
          if (p.t === "H") {
            return (
              <rect key={`h${i}`} x={p.x} y={sy(p.y + p.h)} width={p.w} height={p.h}
                fill="none" stroke={PRIM_COLORS[p.l] ?? "#94a3b8"} strokeWidth={penPx(p.l)} vectorEffect="non-scaling-stroke" />
            );
          }
          if (p.t === "L") {
            return (
              <line key={`l${i}`} x1={p.x1} y1={sy(p.y1)} x2={p.x2} y2={sy(p.y2)}
                stroke={PRIM_COLORS[p.l] ?? "#94a3b8"}
                strokeWidth={penPx(p.l, p.thin)} vectorEffect="non-scaling-stroke"
                strokeDasharray={p.dash ? "0.4 0.25" : undefined} />
            );
          }
          if (p.t === "C") {
            return (
              <circle key={`c${i}`} cx={p.x} cy={sy(p.y)} r={p.r}
                fill="none" stroke={PRIM_COLORS[p.l] ?? "#f87171"} strokeWidth={penPx(p.l)} vectorEffect="non-scaling-stroke" />
            );
          }
          return (
            <text key={`t${i}`} x={p.x} y={sy(p.y)} fontSize={p.h} fill={PRIM_COLORS[p.l] ?? "#cbd5e1"}
              transform={p.r ? `rotate(${180 - p.r} ${p.x} ${sy(p.y)})` : undefined}>
              {p.s}
            </text>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute right-2 bottom-16 rounded-lg bg-[#070d1a]/85 px-2.5 py-1.5 backdrop-blur sm:bottom-2">
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        <p className="text-[10px] text-slate-500">arrastra para mover · rueda para zoom · doble clic reencuadra</p>
      </div>
    </div>
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
  const [elapsed, setElapsed] = useState(0);
  // Minimizable: el usuario manda sobre el espacio — pero cuando el estudio
  // trabaja, la consola se expande sola para narrar.
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!working) return;
    setMinimized(false); // auto-expandir al arrancar una etapa
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [working]);
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
              <span className="ml-1 font-mono text-emerald-300">⏱ {elapsed}s</span>
            </span>
          ) : (
            <span className="text-slate-500">Consola del estudio</span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${working ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} />
          <button
            type="button" onClick={() => setMinimized((m) => !m)}
            title={minimized ? "Expandir consola" : "Minimizar consola — más plano"}
            aria-label={minimized ? "Expandir consola" : "Minimizar consola"}
            className="rounded px-1.5 text-[11px] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          >
            {minimized ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {!minimized && (
        <div ref={boxRef} className="max-h-[30vh] space-y-0.5 overflow-y-auto px-3 py-2">
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
      )}
    </div>
  );
}

// ── Plano SVG con pan/zoom ───────────────────────────────────────────────────
function PlanSvg({ plan, onEdit }: { plan: FloorPlan; onEdit: (next: FloorPlan) => void }) {
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

  // Mobiliario simbólico (Neufert/Panero) por nivel con el SOLVER
  // anti-amontonamiento (puertas + colisiones) + spots de etiqueta libres.
  const layoutByLevel = useMemo(() => {
    const fur = new Map<number, Prim[]>();
    const spots = new Map<string, { x: number; y: number }>();
    for (const [level, rooms] of roomsByLevel) {
      const out: Prim[] = [];
      const doors = plan.doors.filter((d) => d.level === level);
      for (const r of rooms) {
        const placed = furnishRoom(out, r, doors, r.name.toLowerCase().includes("principal"));
        spots.set(`${level}:${r.name}`, labelSpot(r, placed));
      }
      fur.set(level, out);
    }
    return { fur, spots };
  }, [roomsByLevel, plan.doors]);

  // EDICION DIRECTA: arrastrar vanos y muros (Ching: el plano se corrige en
  // el plano). Screen->modelo respetando viewBox "meet", snap 5 cm, y el
  // sanitizador re-deriva bisagras/giros/mobiliario/cotas al soltar.
  const svgRef = useRef<SVGSVGElement>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const editDrag = useRef<{ kind: "door" | "window" | "wall"; i: number; axis: "x" | "y"; at: number; moved: boolean } | null>(null);
  const toModel = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
    const ox = (rect.width - vb.w * scale) / 2;
    const oy = (rect.height - vb.h * scale) / 2;
    const mx = vb.x + (e.clientX - rect.left - ox) / scale;
    const my = vb.y + (e.clientY - rect.top - oy) / scale;
    return { x: mx, y: D - my };
  };
  const snap5 = (n: number) => Math.round(n * 20) / 20;
  const keyName = (s: string) => s.toLowerCase().split(" ").join("");
  const useful = (axis: "x" | "y", at: number, w: number) => {
    const rs = plan.rooms.filter((r) => r.level === 0 && (axis === "x"
      ? Math.abs(r.y + r.depth - at) < 0.06 || Math.abs(r.y - at) < 0.06
      : Math.abs(r.x + r.width - at) < 0.06 || Math.abs(r.x - at) < 0.06));
    if (rs.length === 0) return null;
    const lo = axis === "x" ? Math.max(...rs.map((r) => r.x)) : Math.max(...rs.map((r) => r.y));
    const hi = axis === "x" ? Math.min(...rs.map((r) => r.x + r.width)) : Math.min(...rs.map((r) => r.y + r.depth));
    if (hi - lo < w + 0.25) return null;
    return { lo: lo + 0.1 + w / 2, hi: hi - 0.1 - w / 2 };
  };
  const applyEdit = () => {
    const dg = editDrag.current;
    if (!dg) return;
    if (dg.kind === "door" && !dg.moved) {
      const doors = plan.doors.map((d, idx) => idx === dg.i ? { ...d, hinge: d.hinge === "left" ? "right" : "left" } : d);
      onEdit(sanitizeFloorPlan({ ...plan, doors }));
      return;
    }
    const pt = lastPt.current;
    if (!pt) return;
    if (dg.kind === "door") {
      const d = plan.doors[dg.i];
      const seg = useful(d.axis === "y" ? "y" : "x", d.axis === "y" ? d.x : d.y, d.width);
      if (!seg) return;
      const along = Math.min(seg.hi, Math.max(seg.lo, snap5(d.axis === "y" ? pt.y : pt.x)));
      const doors = plan.doors.map((dd, idx) => idx === dg.i ? { ...dd, along } : dd);
      onEdit(sanitizeFloorPlan({ ...plan, doors }));
    } else if (dg.kind === "window") {
      const w = plan.windows[dg.i];
      const room = plan.rooms.find((r) => r.level === w.level && keyName(r.name) === keyName(w.room));
      if (!room) return;
      const horiz = w.wall === "norte" || w.wall === "sur";
      const lo = (horiz ? room.x : room.y) + 0.1 + w.width / 2;
      const hi = (horiz ? room.x + room.width : room.y + room.depth) - 0.1 - w.width / 2;
      if (hi < lo) return;
      const x = Math.min(hi, Math.max(lo, snap5(horiz ? pt.x : pt.y)));
      const windows = plan.windows.map((ww, idx) => idx === dg.i ? { ...ww, x } : ww);
      onEdit(sanitizeFloorPlan({ ...plan, windows }));
    } else if (dg.kind === "wall") {
      const at = snap5(dg.axis === "x" ? pt.y : pt.x);
      const delta = at - dg.at;
      if (Math.abs(delta) < 0.01) return;
      const rooms = plan.rooms.map((r) => {
        if (r.level !== 0) return r;
        if (dg.axis === "x") {
          if (Math.abs(r.y + r.depth - dg.at) < 0.06) { const nd = r.depth + delta; return nd >= 1.2 ? { ...r, depth: nd } : r; }
          if (Math.abs(r.y - dg.at) < 0.06) { const nd = r.depth - delta; return nd >= 1.2 ? { ...r, y: at, depth: nd } : r; }
        } else {
          if (Math.abs(r.x + r.width - dg.at) < 0.06) { const nw = r.width + delta; return nw >= 1.2 ? { ...r, width: nw } : r; }
          if (Math.abs(r.x - dg.at) < 0.06) { const nw = r.width - delta; return nw >= 1.2 ? { ...r, x: at, width: nw } : r; }
        }
        return r;
      });
      onEdit(sanitizeFloorPlan({ ...plan, rooms }));
    }
  };
  const onEditPointerDown = (e: React.PointerEvent, kind: "door" | "window" | "wall", i: number, axis: "x" | "y", at: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    editDrag.current = { kind, i, axis, at, moved: false };
    lastPt.current = toModel(e);
  };
  const onEditPointerMove = (e: React.PointerEvent) => {
    if (!editDrag.current) return;
    e.stopPropagation();
    const pt = toModel(e);
    if (!pt) return;
    lastPt.current = pt;
    editDrag.current.moved = true;
  };
  const onEditPointerUp = () => {
    if (!editDrag.current) return;
    applyEdit();
    editDrag.current = null;
  };

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
      <svg ref={svgRef} className="h-full w-full" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Sombra proyectada 45° (Ching §shades): profundidad inmediata,
              unidades de MODELO para escalar con el zoom. */}
          <filter id="plan-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.09" dy="-0.09" stdDeviation="0.035" floodOpacity="0.38" />
          </filter>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0a1120" />
        {roomsByLevel.map(([level, rooms]) => (
          <g key={level} transform={plan.levels > 1 ? `translate(${(W + pad * 2) * level + pad * level}, 0)` : undefined}>
            {/* Envuelvente */}
            <rect x={0} y={svgY(D)} width={W} height={D} fill="none" stroke="#e2e8f0" filter="url(#plan-shadow)" strokeWidth={penWidth("MUROS")} />
            {/* Espacios — etiqueta en hueco libre (anti-tapado por muebles) */}
            {rooms.map((r) => {
              const c = ROOM_COLORS[r.type];
              const spot = layoutByLevel.spots.get(`${level}:${r.name}`) ?? { x: r.x + r.width / 2, y: r.y + r.depth / 2 };
              return (
                <g key={`${r.name}-${level}`}>
                  <rect
                    x={r.x} y={svgY(r.y + r.depth)} width={r.width} height={r.depth}
                    fill={c} fillOpacity={0.16} stroke={c} strokeOpacity={0.85} strokeWidth={penWidth("MUROS")}
                  />
                  <text x={spot.x} y={svgY(spot.y) + 0.06} textAnchor="middle" fontSize={0.24} fill="#e2e8f0">
                    {r.name}
                  </text>
                  <text x={spot.x} y={svgY(spot.y) - 0.28} textAnchor="middle" fontSize={0.19} fill="#94a3b8">
                    {roomArea(r).toFixed(1)} m²
                  </text>
                </g>
              );
            })}
            {/* Puertas: geometría DERIVADA (axis + swingDir del sanitizador) —
                vano sobre su muro, hoja perpendicular al interior y cuerda
                de giro discontinua (Ching). */}
            {plan.doors.filter((d) => d.level === level).map((d, i) => {
              const isY = d.axis === "y";
              const sd = d.swingDir ?? 1;
              const half = d.width / 2;
              const [o1x, o1y] = isY ? [d.x, d.y - half] : [d.x - half, d.y];
              const [o2x, o2y] = isY ? [d.x, d.y + half] : [d.x + half, d.y];
              const [hgx, hgy] = d.hinge === "left"
                ? (isY ? [d.x, d.y - half] : [d.x - half, d.y])
                : (isY ? [d.x, d.y + half] : [d.x + half, d.y]);
              const [tipx, tipy] = isY ? [hgx + d.width * sd, hgy] : [hgx, hgy + d.width * sd];
              return (
                <g key={`door-${i}`}>
                  {/* vano */}
                  <line x1={o1x} y1={svgY(o1y)} x2={o2x} y2={svgY(o2y)} stroke="#34d399" strokeWidth={penWidth("PUERTAS")} />
                  {/* hoja */}
                  <line x1={hgx} y1={svgY(hgy)} x2={tipx} y2={svgY(tipy)} stroke="#34d399" strokeWidth={penWidth("PUERTAS")} />
                  {/* cuerda de giro */}
                  <line x1={tipx} y1={svgY(tipy)} x2={o2x} y2={svgY(o2y)} stroke="#34d399" strokeWidth={penWidth("PUERTAS", true)} strokeDasharray="0.15 0.1" />
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
                return <line key={`win-${i}`} x1={w.x - w.width / 2} y1={svgY(yy)} x2={w.x + w.width / 2} y2={svgY(yy)} stroke="#38bdf8" strokeWidth={penWidth("VENTANAS")} />;
              }
              const xx = w.wall === "este" ? x2 : r.x;
              return <line key={`win-${i}`} x1={xx} y1={svgY(w.x - w.width / 2)} x2={xx} y2={svgY(w.x + w.width / 2)} stroke="#38bdf8" strokeWidth={penWidth("VENTANAS")} />;
            })}
            {/* Mobiliario simbólico — Neufert/Panero (Ching §symbol conventions) */}
            {(layoutByLevel.fur.get(level) ?? []).length > 0 && (
              <g filter="url(#plan-shadow)">
              {(layoutByLevel.fur.get(level) ?? []).map((p, i) =>
              p.t === "L" ? (
                <line key={`fur-${i}`} x1={p.x1} y1={svgY(p.y1)} x2={p.x2} y2={svgY(p.y2)}
                  stroke={p.l === "SANITARIOS" ? "#7dd3fc" : "#d4b483"} strokeWidth={penWidth(p.l, p.thin)} strokeDasharray={p.dash ? "0.18 0.1" : undefined} />
              ) : p.t === "H" ? (
                <rect key={`fur-${i}`} x={p.x} y={svgY(p.y + p.h)} width={p.w} height={p.h}
                  fill="none" stroke={p.l === "SANITARIOS" ? "#7dd3fc" : "#d4b483"} strokeWidth={penWidth(p.l)} />
              ) : p.t === "T" ? (
                <text key={`fur-${i}`} x={p.x} y={svgY(p.y)} fontSize={p.h} fill="#a8a29e">{p.s}</text>
              ) : null
            )}
            </g>
            )}
            {/* Targets de EDICIÓN: vanos y muros interiores arrastrables.
                Líneas invisibles gruesas: hit fácil sin ensuciar el dibujo. */}
            {plan.doors.filter((d) => d.level === level).map((d, i) => {
              const isY = d.axis === "y";
              const half = d.width / 2;
              return (
                <line key={`hit-d-${i}`}
                  x1={isY ? d.x : d.x - half} y1={svgY(isY ? d.y - half : d.y)}
                  x2={isY ? d.x : d.x + half} y2={svgY(isY ? d.y + half : d.y)}
                  stroke="transparent" strokeWidth={0.45} style={{ cursor: "move" }}
                  onPointerDown={(e) => onEditPointerDown(e, "door", i, isY ? "y" : "x", isY ? d.x : d.y)}
                  onPointerMove={onEditPointerMove} onPointerUp={onEditPointerUp} />
              );
            })}
            {plan.windows.filter((w) => w.level === level).map((w, i) => {
              const r2 = rooms.find((rr) => rr.name.toLowerCase().split(" ").join("") === w.room.toLowerCase().split(" ").join(""));
              if (!r2) return null;
              const horiz = w.wall === "norte" || w.wall === "sur";
              const yy = w.wall === "norte" ? r2.y + r2.depth : r2.y;
              const xx = horiz ? w.x : (w.wall === "este" ? r2.x + r2.width : r2.x);
              return (
                <line key={`hit-w-${i}`}
                  x1={horiz ? w.x - w.width / 2 : xx} y1={svgY(horiz ? yy : w.x - w.width / 2)}
                  x2={horiz ? w.x + w.width / 2 : xx} y2={svgY(horiz ? yy : w.x + w.width / 2)}
                  stroke="transparent" strokeWidth={0.45} style={{ cursor: "move" }}
                  onPointerDown={(e) => onEditPointerDown(e, "window", i, horiz ? "x" : "y", horiz ? yy : xx)}
                  onPointerMove={onEditPointerMove} onPointerUp={onEditPointerUp} />
              );
            })}
            {rooms.flatMap((r) => {
              const te = 0.14;
              const edges: Array<{ axis: "x" | "y"; at: number; x1: number; y1: number; x2: number; y2: number }> = [];
              if (r.y > te + 0.02) edges.push({ axis: "x", at: r.y, x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y });
              if (r.y + r.depth < D - te - 0.02) edges.push({ axis: "x", at: r.y + r.depth, x1: r.x, y1: r.y + r.depth, x2: r.x + r.width, y2: r.y + r.depth });
              if (r.x > te + 0.02) edges.push({ axis: "y", at: r.x, x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.depth });
              if (r.x + r.width < W - te - 0.02) edges.push({ axis: "y", at: r.x + r.width, x1: r.x + r.width, y1: r.y, x2: r.x + r.width, y2: r.y + r.depth });
              return edges.map((ed, k) => (
                <line key={`hit-m-${r.name}-${k}`}
                  x1={ed.x1} y1={svgY(ed.y1)} x2={ed.x2} y2={svgY(ed.y2)}
                  stroke="transparent" strokeWidth={0.3} style={{ cursor: ed.axis === "x" ? "row-resize" : "col-resize" }}
                  onPointerDown={(e) => onEditPointerDown(e, "wall", 0, ed.axis, ed.at)}
                  onPointerMove={onEditPointerMove} onPointerUp={onEditPointerUp} />
              ));
            })}
            {/* Retícula estructural */}
            {plan.structure?.axes.filter((a) => plan.levels === 1 || true).map((a, i) =>
              a.orientation === "vertical" ? (
                <g key={`ax-${i}`}>
                  <line x1={a.at} y1={svgY(-1.2)} x2={a.at} y2={svgY(D + 1.2)} stroke="#f87171" strokeWidth={penWidth("EJES")} strokeDasharray="0.4 0.25" />
                  <text x={a.at - 0.08} y={svgY(D + 1.5)} fontSize={0.26} fill="#f87171">{a.id}</text>
                </g>
              ) : (
                <g key={`ax-${i}`}>
                  <line x1={-1.2} y1={svgY(a.at)} x2={W + 1.2} y2={svgY(a.at)} stroke="#f87171" strokeWidth={penWidth("EJES")} strokeDasharray="0.4 0.25" />
                  <text x={-1.1} y={svgY(a.at) + 0.1} fontSize={0.26} fill="#f87171">{a.id}</text>
                </g>
              ),
            )}
            {/* Eléctrico */}
            {plan.electrical?.points.filter((p) => p.level === level).map((p, i) => (
              <g key={`el-${i}`}>
                <circle cx={p.x} cy={svgY(p.y)} r={0.13} fill="none" stroke="#fbbf24" strokeWidth={penWidth("ELECTRICO", true)} />
                <text x={p.x} y={svgY(p.y) + 0.08} textAnchor="middle" fontSize={0.16} fill="#fbbf24">
                  {p.kind === "tablero" ? "TB" : p.kind === "iluminacion" ? "L" : p.kind === "interruptor" ? "I" : p.kind === "tomacorriente_especial" ? "TE" : "T"}
                </text>
              </g>
            ))}
            {/* Hidrosanitario */}
            {plan.hydro?.points.filter((p) => p.level === level).map((p, i) => (
              <g key={`hy-${i}`}>
                <circle cx={p.x} cy={svgY(p.y)} r={0.14} fill="none" stroke="#60a5fa" strokeWidth={penWidth("HIDROSANITARIO", true)} />
                <text x={p.x} y={svgY(p.y) + 0.08} textAnchor="middle" fontSize={0.14} fill="#93c5fd">
                  {p.kind === "sanitario" ? "SA" : p.kind === "lavamanos" ? "LM" : p.kind === "ducha" ? "DU" : p.kind === "lavaplatos" ? "LP" : p.kind === "lavadero" ? "LD" : p.kind === "calentador" ? "CA" : "PH"}
                </text>
              </g>
            ))}
            {/* Cotas totales */}
            <g stroke="#a78bfa" strokeWidth={penWidth("COTAS")} fill="#c4b5fd">
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

// ── LÁMINAS DE IMPRESIÓN (A-01/A-02/A-03 · A2 apaisado · monocromo) ─────────
// Salida VECTORIAL vía impresión del navegador: Ctrl+P → "Guardar como PDF",
// tamaño A2 landscape. Cada lámina lleva marco, cajetín y escala gráfica —
// el set numerado que se entrega en ventanilla de curaduría.
function PrintSheets({ plan, onClose }: { plan: FloorPlan; onClose: () => void }) {
  const shift = (prims: Prim[], dx: number, dy: number): Prim[] =>
    prims.map((p) => p.t === "L" ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
      : p.t === "T" ? { ...p, x: p.x + dx, y: p.y + dy }
      : p.t === "C" ? { ...p, x: p.x + dx, y: p.y + dy }
      : { ...p, x: p.x + dx, y: p.y + dy });
  const W = plan.outline.width, D = plan.outline.depth;
  const totalH = plan.floorToFloor * Math.max(1, plan.levels);
  const sheets: Array<{ code: string; title: string; prims: Prim[] }> = [
    { code: "A-01", title: "PLANTA ARQUITECTÓNICA + CUADRO DE ÁREAS",
      prims: [...shift(plantaPrimitives(plan), 0, 0), ...shift(areaTablePrimitives(plan), W + 2.5, D - 1)] },
    { code: "A-02", title: "CORTES A-A' Y B-B'",
      prims: [...shift(sectionPrimitives(plan), 0, -(totalH + 2)), ...shift(sectionPrimitives(plan, { transverse: true }), W + 3.5, -(totalH + 2))] },
    { code: "A-03", title: "FACHADAS",
      prims: (["sur", "oeste", "este", "norte"] as const).reduce<Prim[]>((acc, side, i) =>
        [...acc, ...shift(facadePrimitives(plan, side), i * (W + 3), -(totalH + 2))], []) },
  ];
  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-black/70 p-4 print:block print:bg-white print:p-0">
      <style>{`@page { size: A2 landscape; margin: 0 } .sheet { page-break-after: always } @media print { .no-print { display: none !important } }`}</style>
      <div className="no-print mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">📄 Láminas A2 apaisadas — usa <b>Imprimir → Guardar como PDF</b> (tamaño A2)</p>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Cerrar ✕</button>
      </div>
      {sheets.map((s) => {
        const b = primsBounds(s.prims);
        const sy = (y: number) => b.maxY + 0.6 - (y - (b.minY - 0.6));
        const vb = `${b.minX - 0.6} ${b.minY - 0.6} ${b.maxX - b.minX + 1.2} ${b.maxY - b.minY + 1.2}`;
        return (
          <div key={s.code} className="sheet mx-auto mb-4 bg-white" style={{ width: "594mm", height: "420mm", position: "relative" }}>
            <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0 }}>
              {s.prims.map((p, i) =>
                p.t === "L" ? <line key={i} x1={p.x1} y1={sy(p.y1)} x2={p.x2} y2={sy(p.y2)} stroke="#000" strokeWidth={p.thin ? 0.02 : 0.045} strokeDasharray={p.dash ? "0.4 0.25" : undefined} />
                : p.t === "H" ? <rect key={i} x={p.x} y={sy(p.y + p.h)} width={p.w} height={p.h} fill="none" stroke="#000" strokeWidth={0.045} />
                : p.t === "F" ? <rect key={i} x={p.x} y={sy(p.y + p.h)} width={p.w} height={p.h} fill="#000" fillOpacity={0.85} />
                : p.t === "C" ? <circle key={i} cx={p.x} cy={sy(p.y)} r={p.r} fill="none" stroke="#000" strokeWidth={0.03} />
                : <text key={i} x={p.x} y={sy(p.y)} fontSize={p.h} fill="#000" fontFamily="monospace">{p.s}</text>
              )}
              {/* Cajetín por lámina (esquina inferior derecha) */}
              <g>
                <rect x={b.maxX - 6.5} y={b.minY - 0.5} width={6} height={1.8} fill="none" stroke="#000" strokeWidth={0.045} />
                <text x={b.maxX - 6.3} y={b.minY + 0.15} fontSize={0.22} fill="#000" fontFamily="monospace">{plan.name.toUpperCase().slice(0, 30)}</text>
                <text x={b.maxX - 6.3} y={b.minY + 0.55} fontSize={0.18} fill="#000" fontFamily="monospace">ESC 1:75 · METROS · 2026</text>
                <text x={b.maxX - 6.3} y={b.minY + 0.95} fontSize={0.26} fontWeight="bold" fill="#000" fontFamily="monospace">{s.code} — {s.title}</text>
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// -- PASAPORTE DE MATERIALES (broche sostenible del ciclo) --------------------
function PassportPanel({ plan }: { plan: FloorPlan }) {
  const v = useMemo(() => valueTakeoff(takeoff(plan)), [plan]);
  const recs = useMemo(() => recommendations(v), [v]);
  const fmtCOP = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#0a1120] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Material Passport · circularidad BAMB</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">Pasaporte de materiales — {plan.name}</h3>
          <button type="button"
            onClick={() => {
              const blob = new Blob([buildEnvironmentalReport(plan)], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a2 = document.createElement("a");
              a2.href = url; a2.download = `reporte-ambiental-${plan.name.replace(/\s+/g, "-").toLowerCase()}.txt`; a2.click();
              URL.revokeObjectURL(url);
            }}
            className="float-right rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20">
            ⬇️ Reporte ambiental total
          </button>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["💰 Valor de obra", fmtCOP(v.totalCOP), "precios scraped (KB versionada)"],
            ["♱ Huella embebida", (v.co2eTotal / 1000).toFixed(1) + " t CO2e", "factores EPD LATAM"],
            ["🏦 Banco de materiales", fmtCOP(v.reuseCOP), "valor recuperable a fin de vida"],
          ].map(([t, big, sub]) => (
            <div key={t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{t}</p>
              <p className="mt-1 text-lg font-semibold text-white">{big}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07]">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-white/[0.04] text-[9.5px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Material</th><th className="px-2 py-2">Cant.</th><th className="px-2 py-2">Valor</th><th className="px-2 py-2">CO2e</th><th className="px-3 py-2">Recuperable</th></tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i} className="border-t border-white/[0.05] text-slate-300" title={l.detail}>
                  <td className="px-3 py-1.5">{l.material}</td>
                  <td className="px-2 py-1.5 font-mono text-slate-400">{l.qty} {l.unit}</td>
                  <td className="px-2 py-1.5 font-mono">{l.totalCOP ? fmtCOP(l.totalCOP) : "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-slate-400">{l.co2eKg ? l.co2eKg.toLocaleString("es-CO") + " kg" : "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-emerald-300/80">{l.reuseValueCOP + l.recycleValueCOP ? fmtCOP(l.reuseValueCOP + l.recycleValueCOP) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">🧰 Recomendaciones de circularidad (por valor recuperable)</p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-300">
            {recs.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
        <p className="mt-3 text-[9px] text-slate-600">Takeoff determinístico desde el modelo · precios KB versionada · factores EPD genéricos LATAM — para licencia requiere EPD específicos del fabricante.</p>
      </div>
    </div>
  );
}
