"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/app/_components/assistant-message";
import { FOLDER_TEMPLATE, folderIcon } from "@/lib/folders";
import type { KBDocument } from "@/lib/documents";
import {
  ACCEPTED_EXTENSIONS,
  fileIcon,
  formatFileSize,
  isExcelFile,
  previewKind,
  type ProjectFile,
} from "@/lib/files";
import { CostosTool } from "@/app/_components/costos-tool";
import { ColombiaMap } from "@/app/_components/colombia-map";
// Code-split the Gantt tool — its bundle (with the chart renderer) only loads
// when the user opens the Seguimiento card. Keeps login/snappy.
// when the user opens the Seguimiento tool — can never break login.
const GanttTool = dynamic(() => import("@/app/_components/gantt-tool").then((m) => m.GanttTool), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-slate-500">Cargando cronograma…</p>
    </div>  ),
});

// Code-split the IFC viewer — the web-ifc WASM + Three.js bundle is heavy
// (~1.5 MB) and must only load when a user actually opens a .ifc file.
const IfcViewer = dynamic(() => import("@/app/_components/ifc-viewer").then((m) => m.IfcViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-slate-500">Cargando visor BIM…</p>
    </div>
  ),
});

// Code-split the bitácora tool — loaded when the user opens Bitácora Diaria.
const BitacoraTool = dynamic(() => import("@/app/_components/bitacora-tool").then((m) => m.BitacoraTool), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-slate-500">Cargando bitácora…</p>
    </div>
  ),
});

// Code-split the control dashboard — S-curve + earned value.
const ControlTool = dynamic(() => import("@/app/_components/control-tool").then((m) => m.ControlTool), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-slate-500">Cargando control de obra…</p>
    </div>
  ),
});

// Code-split the DXF viewer — three.js + dxf-viewer bundle, loaded on demand.
const DxfPreview = dynamic(() => import("@/app/_components/dxf-preview").then((m) => m.DxfPreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-slate-500">Cargando visor de planos…</p>
    </div>
  ),
});

// Code-split the DWG viewer — libredwg WASM (~9.5MB) + dxf-viewer.
const DwgPreview = dynamic(() => import("@/app/_components/dwg-preview").then((m) => m.DwgPreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-slate-500">Cargando visor DWG…</p>
    </div>
  ),
});

// Code-split the Excel viewer — ExcelJS, loaded on demand.
const ExcelPreview = dynamic(() => import("@/app/_components/excel-preview").then((m) => m.ExcelPreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-slate-500">Cargando hoja de cálculo…</p>
    </div>
  ),
});

const ACTIVE_PROJECT_KEY = "obrahub-active-project";
const ACTIVE_FOLDER_KEY = "obrahub-active-folder";
const ACTIVE_TOOL_KEY = "obrahub-active-tool";
const CHAT_HISTORY_KEY = "obrahub-chat-history";

type ToolId = "storage" | "normativa" | "costos" | "seguimiento" | "bitacora" | "control";

type ToolDef = {
  id: ToolId;
  title: string;
  description: string;
  icon: string;
  available: boolean;
  gradient: string;
};

const TOOLS: ToolDef[] = [
  {
    id: "storage",
    title: "Documentos",
    description: "Planos, contratos y modelos BIM (IFC/Revit/DWG) del proyecto.",
    icon: "📁",
    available: true,
    gradient: "from-blue-500/15 to-blue-600/5",
  },
  {
    id: "costos",
    title: "Costos y Presupuestos",
    description: "Genera presupuestos APU con IA y guárdalos en el proyecto.",
    icon: "💰",
    available: true,
    gradient: "from-amber-500/15 to-amber-600/5",
  },
  {
    id: "seguimiento",
    title: "Seguimiento de Obra",
    description: "Cronograma Gantt con tareas, dependencias y avance.",
    icon: "📊",
    available: true,
    gradient: "from-purple-500/15 to-purple-600/5",
  },
  {
    id: "bitacora",
    title: "Bitácora Diaria",
    description: "Registro diario de obra: clima, personal y avance por tarea.",
    icon: "📔",
    available: true,
    gradient: "from-rose-500/15 to-rose-600/5",
  },
  {
    id: "control",
    title: "Control de Obra",
    description: "Curva S, SPI/CPI, alertas e informe de asamblea semanal.",
    icon: "📈",
    available: true,
    gradient: "from-teal-500/15 to-teal-600/5",
  },
  {
    id: "normativa",
    title: "Consultor Normativo",
    description: "NSR-10, RETIE, RAS y más — respuestas con citas por página.",
    icon: "⚖️",
    available: true,
    gradient: "from-emerald-500/15 to-emerald-600/5",
  },
];

type Project = {
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

type Folder = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

const suggestions = [
  "¿Cuál es el recubrimiento mínimo para columnas?",
  "¿Cuántos pisos permite la NSR para bahareque?",
  "¿Qué requisitos tiene una zapata aislada?",
  "¿Cómo clasifica la NSR las edificaciones?",
  "¿Qué requisitos tiene una columna confinada?",
];

const trustBadges = [
  "Especializado en Colombia",
  "Basado en normativa oficial",
  "Respuestas con referencias",
  "Diseñado para profesionales",
];

const features = [
  {
    title: "Consultar normativa oficial",
    description: "NSR-10, RETIE, RAS, NTC y más — respuestas con citas por página.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m6-12.18A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-12.18v12.18"
      />
    ),
  },
  {
    title: "Búsqueda inteligente en normativa",
    description: "Encuentra artículos relevantes por palabras clave técnicas en segundos.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    ),
  },
  {
    title: "Referencias por página",
    description: "Cada respuesta cita las páginas del documento oficial consultado.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    ),
  },
  {
    title: "Asistente técnico especializado",
    description: "Entrenado para ingeniería, arquitectura y gestión de obra en Colombia.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    ),
  },
  {
    title: "Respuestas en lenguaje profesional",
    description: "Terminología técnica precisa para informes, diseño y supervisión de obra.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    ),
  },
];

function Logo({ className = "", size = "default" }: { className?: string; size?: "default" | "large" }) {
  return (
    <span
      className={`font-semibold tracking-tight text-white ${size === "large" ? "text-xl sm:text-2xl" : "text-base"} ${className}`}
    >
      Obra<span className="text-blue-400">Hub</span>
    </span>
  );
}

function Icon({
  children,
  className = "",
  strokeWidth = 1.5,
}: {
  children: React.ReactNode;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {children}
    </svg>
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

type Memory = {
  id: string;
  content: string;
  source: "manual" | "auto";
  createdAt: string;
};

function MemoryPanel({
  memories,
  open,
  onToggle,
  newMemory,
  setNewMemory,
  onAdd,
  onDelete,
  isSaving,
}: {
  memories: Memory[];
  open: boolean;
  onToggle: () => void;
  newMemory: string;
  setNewMemory: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  isSaving: boolean;
}) {
  return (
    <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Memoria del proyecto
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
            {memories.length}
          </span>
        </span>
        <Icon
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </Icon>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 py-4">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Notas que el asistente recordará al responder consultas de este proyecto.
            Ej: &ldquo;edificio de 8 pisos, f&apos;c=28 MPa, suelo tipo D&rdquo;.
          </p>

          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
              placeholder="Añadir una nota del proyecto…"
              disabled={isSaving}
              className="flex-1 rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
            />
            <button
              type="button"
              onClick={onAdd}
              disabled={!newMemory.trim() || isSaving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "…" : "Añadir"}
            </button>
          </div>

          {memories.length === 0 ? (
            <p className="py-2 text-center text-xs text-slate-600">
              Sin notas aún. El asistente usará estas notas para dar mejores respuestas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li
                  key={m.id}
                  className="group flex items-start gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-sm leading-relaxed text-slate-300">
                    {m.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    aria-label="Eliminar nota"
                    className="-mr-1 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 md:text-slate-600 md:opacity-0 md:transition md:group-hover:opacity-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Derives up-to-two uppercase initials from a full name, e.g. "Diego Pineda" -> "DP". */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppShell({ profile }: { profile: { full_name?: string | null; profession_type?: string | null } }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);

  // Portfolio health cards (Home dashboard).
  const [portfolio, setPortfolio] = useState<Array<{
    slug: string; name: string; progress: number; spi: number | null;
    alerts: number; critical: number; totalBudget: number | null;
    tasksTotal: number; nextMilestone: { name: string; date: string } | null;
    daysSinceBitacora: number | null; city: string | null;
  }>>([]);
  const [continuePoint, setContinuePoint] = useState<{ slug: string; tool: ToolId; label: string } | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  /** Seeds a full demo project (tasks + budget + links + 3 días de bitácora)
   *  using the existing APIs — the 30-second onboarding "wow". */
  async function seedDemoProject() {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const pr = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Demo — Edificio Los Alisos" }) });
      const slug = (await pr.json()).project?.slug;
      if (!slug) throw new Error();
      const taskDefs: Array<[string, string, string, number]> = [
        ["Preliminares y localización", "2026-08-01", "2026-08-08", 100],
        ["Excavación y movimiento de tierras", "2026-08-08", "2026-08-18", 62],
        ["Zapatas y cimentación", "2026-08-15", "2026-09-05", 18],
        ["Estructura en concreto P1", "2026-09-01", "2026-10-15", 0],
        ["Mampostería y acabados", "2026-10-01", "2026-12-10", 0],
      ];
      const tr = await fetch(`/api/projects/${slug}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: taskDefs.map(([name, startDate, endDate, progress]) => ({ name, startDate, endDate, progress: Number(progress) })) }) });
      const tasks = (await tr.json()).tasks ?? [];
      const budget = { titulo: "Demo — Presupuesto Obra Gris", capitulos: [
        { nombre: "1. Preliminares", items: [ { codigo: "1.1", descripcion: "Localización y replanteo", unidad: "m2", cantidad: 420, materiales: [], manoObra: [], equipos: [], costoDirecto: 2100, aiu: { administracion: 13, imprevistos: 3, utilidad: 6 }, precioUnitarioTotal: 2562, subtotal: 1076040 } ] },
        { nombre: "2. Cimentación", items: [
          { codigo: "2.1", descripcion: "Excavación zanjas a máquina", unidad: "m3", cantidad: 380, materiales: [], manoObra: [], equipos: [], costoDirecto: 14500, aiu: { administracion: 13, imprevistos: 3, utilidad: 6 }, precioUnitarioTotal: 17690, subtotal: 6722200 },
          { codigo: "2.2", descripcion: "Concreto 3000 psi zapatas", unidad: "m3", cantidad: 95, materiales: [], manoObra: [], equipos: [], costoDirecto: 410000, aiu: { administracion: 13, imprevistos: 3, utilidad: 6 }, precioUnitarioTotal: 500200, subtotal: 47519000 } ] },
        { nombre: "3. Estructura", items: [ { codigo: "3.1", descripcion: "Columnas y vigas 3000 psi", unidad: "m3", cantidad: 110, materiales: [], manoObra: [], equipos: [], costoDirecto: 430000, aiu: { administracion: 13, imprevistos: 3, utilidad: 6 }, precioUnitarioTotal: 524600, subtotal: 57706000 } ] } ],
        resumen: { costosDirectos: 113017240, aiuTotal: 22, valorAIU: 24863793, subtotalConAIU: 137881033, iva: 19, valorIVA: 26197396, total: 164078429 } };
      const br = await fetch(`/api/projects/${slug}/budgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, source: "manual" }) });
      const budgetId = (await br.json()).id;
      // link items → tasks
      const cr = await fetch(`/api/projects/${slug}/control`);
      const items = (await cr.json()).items ?? [];
      const linkPairs = [[0, 0], [1, 1], [2, 2], [3, 3]];
      for (const [ii, ti] of linkPairs) {
        if (items[ii] && tasks[ti]) {
          await fetch(`/api/projects/${slug}/budgets`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: items[ii].id, taskId: tasks[ti].id }) });
        }
      }
      // 3 días de bitácora
      const days: Array<[string, string, number, number, number[][]]> = [["2026-08-12", "soleado", 0, 12, [[1, 40]]], ["2026-08-13", "nublado", 1, 11, [[1, 52], [2, 5]]], ["2026-08-14", "lluvia", 4, 8, [[1, 62], [2, 18]]]];
      for (const [entryDate, weather, rainHours, workersTotal, prog] of days) {
        await fetch(`/api/projects/${slug}/bitacora`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryDate, weather, rainHours: Number(rainHours), workersTotal: Number(workersTotal), workersDetail: { Oficial: Math.ceil(Number(workersTotal) / 3), Ayudante: Number(workersTotal) - Math.ceil(Number(workersTotal) / 3) }, equipment: { Retroexcavadora: 1 }, observations: "Jornada de obra — proyecto demo", incidents: "", delays: Number(rainHours) > 2 ? "Lluvia fuerte en la tarde" : "", taskProgress: (prog as number[][]).map(([ti, progress]) => ({ taskId: tasks[ti].id, progress: Number(progress) })) }) });
      }
      void budgetId;
      openProject(slug);
      setActiveTool(null);
      await fetch("/api/portfolio").then(() => window.location.reload());
    } catch {
      setError("No se pudo crear el demo — inténtalo de nuevo");
    } finally { setDemoBusy(false); }
  }
  const alertProjects = portfolio.filter((c) => c.alerts > 0).sort((a, b) => b.critical - a.critical);
  const totalCritical = portfolio.reduce((n, c) => n + c.critical, 0);

  useEffect(() => {
    const raw = localStorage.getItem("obrapp-continue");
    if (!raw || !raw.includes("|")) return;
    const [slug, tool] = raw.split("|") as [string, ToolId];
    const label = TOOLS.find((t) => t.id === tool)?.title ?? tool;
    setContinuePoint({ slug, tool, label });
  }, [portfolio.length]); // refresh when projects load

  const [portfolioSummary, setPortfolioSummary] = useState<{
    projects: number; avgSpi: number | null; critical: number; alerts: number; bacTotal: number; stale: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio")
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => {
        if (cancelled) return;
        setPortfolio(d.cards ?? []);
        setPortfolioSummary(d.summary ?? null);
      })
      .catch(() => { /* decorative */ });
    return () => { cancelled = true; };
  }, [activeProjectSlug]); // refresh when returning from a project

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCity, setNewProjectCity] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [selectedTemplateFolders, setSelectedTemplateFolders] = useState<string[]>([
    ...FOLDER_TEMPLATE,
  ]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Array<{ question: string; answer: string; timestamp: string }>>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemory, setShowMemory] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]); // root folders (for sidebar/launcher)
  const [subfolders, setSubfolders] = useState<Folder[]>([]); // children of active folder
  const [folderPath, setFolderPath] = useState<Folder[]>([]); // breadcrumb chain
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderSlug, setActiveFolderSlug] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  // Project members (collaboration)
  const [members, setMembers] = useState<Array<{ userId: string; email: string; role: string }>>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("editor");
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  async function loadMembers(slug: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/members`);
      const data = await res.json();
      setMembers(res.ok ? (data.members ?? []) : []);
    } catch { setMembers([]); }
  }

  async function handleInviteMember() {
    if (!activeProjectSlug || !memberEmail.trim() || memberBusy) return;
    setMemberBusy(true); setMemberError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProjectSlug)}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al invitar");
      setMemberEmail("");
      await loadMembers(activeProjectSlug);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Error al invitar");
    } finally { setMemberBusy(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeProjectSlug) return;
    try {
      await fetch(`/api/projects/${encodeURIComponent(activeProjectSlug)}/members?userId=${userId}`, { method: "DELETE" });
      setMembers((m) => m.filter((x) => x.userId !== userId));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeProjectSlug) void loadMembers(activeProjectSlug);
  }, [activeProjectSlug]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared state for passing prompts from the IFC viewer to Costos/Seguimiento.
  // When the user clicks "Generar Presupuesto" inside the IFC viewer, we close
  // the preview modal, set this prompt, and switch to the costos tool.
  const [pendingBudgetPrompt, setPendingBudgetPrompt] = useState<string | null>(null);
  const [pendingScheduleContext, setPendingScheduleContext] = useState<string | null>(null);

  // IFC 4D highlight: when the Gantt asks to "view linked elements in model",
  // we open the IFC file and pass these GlobalIds to highlight after load.
  const [ifcHighlightIds, setIfcHighlightIds] = useState<string[]>([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectorCountry, setSelectorCountry] = useState<"colombia" | "mexico">("colombia");
  const docsRef = useRef<HTMLDivElement>(null);
  const hasRestoredProject = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the chat textarea as the user types (up to max-h-36).
  function autoGrowTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`; // 144px = max-h-36
  }

  // Reset height when input is cleared (e.g., after sending).
  useEffect(() => {
    if (input === "" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  // Load the global KB documents once on mount.
  useEffect(() => {
    async function loadDocuments() {
      try {
        const res = await fetch("/api/documents");
        const data = await res.json();
        if (res.ok) setDocuments(data.documents ?? []);
      } catch {
        // keep empty state
      }
    }
    void loadDocuments();
  }, []);

  // Close the documents popover when clicking outside it.
  useEffect(() => {
    if (!showDocuments) return;
    function onClick(e: MouseEvent) {
      if (docsRef.current && !docsRef.current.contains(e.target as Node)) {
        setShowDocuments(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showDocuments]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const displayName = profile.full_name?.trim() || "Profesional";
  const initials = initialsFromName(displayName);

  const activeProject = projects.find((project) => project.slug === activeProjectSlug);
  const activeFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;
  const showHero = messages.length === 0 && !activeProjectSlug;
  const selectorDocs = documents.filter((d) => d.country === selectorCountry);

  // Scope label for the normativa UI — reflects what the user actually
  // selected (or the whole library) instead of a hardcoded "NSR-10".
  const activeScopeLabel =
    selectedDocumentIds.length === 0
      ? "biblioteca completa"
      : documents.filter((d) => selectedDocumentIds.includes(d.id)).length > 2
        ? `${selectedDocumentIds.length} normas seleccionadas`
        : documents
            .filter((d) => selectedDocumentIds.includes(d.id))
            .map((d) => d.title.split(" - ")[0].split("(")[0].trim())
            .join(" · ") || "biblioteca completa";

  // Tool Launcher: a project is selected but no tool is active yet.
  const showToolLauncher =
    !!activeProjectSlug && !activeTool && !activeFolderSlug && !isLoadingConversations;

  // Storage tool (folder grid): the old folder dashboard, now nested under the tool.
  const showFolderDashboard =
    !!activeProjectSlug &&
    activeTool === "storage" &&
    !activeFolderId &&
    !isLoadingConversations;

  // The chat composer only shows on chat surfaces (hero, normativa tool).
  const showComposer = showHero || activeTool === "normativa";
  // Legacy project landing view is replaced by the folder dashboard.

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Error al cargar proyectos",
          );
        }
        setProjects(data.projects ?? []);
      } catch (err) {
        setProjectError(
          err instanceof Error ? err.message : "Error al cargar proyectos",
        );
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadProjects();
  }, []);

  useEffect(() => {
    if (isLoadingProjects || hasRestoredProject.current) return;

    // Always start at the home/dashboard page on a fresh app open.
    // Navigation state (project, tool, folder) is tracked via localStorage
    // during a session but NOT restored on next launch — the user sees
    // the project list every time they open ObraHub.
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    localStorage.removeItem(ACTIVE_TOOL_KEY);
    hasRestoredProject.current = true;
  }, [isLoadingProjects, projects]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{ question: string; answer: string; timestamp: string }>;
        setChatHistory(parsed);
        // Auto-open the panel if there's existing history
        if (parsed.length > 0) setShowHistoryPanel(true);
      }
    } catch {
      // non-critical
    }
  }, []);

  async function loadProjectConversations(slug: string) {
    setIsLoadingConversations(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/conversations`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Error al cargar conversaciones",
        );
      }
      setMessages(data.messages ?? []);
    } catch (err) {
      setMessages([]);
      setError(
        err instanceof Error ? err.message : "Error al cargar conversaciones",
      );
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function persistMessage(
    slug: string,
    role: "user" | "assistant",
    content: string,
  ) {
    const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Error al guardar el mensaje",
      );
    }
    return data.message as Message;
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name || isCreatingProject) return;

    setIsCreatingProject(true);
    setProjectError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: newProjectCity.trim() || undefined,
          name,
          templateFolders: selectedTemplateFolders,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Error al crear el proyecto",
        );
      }

      const project = data.project as Project;
      setProjects((prev) => [project, ...prev]);
      setNewProjectName("");
      setNewProjectCity("");
      setSelectedTemplateFolders([...FOLDER_TEMPLATE]);
      setShowCreateProject(false);
      openProject(project.slug);
    } catch (err) {
      setProjectError(
        err instanceof Error ? err.message : "Error al crear el proyecto",
      );
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleDeleteProject() {
    const project = projectToDelete;
    if (!project || isDeletingProject) return;

    setIsDeletingProject(true);
    try {
      const res = await fetch(`/api/projects?slug=${encodeURIComponent(project.slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(typeof data.error === "string" ? data.error : "Error al eliminar");
      }
      setProjects((prev) => prev.filter((p) => p.slug !== project.slug));
      // If the deleted project was active, go back to the hero view.
      if (activeProjectSlug === project.slug) {
        startNewChat();
      }
      setProjectToDelete(null);
      setDeleteConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar el proyecto");
    } finally {
      setIsDeletingProject(false);
    }
  }

  function openProject(slug: string) {
    setActiveProjectSlug(slug);
    localStorage.setItem(ACTIVE_PROJECT_KEY, slug);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    localStorage.removeItem(ACTIVE_TOOL_KEY);
    setActiveFolderSlug(null);
    setActiveTool(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    setMemories([]);
    setShowMemory(false);
    // Folders are auto-loaded by the useEffect that watches activeProjectSlug.
  }

  // Open a tool within the active project.
  function openTool(tool: ToolId) {
    setActiveTool(tool);
    localStorage.setItem(ACTIVE_TOOL_KEY, tool);
    if (activeProjectSlug) localStorage.setItem("obrapp-continue", `${activeProjectSlug}|${tool}`);
    setActiveFolderSlug(null);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    setMessages([]);
    setError(null);
    setMemories([]);
    setShowMemory(false);
    setSidebarOpen(false);

    // Normativa tool: load project-level memory (no folder).
    if (tool === "normativa" && activeProjectSlug) {
      void loadProjectMemories(activeProjectSlug);
    }
  }

  // Return from a tool view to the launcher.
  function backToLauncher() {
    setActiveTool(null);
    localStorage.removeItem(ACTIVE_TOOL_KEY);
    setActiveFolderSlug(null);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    setMessages([]);
    setMemories([]);
    setShowMemory(false);
    setError(null);
  }

  async function loadProjectFolders(slug: string) {
    setIsLoadingFolders(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/folders`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setFolders(data.folders ?? []);
    } catch {
      setFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }

  // Auto-reload root folders whenever the active project changes.
  // This ensures folders are always visible even after navigation or
  // state resets — the previous bug where folders "disappeared" was
  // because no effect observed activeProjectSlug.
  useEffect(() => {
    if (!activeProjectSlug) {
      setFolders([]);
      return;
    }
    void loadProjectFolders(activeProjectSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectSlug]);

  // Create a folder — inside the active folder (if any), or at project root.
  async function handleCreateFolder(name: string) {
    const slug = activeProjectSlug;
    if (!slug || isCreatingFolder) return;

    const parentId = activeFolderId; // null = root, id = nested

    setIsCreatingFolder(true);
    setFolderError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      // Add to whichever list is currently displayed.
      if (activeFolderId) {
        setSubfolders((prev) => [data.folder, ...prev]);
      } else {
        setFolders((prev) => [data.folder, ...prev]);
      }
      setNewFolderName("");
      setShowCreateFolder(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Error al crear la carpeta");
    } finally {
      setIsCreatingFolder(false);
    }
  }

  // Delete a folder by ID — works at any nesting level.
  async function handleDeleteFolderById(folderId: string) {
    const slug = activeProjectSlug;
    if (!slug) return;
    // Optimistically remove from whichever list it's in.
    setSubfolders((prev) => prev.filter((f) => f.id !== folderId));
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    try {
      await fetch(`/api/projects/${encodeURIComponent(slug)}/folders?id=${folderId}`, {
        method: "DELETE",
      });
    } catch {
      if (activeFolderId) void loadSubfolders(activeFolderId);
      else if (slug) void loadProjectFolders(slug);
    }
  }

  // Open a folder by ID — loads its subfolders + files + breadcrumb path.
  function openFolderById(folderId: string) {
    setActiveFolderId(folderId);
    localStorage.setItem(ACTIVE_FOLDER_KEY, folderId);
    setActiveFolderSlug(null); // slug no longer used for storage nav
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    setMemories([]);
    setShowMemory(false);
    setFiles([]);
    setSubfolders([]);
    setUploadError(null);
    void loadFolderContents(folderId);
  }

  // Load subfolders + files + path for a folder.
  async function loadFolderContents(folderId: string) {
    if (!activeProjectSlug) return;
    const slug = activeProjectSlug;
    setIsLoadingFolders(true);
    try {
      const [subsRes, filesRes, pathRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(slug)}/folders?parentId=${folderId}`),
        fetch(`/api/folders/${folderId}/files`),
        fetch(`/api/projects/${encodeURIComponent(slug)}/folders/${folderId}/path`),
      ]);
      const subsData = await subsRes.json();
      const filesData = await filesRes.json();
      const pathData = await pathRes.json();
      setSubfolders(subsRes.ok ? (subsData.folders ?? []) : []);
      setFiles(filesRes.ok ? (filesData.files ?? []) : []);
      setFolderPath(pathRes.ok ? (pathData.path ?? []) : []);
    } catch {
      setSubfolders([]);
      setFiles([]);
      setFolderPath([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }

  async function loadSubfolders(folderId: string) {
    if (!activeProjectSlug) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProjectSlug)}/folders?parentId=${folderId}`);
      const data = await res.json();
      setSubfolders(res.ok ? (data.folders ?? []) : []);
    } catch {
      setSubfolders([]);
    }
  }

  // Upload files to the active folder (by folderId).
  // ZIP project import: recreates the client's existing folder tree.
  const zipInputRef = useRef<HTMLInputElement>(null);

  async function handleImportZip(zipFile: File) {
    if (!activeProjectSlug || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const JSZip = (await import("jszip")).default;
      setUploadProgress("Leyendo ZIP…");
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && !e.name.split("/").some((seg) => seg.startsWith("__MACOSX") || seg.startsWith(".")),
      );
      if (entries.length === 0) throw new Error("El ZIP no contiene archivos");

      const supabase = createClient();
      const pathCache = new Map<string, string>();
      const ensureFolder = async (dirPath: string): Promise<string> => {
        const key = dirPath || "/";
        const cached = pathCache.get(key);
        if (cached) return cached;
        const res = await fetch(`/api/projects/${encodeURIComponent(activeProjectSlug)}/folders/ensure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: dirPath }),
        });
        const data = await res.json();
        if (!res.ok || !data.folderId) {
          throw new Error(typeof data.error === "string" ? data.error : "Error al crear carpetas");
        }
        pathCache.set(key, data.folderId);
        return data.folderId as string;
      };

      let done = 0;
      const failures: string[] = [];
      for (const entry of entries) {
        done++;
        const idx = entry.name.lastIndexOf("/");
        const dir = idx > 0 ? entry.name.slice(0, idx) : "";
        const name = idx > 0 ? entry.name.slice(idx + 1) : entry.name;
        try {
          setUploadProgress(`Importando ${done}/${entries.length}: ${name}`);
          const folderId = await ensureFolder(dir);
          const blob = await entry.async("blob");
          const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
          if (file.size <= 4 * 1024 * 1024) {
            const form = new FormData();
            form.append("files", file);
            const res = await fetch(`/api/folders/${folderId}/files`, { method: "POST", body: form });
            if (!res.ok) throw new Error("subida falló");
          } else {
            const ticketRes = await fetch(`/api/folders/${folderId}/files/prepare?name=${encodeURIComponent(name)}`);
            const ticket = await ticketRes.json();
            if (!ticketRes.ok || !ticket.storagePath) throw new Error("prepare falló");
            const { uploadFileResumable } = await import("@/lib/storage-upload");
            await uploadFileResumable(supabase, { file, storagePath: ticket.storagePath });
            await fetch(`/api/folders/${folderId}/files/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, storagePath: ticket.storagePath, mimeType: file.type || null, sizeBytes: file.size }),
            });
          }
        } catch {
          failures.push(name);
        }
      }
      if (activeFolderId) await loadFolderContents(activeFolderId);
      else await loadProjectFolders(activeProjectSlug);
      if (failures.length > 0) {
        setUploadError(`Importados ${entries.length - failures.length}/${entries.length}. Fallaron: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al importar el ZIP");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }

  async function handleUploadFiles(selectedFiles: FileList | File[]) {
    const fid = activeFolderId;
    if (!fid || isUploading) return;

    const list = Array.from(selectedFiles);
    if (list.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(null);

    try {
      // Vercel serverless bodies are capped at ~4.5MB, so anything bigger
      // must go straight from the browser to Supabase via TUS resumable
      // upload (chunked, retryable, multi-GB capable). Small files keep
      // using the regular multipart route.
      const TUS_THRESHOLD = 4 * 1024 * 1024; // 4 MB
      const bigFiles = list.filter((f) => f.size > TUS_THRESHOLD);
      const smallFiles = list.filter((f) => f.size <= TUS_THRESHOLD);

      if (smallFiles.length > 0) {
        const form = new FormData();
        for (const f of smallFiles) form.append("files", f);
        const res = await fetch(`/api/folders/${fid}/files`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Error al subir");
        }
      }

      if (bigFiles.length > 0) {
        const supabase = createClient();
        for (const file of bigFiles) {
          // Phase 1 — get the storage path ticket from our API.
          setUploadProgress(`Preparando "${file.name}"…`);
          let storagePath = "";
          try {
            const ticketRes = await fetch(
              `/api/folders/${fid}/files/prepare?name=${encodeURIComponent(file.name)}`,
            );
            const ticket = await ticketRes.json();
            if (!ticketRes.ok || !ticket.storagePath) {
              throw new Error(typeof ticket.error === "string" ? ticket.error : "Error al preparar la subida");
            }
            storagePath = ticket.storagePath;
          } catch (err) {
            throw new Error(
              `"${file.name}": no se pudo preparar la subida (${err instanceof Error ? err.message : "error"})`,
            );
          }

          // Phase 2 — TUS resumable upload, browser → Supabase directly.
          const { uploadFileResumable } = await import("@/lib/storage-upload");
          try {
            await uploadFileResumable(supabase, {
              file,
              storagePath,
              onProgress: (p) => {
                setUploadProgress(`Subiendo "${file.name}"… ${Math.round(p * 100)}%`);
              },
            });
          } catch (err) {
            throw new Error(
              `"${file.name}": ${err instanceof Error ? err.message : "falló la subida del archivo"}`,
            );
          }

          // Phase 3 — index the uploaded object in the files table.
          try {
            const regRes = await fetch(`/api/folders/${fid}/files/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: file.name,
                storagePath,
                mimeType: file.type || null,
                sizeBytes: file.size,
              }),
            });
            const reg = await regRes.json();
            if (!regRes.ok) {
              throw new Error(typeof reg.error === "string" ? reg.error : "error desconocido");
            }
          } catch (err) {
            throw new Error(
              `"${file.name}" se subió pero no se pudo registrar (${err instanceof Error ? err.message : "error"})`,
            );
          }
        }
      }

      await loadFolderContents(fid);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir archivos");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteFile(fileId: string) {
    const fid = activeFolderId;
    if (!fid) return;
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    try {
      await fetch(`/api/folders/${fid}/files?id=${fileId}`, { method: "DELETE" });
    } catch {
      void loadFolderContents(fid);
    }
  }

  function handleDownloadFile(fileId: string) {
    const fid = activeFolderId;
    if (!fid) return;
    window.open(`/api/folders/${fid}/files/download?id=${fileId}`, "_blank");
  }

  // Open the preview modal for a file.
  async function handlePreviewFile(file: ProjectFile) {
    const fid = activeFolderId;
    if (!fid) return;
    const kind = previewKind(file.name, file.mimeType);
    if (kind === "none") {
      handleDownloadFile(file.id);
      return;
    }
    setPreviewFile(file);
    setPreviewUrl(null);
    setIsLoadingPreview(true);
    try {
      const res = await fetch(`/api/folders/${fid}/files/preview?id=${file.id}`);
      const data = await res.json();
      if (res.ok) setPreviewUrl(data.url);
    } catch {
      // ignore
    } finally {
      setIsLoadingPreview(false);
    }
  }

  // Open an IFC file from the Gantt (4D link navigation) with specific elements highlighted.
  // Loads the file metadata, sets the highlight IDs, then opens the preview modal.
  async function openIfcWithHighlights(fileId: string, globalIds: string[]) {
    if (!activeFolderId) return;
    setIfcHighlightIds(globalIds);
    // Find the file in the current folder's file list, or fetch it directly.
    let file = files.find((f) => f.id === fileId);
    if (!file) {
      // Fetch file metadata via the preview endpoint (it returns name + mime).
      try {
        const res = await fetch(`/api/folders/${activeFolderId}/files/preview?id=${fileId}`);
        if (res.ok) {
          const data = await res.json();
          file = {
            id: fileId,
            folderId: activeFolderId,
            name: data.name ?? "modelo.ifc",
            storagePath: "",
            mimeType: data.mimeType ?? null,
            sizeBytes: 0,
            createdAt: new Date().toISOString(),
          };
        }
      } catch {
        /* ignore */
      }
    }
    if (file) {
      await handlePreviewFile(file);
    }
  }

  function backToDashboard() {
    setActiveFolderId(null);
    setActiveFolderSlug(null);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    setMessages([]);
    setMemories([]);
    setShowMemory(false);
    setFiles([]);
    setSubfolders([]);
    setFolderPath([]);
    setUploadError(null);
    setPreviewFile(null);
    if (activeProjectSlug) void loadProjectFolders(activeProjectSlug);
  }

  async function loadFolderConversations(projectSlug: string, folderSlug: string) {
    setIsLoadingConversations(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderSlug)}/conversations`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setMessages(data.messages ?? []);
    } catch (err) {
      setMessages([]);
      setError(err instanceof Error ? err.message : "Error al cargar conversaciones");
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadFolderMemories(projectSlug: string, folderSlug: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderSlug)}/memories`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setMemories(data.memories ?? []);
    } catch {
      setMemories([]);
    }
  }

  async function persistFolderMessage(
    projectSlug: string,
    folderSlug: string,
    role: "user" | "assistant",
    content: string,
  ) {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderSlug)}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
    return data.message as Message;
  }

  async function handleAddFolderMemory() {
    const content = newMemory.trim();
    const pSlug = activeProjectSlug;
    const fSlug = activeFolderSlug;
    if (!content || !pSlug || !fSlug || isSavingMemory) return;

    setIsSavingMemory(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pSlug)}/folders/${encodeURIComponent(fSlug)}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setMemories((prev) => [data.memory, ...prev]);
      setNewMemory("");
    } catch {
      // keep UI responsive
    } finally {
      setIsSavingMemory(false);
    }
  }

  async function handleDeleteFolderMemory(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    // Folder memories deletion is via the project-level memories DELETE route,
    // which is keyed on memory id and RLS-scoped through folders → projects.
    // Reuse the generic endpoint by id.
    const pSlug = activeProjectSlug;
    if (!pSlug) return;
    try {
      await fetch(`/api/projects/${encodeURIComponent(pSlug)}/memories?id=${id}`, { method: "DELETE" });
    } catch {
      if (activeFolderSlug) void loadFolderMemories(pSlug, activeFolderSlug);
    }
  }

  async function loadProjectMemories(slug: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/memories`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setMemories(data.memories ?? []);
    } catch {
      setMemories([]);
    }
  }

  async function handleAddMemory() {
    const content = newMemory.trim();
    const slug = activeProjectSlug;
    if (!content || !slug || isSavingMemory) return;

    setIsSavingMemory(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      setMemories((prev) => [data.memory, ...prev]);
      setNewMemory("");
    } catch {
      // ignore — keeps UI responsive
    } finally {
      setIsSavingMemory(false);
    }
  }

  async function handleDeleteMemory(id: string) {
    const slug = activeProjectSlug;
    if (!slug) return;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/projects/${encodeURIComponent(slug)}/memories?id=${id}`, {
        method: "DELETE",
      });
    } catch {
      void loadProjectMemories(slug);
    }
  }

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || isLoading) return;

    const projectSlug = activeProjectSlug;
    const folderSlug = activeFolderSlug;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    // Persistence helper that respects whether a folder is active.
    const persist = async (role: "user" | "assistant", content: string) => {
      if (!projectSlug) return null;
      if (folderSlug) {
        return persistFolderMessage(projectSlug, folderSlug, role, content);
      }
      return persistMessage(projectSlug, role, content);
    };

    try {
      if (projectSlug) {
        const savedUserMessage = await persist("user", message);
        if (savedUserMessage) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex]?.role === "user") {
              updated[lastIndex] = savedUserMessage;
            }
            return updated;
          });
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          projectSlug: projectSlug ?? undefined,
          folderSlug: folderSlug ?? undefined,
          documentIds:
            (activeTool === "normativa" || !activeProjectSlug) && selectedDocumentIds.length > 0
              ? selectedDocumentIds
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al enviar el mensaje");
      }

      const assistantContent = data.response;

      if (projectSlug) {
        try {
          const savedAssistantMessage = await persist("assistant", assistantContent);
          setMessages((prev) => [
            ...prev,
            savedAssistantMessage ?? { role: "assistant", content: assistantContent },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantContent },
          ]);
          throw new Error("La respuesta no se pudo guardar en el proyecto");
        }
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
      }

      // Save to chat history (last 5 consultations)
      try {
        const stored = localStorage.getItem(CHAT_HISTORY_KEY);
        const prev = stored ? JSON.parse(stored) as Array<{ question: string; answer: string; timestamp: string }> : [];
        const entry = { question: message, answer: assistantContent, timestamp: new Date().toISOString() };
        const next = [entry, ...prev].slice(0, 5);
        setChatHistory(next);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // localStorage might be full or unavailable — non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar el mensaje");
      if (projectSlug) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user" && last.content === message && !last.timestamp) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  function startNewChat() {
    setActiveProjectSlug(null);
    setActiveFolderSlug(null);
    setActiveTool(null);
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    localStorage.removeItem(ACTIVE_FOLDER_KEY);
    localStorage.removeItem(ACTIVE_TOOL_KEY);
    setFolders([]);
    setMessages([]);
    setMemories([]);
    setShowMemory(false);
    setError(null);
    setInput("");
    setSidebarOpen(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-[#050b14] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(37,99,235,0.18),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[40%] w-[80%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(29,78,216,0.08),transparent_70%)]"
      />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 top-0 z-50 flex flex-col border-r border-white/[0.06] bg-[#080f1c]/95 pt-[env(safe-area-inset-top)] shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 md:static md:w-[72px] md:translate-x-0 lg:w-[280px] ${
          sidebarCollapsed ? "lg:w-[72px]" : "lg:w-[280px]"
        } ${sidebarOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full md:translate-x-0"}`}
      >
        <div
          className={`border-b border-white/[0.06] py-5 ${
            sidebarCollapsed ? "flex justify-center px-2" : "px-5 md:flex md:justify-center md:px-2 lg:px-5 lg:block"
          }`}
        >
          {(sidebarCollapsed) ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-lg shadow-blue-900/50">
              OH
            </div>
          ) : (
            <>
            <div className="hidden lg:block">
              <div className="pr-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400/80">
                  ObraHub
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-slate-300">
                  Asistente Técnico para Construcción
                </p>
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-lg shadow-blue-900/50 lg:hidden">
              OH
            </div>
            </>
          )}
          <button
            type="button"
            aria-label="Cerrar sidebar"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+1.25rem)] rounded-lg p-2.5 text-slate-400 transition hover:bg-white/5 hover:text-white md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </Icon>
          </button>
        </div>

        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto p-3 ${sidebarCollapsed ? "px-2" : ""}`}>
          <button
            type="button"
            title="Nueva consulta"
            onClick={startNewChat}
            className={`flex w-full items-center gap-2.5 rounded-xl border border-blue-500/20 bg-blue-600/10 text-sm font-medium text-white shadow-sm shadow-blue-900/20 transition hover:border-blue-400/30 hover:bg-blue-600/20 md:justify-center md:px-2 lg:justify-start ${
              sidebarCollapsed ? "justify-center px-2 py-2.5" : "justify-start px-3.5 py-2.5 lg:px-3.5"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-blue-400" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </Icon>
            {!sidebarCollapsed && <span className="md:hidden lg:inline">Nueva consulta</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="mt-6 space-y-6 md:hidden lg:block">
              <section>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Proyectos
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateProject(true);
                      setProjectError(null);
                    }}
                    className="-mr-1 rounded-md px-1.5 py-1 text-xs font-medium text-blue-400 transition hover:bg-blue-500/10 hover:text-blue-300"
                  >
                    + Nuevo Proyecto
                  </button>
                </div>
                {isLoadingProjects ? (
                  <p className="px-2 text-xs text-slate-600">Cargando proyectos…</p>
                ) : projects.length === 0 ? (
                  <p className="px-2 text-xs text-slate-600">Sin proyectos aún</p>
                ) : (
                  <ul className="space-y-0.5">
                    {projects.map((project) => (
                      <li key={project.slug} className="group relative">
                        <button
                          type="button"
                          onClick={() => openProject(project.slug)}
                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                            activeProjectSlug === project.slug
                              ? "bg-blue-500/10 text-white ring-1 ring-blue-500/25"
                              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                          }`}
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-blue-400">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z"
                            />
                          </Icon>
                          <span className="min-w-0 flex-1 pr-6">
                            <span className="block truncate">{project.name}</span>
                            <span className="mt-0.5 block text-xs text-slate-600">
                              {new Date(project.updatedAt).toLocaleDateString("es-CO", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(project);
                            setDeleteConfirmText("");
                          }}
                          aria-label="Eliminar proyecto"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 opacity-100 transition hover:bg-red-500/10 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(showHero || activeTool === "normativa") && (
              <div>
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Conocimiento
                </p>
                <Link
                  href="/documents"
                  className="group flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition hover:border-blue-500/25 hover:bg-blue-500/[0.04]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <Icon className="h-4 w-4 text-blue-400">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m6-12.18A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-12.18v12.18"
                      />
                    </Icon>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">Biblioteca</p>
                    <p className="text-xs text-slate-500">Normativas y documentos</p>
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-blue-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </Icon>
                </Link>
              </div>
              )}
            </div>
          )}
        </div>

        {sidebarCollapsed && <div className="flex-1" />}

        <div className={`mt-auto border-t border-white/[0.06] p-3 ${sidebarCollapsed ? "px-2" : ""}`}>
          <div className="space-y-1">
            <Link
              href="/profile"
              className={`flex items-center rounded-xl transition hover:bg-white/[0.03] ${
                sidebarCollapsed ? "justify-center p-2" : "gap-3 px-2 py-2 md:justify-center md:p-2 lg:gap-3 lg:px-2 lg:py-2"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-semibold text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/20">
                {initials}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1 md:hidden lg:block">
                  <p className="truncate text-sm font-medium text-slate-200">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {profile.profession_type || "Plan gratuito"}
                  </p>
                </div>
              )}
            </Link>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm text-slate-500 transition hover:bg-white/[0.03] hover:text-red-400 md:hidden lg:flex"
              >
                <Icon className="h-4 w-4 shrink-0">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                  />
                </Icon>
                Cerrar sesión
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          className="hidden border-t border-white/[0.06] p-2.5 text-slate-500 transition hover:bg-white/[0.03] hover:text-slate-300 lg:block"
          onClick={() => setSidebarCollapsed((v) => !v)}
        >
          <Icon
            className={`mx-auto h-4 w-4 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </Icon>
        </button>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#050b14]/80 px-4 py-3.5 pt-[calc(env(safe-area-inset-top)+0.875rem)] backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={sidebarOpen}
              className="shrink-0 rounded-lg p-2.5 text-slate-400 transition hover:bg-white/5 hover:text-white md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </Icon>
            </button>
            <div className="min-w-0">
              <Logo size="large" />
              {activeProject && (
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-500 sm:text-sm">
                  {activeFolderId ? (
                    // Inside a storage folder: Project › Tool › Folder
                    <button
                      type="button"
                      onClick={backToDashboard}
                      className="inline-flex min-w-0 items-center gap-1 truncate transition hover:text-slate-300"
                    >
                      <span className="truncate">{activeProject.name}</span>
                      <svg className="h-3 w-3 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="hidden truncate text-slate-500 sm:inline">{TOOLS.find((t) => t.id === activeTool)?.title}</span>
                      <svg className="hidden h-3 w-3 shrink-0 text-slate-600 sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="truncate text-slate-300">{activeFolder?.name}</span>
                    </button>
                  ) : activeTool ? (
                    // Inside a tool (no folder): Project › Tool (click project → launcher)
                    <button
                      type="button"
                      onClick={backToLauncher}
                      className="inline-flex min-w-0 items-center gap-1 truncate transition hover:text-slate-300"
                    >
                      <span className="truncate">{activeProject.name}</span>
                      <svg className="h-3 w-3 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="truncate text-slate-300">
                        {TOOLS.find((t) => t.id === activeTool)?.title}
                      </span>
                    </button>
                  ) : (
                    // At the launcher
                    <>
                      <span className="text-slate-500">Proyecto:</span>
                      <span className="truncate text-slate-300">{activeProject.name}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeProjectSlug && (
              <button
                type="button"
                onClick={() => setShowMemory((v) => !v)}
                title="Memoria del proyecto"
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 transition hover:bg-blue-500/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                {memories.length}
              </button>
            )}
            {(showHero || activeTool === "normativa") && (
            <div ref={docsRef} className="relative">
              <button
                type="button"
                onClick={() => setShowDocuments((v) => !v)}
                title="Documentos a buscar"
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 transition hover:bg-blue-500/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m6-12.18A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-12.18v12.18" />
                </svg>
                {documents.length === 0
                  ? "Biblioteca"
                  : selectedDocumentIds.length === 0
                    ? "Todas"
                    : `${selectedDocumentIds.length}/${documents.length}`}
              </button>
              {showDocuments && (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/[0.08] bg-[#0a1120] p-2 shadow-2xl shadow-black/50">
                  <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Documentos a buscar
                  </p>

                  {/* Country tabs */}
                  <div className="mb-1 flex gap-1 px-1">
                    {(["colombia", "mexico"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectorCountry(c)}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                          selectorCountry === c
                            ? "bg-blue-500/15 text-white"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {c === "colombia" ? "🇨🇴 Colombia" : "🇲🇽 México"}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDocumentIds([])}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition hover:bg-white/[0.04] ${
                      selectedDocumentIds.length === 0 ? "text-white" : "text-slate-400"
                    }`}
                  >
                    <span>Todas las normativas</span>
                    {selectedDocumentIds.length === 0 && (
                      <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <div className="my-1 border-t border-white/[0.06]" />
                  <div className="max-h-64 overflow-y-auto">
                    {selectorDocs.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-slate-600">
                        {selectorCountry === "mexico"
                          ? "México aún no tiene documentos"
                          : "Sin documentos"}
                      </p>
                    ) : (
                      selectorDocs.map((doc) => {
                        const checked = selectedDocumentIds.includes(doc.id);
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => {
                              setSelectedDocumentIds((prev) =>
                                prev.includes(doc.id)
                                  ? prev.filter((id) => id !== doc.id)
                                  : [...prev, doc.id],
                              );
                            }}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-white/[0.04] ${
                              checked ? "text-white" : "text-slate-400"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? "border-blue-500 bg-blue-600 text-white"
                                  : "border-white/[0.15] bg-transparent"
                              }`}
                            >
                              {checked && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{doc.title}</span>
                              <span className="block text-[11px] text-slate-600">{doc.pageCount} pág.</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            )}
            {/* History toggle — only in normativa/hero mode */}
            {(showHero || activeTool === "normativa") && (
              <button
                type="button"
                onClick={() => setShowHistoryPanel((s) => !s)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showHistoryPanel
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                    : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
                title="Historial de consultas"
              >
                🕘 <span>Historial</span>
                {chatHistory.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
                    {chatHistory.length}
                  </span>
                )}
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((o) => !o)}
                className="relative rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-1.5 text-sm transition hover:bg-white/[0.07]"
                title="Alertas de tus proyectos"
              >
                🔔
                {alertProjects.length > 0 && (
                  <span className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${totalCritical > 0 ? "bg-red-500" : "bg-amber-500"}`}>
                    {alertProjects.length}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-white/[0.1] bg-[#0a1120]/98 p-3 shadow-2xl backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Alertas de proyectos</p>
                    <button type="button" onClick={() => setBellOpen(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  {alertProjects.length === 0 ? (
                    <p className="py-3 text-center text-[11px] text-slate-500">Sin alertas — todo bajo control ✅</p>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {alertProjects.slice(0, 8).map((c) => (
                        <button
                          key={c.slug}
                          type="button"
                          onClick={() => { openProject(c.slug); openTool("control"); setBellOpen(false); }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-left transition hover:border-blue-500/30 hover:bg-blue-500/[0.06]"
                        >
                          <span className="min-w-0 truncate text-xs text-slate-200">{c.name}</span>
                          <span className="flex shrink-0 gap-1">
                            {c.critical > 0 && <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-300">🔴 {c.critical}</span>}
                            {c.alerts - c.critical > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">🟡 {c.alerts - c.critical}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 sm:inline-flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              En línea
            </span>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div
              className={`mx-auto flex w-full flex-col px-4 sm:px-6 ${
                showHero
                  ? "max-w-5xl py-8 sm:py-10"
                  : activeTool === "seguimiento"
                  ? "max-w-[1600px] min-h-full py-4 sm:py-6"
                  : "max-w-3xl min-h-full py-6 sm:py-8"
              }`}
            >
              {showHero ? (
                <div className="w-full">
                  <section className="text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-xs font-medium text-blue-300">
                      <Icon className="h-3.5 w-3.5">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z"
                        />
                      </Icon>
                      El asistente técnico para profesionales de la construcción en Colombia
                    </div>

                    {portfolio.length > 0 && (
            <div className="mb-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
                Tus proyectos — salud de un vistazo
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {continuePoint && (
                  <button
                    type="button"
                    onClick={() => { openProject(continuePoint.slug); openTool(continuePoint.tool); }}
                    className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20"
                  >
                    ↩ Continuar: {continuePoint.label}
                  </button>
                )}
                {portfolio.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = continuePoint?.slug ?? portfolio[0]?.slug;
                      if (target) { openProject(target); openTool("bitacora"); }
                    }}
                    className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-950/40 transition hover:bg-rose-500"
                  >
                    📔 Registrar bitácora de hoy
                  </button>
                )}
              </div>
              {portfolio.length === 0 && !isLoadingProjects && (
                <div className="mt-4 rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5 text-left">
                  <p className="text-sm font-semibold text-white">🌱 Crea tu proyecto demo en 1 clic</p>
                  <p className="mt-1 text-xs text-slate-400">Un edificio completo con cronograma, presupuesto ($164M), bitácora de 3 días, Curva S y alertas — para explorar ObraHub antes de subir tu obra real.</p>
                  <button
                    type="button"
                    onClick={() => void seedDemoProject()}
                    disabled={demoBusy}
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {demoBusy ? "Creando demo… (10s)" : "🌱 Crear proyecto demo"}
                  </button>
                </div>
              )}
              {portfolioSummary && portfolioSummary.projects > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    ["Proyectos activos", String(portfolioSummary.projects), "text-white"],
                    ["SPI promedio", portfolioSummary.avgSpi != null ? portfolioSummary.avgSpi.toFixed(2) : "—", portfolioSummary.avgSpi == null ? "text-slate-300" : portfolioSummary.avgSpi >= 1 ? "text-emerald-300" : portfolioSummary.avgSpi >= 0.9 ? "text-amber-300" : "text-red-300"],
                    ["Alertas", `${portfolioSummary.alerts}`, portfolioSummary.critical > 0 ? "text-red-300" : "text-slate-300"],
                    ["Cartera (BAC)", portfolioSummary.bacTotal > 0 ? `$${(portfolioSummary.bacTotal / 1e6).toFixed(1)}M` : "—", "text-amber-300"],
                    ["Bitácora ≥3d", `${portfolioSummary.stale}`, portfolioSummary.stale > 0 ? "text-amber-300" : "text-slate-300"],
                  ].map(([label, value, cls]) => (
                    <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <p className="truncate text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
                      <p className={`mt-0.5 text-lg font-bold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {portfolio.map((c) => {
                  const R = 26, C = 2 * Math.PI * R;
                  const off = C * (1 - Math.min(100, Math.max(0, c.progress)) / 100);
                  const spiCls = c.spi == null ? "text-slate-400" : c.spi >= 1 ? "text-emerald-300" : c.spi >= 0.9 ? "text-amber-300" : "text-red-300";
                  const ring = c.progress >= 70 ? "#34d399" : c.progress >= 30 ? "#38bdf8" : "#64748b";
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => openProject(c.slug)}
                      className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-blue-500/30 hover:bg-blue-500/[0.04]"
                    >
                      <div className="flex items-center gap-3">
                        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90">
                          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                          <circle cx="32" cy="32" r={R} fill="none" stroke={ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white group-hover:text-blue-200">{c.name}</p>
                          <p className={`mt-0.5 text-lg font-bold ${spiCls}`}>{c.progress}%{c.spi != null && <span className="ml-2 text-xs">SPI {c.spi}</span>}</p>
                          <p className="text-[10px] text-slate-500">{c.tasksTotal} tareas{c.daysSinceBitacora != null ? ` · bitácora hace ${c.daysSinceBitacora}d` : " · sin bitácora"}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {c.critical > 0 && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">🔴 {c.critical} críticas</span>}
                        {c.alerts > c.critical && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">🟡 {c.alerts - c.critical}</span>}
                        {c.nextMilestone && <span className="truncate rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400">🗓 {c.nextMilestone.date}</span>}
                        {c.alerts === 0 && !c.nextMilestone && <span className="text-[10px] text-slate-600">Sin alertas</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ColombiaMap cards={portfolio} />

          <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                      IA para Ingeniería, Arquitectura y Construcción en Colombia
                    </h1>
                    <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
                      Consulta la NSR-10, normativa técnica, especificaciones constructivas y criterios de
                      diseño en segundos.
                    </p>

                    <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-3">
                      {trustBadges.map((badge) => (
                        <span
                          key={badge}
                          className="inline-flex items-center gap-1.5 text-sm text-slate-400"
                        >
                          <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {badge}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="mt-12 sm:mt-14">
                    <div className="mb-5 flex items-end justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Capacidades
                        </h2>
                        <p className="mt-1 text-lg font-medium text-white">
                          Más que un chatbot genérico
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {features.map((feature) => (
                        <div
                          key={feature.title}
                          className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-sm shadow-black/20 transition hover:border-blue-500/20 hover:bg-blue-500/[0.03]"
                        >
                          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 transition group-hover:bg-blue-500/15">
                            <Icon className="h-5 w-5">{feature.icon}</Icon>
                          </div>
                          <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                            {feature.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mt-12 sm:mt-14">
                    <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Consultas frecuentes
                    </h2>
                    <p className="mb-5 text-lg font-medium text-white">
                      Comience con una pregunta técnica
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => sendMessage(suggestion)}
                          disabled={isLoading}
                          className="group flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#0a1120]/80 px-4 py-4 text-left text-sm leading-relaxed text-slate-300 shadow-sm transition hover:border-blue-500/25 hover:bg-blue-500/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/15 transition group-hover:bg-blue-500/20">
                            <Icon className="h-3.5 w-3.5" strokeWidth={2}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </Icon>
                          </span>
                          <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              ) : showToolLauncher ? (
                <div className="w-full py-4 sm:py-8">
                  <div className="mb-8">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
                      Herramientas
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      {activeProject?.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Selecciona una herramienta para empezar a trabajar en el proyecto.
                    </p>
                  </div>

                  <div className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
                      👥 Miembros del proyecto
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="correo@ejemplo.com (debe tener cuenta ObraHub)"
                        className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none"
                      />
                      <select
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value)}
                        className="rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-2 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="viewer">Solo ver</option>
                        <option value="editor">Editar</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleInviteMember()}
                        disabled={memberBusy || !memberEmail.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                      >
                        {memberBusy ? "Invitando…" : "Invitar"}
                      </button>
                    </div>
                    {memberError && <p className="mt-2 text-[11px] text-red-400">{memberError}</p>}
                    {members.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {members.map((m) => (
                          <span key={m.userId} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300">
                            {m.email}
                            <span className="text-[9px] uppercase tracking-wide text-blue-300">{m.role}</span>
                            <button type="button" onClick={() => void handleRemoveMember(m.userId)} className="text-slate-600 hover:text-red-400" title="Quitar">✕</button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-600">Sin invitados — comparte el proyecto con tu equipo invitándolos por correo.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => (tool.available ? openTool(tool.id) : null)}
                        disabled={!tool.available}
                        className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${tool.gradient} p-6 text-left shadow-sm transition ${
                          tool.available
                            ? "hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-900/10"
                            : "cursor-not-allowed opacity-60"
                        }`}
                      >
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-2xl ring-1 ring-white/[0.08]">
                          {tool.icon}
                        </div>
                        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                          {tool.title}
                          {!tool.available && (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
                              Próximamente
                            </span>
                          )}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                          {tool.description}
                        </p>
                        {tool.available && (
                          <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-400 transition group-hover:gap-2">
                            Abrir
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : showFolderDashboard ? (
                <div className="w-full py-2 sm:py-4">
                  <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
                        Proyecto
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                        {activeProject?.name}
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        Seleccione una carpeta para consultar, o cree una nueva.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateFolder(true);
                        setFolderError(null);
                      }}
                      className="shrink-0 rounded-xl border border-blue-500/20 bg-blue-600/10 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600/20"
                    >
                      + Carpeta
                    </button>
                  </div>

                  {isLoadingFolders ? (
                    <p className="py-12 text-center text-sm text-slate-500">Cargando carpetas…</p>
                  ) : folders.length === 0 ? (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center sm:p-8">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 text-2xl">
                        📁
                      </div>
                      <h3 className="text-lg font-medium text-white">Sin carpetas aún</h3>
                      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                        Crea carpetas para organizar las áreas del proyecto. Empieza con una sugerencia:
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {FOLDER_TEMPLATE.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => handleCreateFolder(suggestion)}
                            disabled={isCreatingFolder}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-blue-500/25 hover:bg-blue-500/[0.06] hover:text-white disabled:opacity-50"
                          >
                            <span>{folderIcon(suggestion)}</span>
                            {suggestion}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateFolder(true);
                          setFolderError(null);
                        }}
                        className="mt-5 text-sm font-medium text-blue-400 transition hover:text-blue-300"
                      >
                        Crear carpeta personalizada
                      </button>
                      <button
                        type="button"
                        onClick={() => zipInputRef.current?.click()}
                        disabled={isUploading}
                        className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        📂 Importar proyecto (ZIP)
                      </button>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        Trae tu proyecto ya trabajado — se recrea la estructura de carpetas completa
                      </span>
                      <input
                        ref={zipInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImportZip(f);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {folders.map((folder) => (
                        <div
                          key={folder.id}
                          className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition hover:border-blue-500/25 hover:bg-blue-500/[0.03]"
                        >
                          <button
                            type="button"
                            onClick={() => openFolderById(folder.id)}
                            className="block w-full text-left"
                          >
                            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl ring-1 ring-blue-500/20 transition group-hover:bg-blue-500/15">
                              {folderIcon(folder.name)}
                            </div>
                            <h3 className="truncate text-sm font-semibold text-white">{folder.name}</h3>
                            <p className="mt-1 text-xs text-slate-600">
                              {new Date(folder.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFolderById(folder.id)}
                            aria-label="Eliminar carpeta"
                            className="absolute right-3 top-3 rounded-lg p-2 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400 md:opacity-0 md:transition md:group-hover:opacity-100"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateFolder(true);
                          setFolderError(null);
                        }}
                        className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-transparent p-5 text-slate-500 transition hover:border-blue-500/30 hover:text-blue-400"
                      >
                        <svg className="mb-2 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium">Nueva carpeta</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTool === "storage" && activeFolderId ? (
                /* Storage tool — folder explorer: subfolders grid + files + breadcrumb */
                <div className="w-full py-2 sm:py-4">
                  {/* Dynamic breadcrumb */}
                  <div className="mb-5 flex flex-wrap items-center gap-1.5 text-sm">
                    <button
                      type="button"
                      onClick={backToDashboard}
                      className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                    >
                      ← Raíz
                    </button>
                    {folderPath.map((f, i) => (
                      <span key={f.id} className="flex items-center gap-1.5">
                        <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {i === folderPath.length - 1 ? (
                          <span className="rounded-lg px-2 py-1 font-medium text-white">
                            {folderIcon(f.name)} {f.name}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openFolderById(f.id)}
                            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                          >
                            {f.name}
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Folder contents: subfolders + upload + files (always visible) */}
                  {isLoadingFolders ? (
                    <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>
                  ) : (
                    <>
                      {/* Subfolders grid */}
                      {subfolders.length > 0 && (
                        <div className="mb-6">
                          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Subcarpetas ({subfolders.length})
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {subfolders.map((folder) => (
                              <div
                                key={folder.id}
                                className="group relative flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:border-blue-500/25"
                              >
                                <button
                                  type="button"
                                  onClick={() => openFolderById(folder.id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                  <span className="text-lg">{folderIcon(folder.name)}</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-slate-200">{folder.name}</span>
                                    <span className="block text-xs text-slate-600">
                                      {new Date(folder.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFolderById(folder.id)}
                                  aria-label="Eliminar carpeta"
                                  className="shrink-0 rounded-lg p-2.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action bar: create subfolder */}
                      <div className="mb-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowCreateFolder(true); setFolderError(null); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-400 transition hover:border-blue-500/30 hover:text-blue-400"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Nueva subcarpeta
                        </button>
                      </div>

                      {/* Upload zone — ALWAYS visible */}
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center transition hover:border-blue-500/40 hover:bg-blue-500/[0.04]">
                        <input
                          key={fileInputKey}
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept={ACCEPTED_EXTENSIONS.join(",")}
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              void handleUploadFiles(e.target.files);
                            }
                          }}
                        />
                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                          <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-200">
                          {isUploading ? (uploadProgress ?? "Subiendo archivos…") : "Arrastra archivos o haz clic para subir"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          PDF, DWG, DXF, IFC, XLSX, imágenes · IFC hasta 100 MB · Revit (.rvt) hasta 300 MB
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => zipInputRef.current?.click()}
                            disabled={isUploading}
                            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            📂 Importar proyecto (ZIP)
                          </button>
                          <span className="text-[10px] text-slate-500">
                            Trae tu proyecto ya trabajado — se recrea la estructura de carpetas completa
                          </span>
                        </div>
                        <input
                          ref={zipInputRef}
                          type="file"
                          accept=".zip"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleImportZip(f);
                          }}
                        />
                      </label>

                      {isUploading && uploadProgress && (
                        <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                          <p className="text-xs font-medium text-blue-300">{uploadProgress}</p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Subida por partes con reintentos automáticos — puedes seguir navegando.
                          </p>
                        </div>
                      )}

                      {uploadError && (
                        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                          {uploadError}
                        </p>
                      )}

                      {/* File list */}
                      {files.length > 0 && (
                        <div className="mt-6">
                          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Archivos ({files.length})
                          </p>
                          <ul className="space-y-1.5">
                            {files.map((file) => (
                              <li
                                key={file.id}
                                className="group flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3"
                              >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-base">
                                  {fileIcon(file.name)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handlePreviewFile(file)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-sm font-medium text-slate-200 hover:text-blue-300">{file.name}</p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    {formatFileSize(file.sizeBytes)} ·{" "}
                                    {new Date(file.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePreviewFile(file)}
                                  aria-label="Vista previa"
                                  className="shrink-0 rounded-lg p-2.5 text-slate-500 transition hover:bg-white/5 hover:text-blue-400"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadFile(file.id)}
                                  aria-label="Descargar"
                                  className="shrink-0 rounded-lg p-2.5 text-slate-500 transition hover:bg-white/5 hover:text-blue-400"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFile(file.id)}
                                  aria-label="Eliminar archivo"
                                  className="shrink-0 rounded-lg p-2.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 md:opacity-0 md:transition md:group-hover:opacity-100"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : isLoadingConversations && activeProjectSlug ? (
                <div className="my-auto flex w-full justify-center py-12">
                  <p className="text-sm text-slate-500">Cargando conversaciones…</p>
                </div>
              ) : activeTool === "costos" ? (
                <CostosTool
                  initialPrompt={pendingBudgetPrompt ?? undefined}
                  projectSlug={activeProjectSlug ?? undefined}
                  onGenerateSchedule={activeProjectSlug ? (ctx) => {
                    setPendingScheduleContext(ctx);
                    setActiveTool("seguimiento");
                  } : undefined}
                />
              ) : activeTool === "seguimiento" ? (
                activeProjectSlug ? (
                  <GanttTool
                    projectSlug={activeProjectSlug}
                    initialBudgetContext={pendingScheduleContext ?? undefined}
                    onOpenIfcWithHighlights={openIfcWithHighlights}
                  />
                ) : (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Selecciona un proyecto para ver el cronograma.
                  </div>
                )
              ) : activeTool === "bitacora" ? (
                activeProjectSlug ? (
                  <BitacoraTool projectSlug={activeProjectSlug} />
                ) : (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Selecciona un proyecto para llevar la bitácora.
                  </div>
                )
              ) : activeTool === "control" ? (
                activeProjectSlug ? (
                  <ControlTool projectSlug={activeProjectSlug} />
                ) : (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Selecciona un proyecto para ver el control de obra.
                  </div>
                )
              ) : (
                <div className="w-full space-y-6 pb-4">
                  {activeProjectSlug && showMemory && (
                    <MemoryPanel
                      memories={memories}
                      open={showMemory}
                      onToggle={() => setShowMemory(false)}
                      newMemory={newMemory}
                      setNewMemory={setNewMemory}
                      onAdd={activeFolderSlug ? handleAddFolderMemory : handleAddMemory}
                      onDelete={activeFolderSlug ? handleDeleteFolderMemory : handleDeleteMemory}
                      isSaving={isSavingMemory}
                    />
                  )}
                  {messages.length > 0 ? (
                    messages.map((msg, i) =>
                      msg.role === "user" ? (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3.5 text-sm leading-relaxed text-white shadow-lg shadow-blue-900/25 ring-1 ring-blue-500/20 sm:max-w-[80%]">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div key={i} className="flex gap-3 sm:gap-3.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-[10px] font-bold text-white shadow-md shadow-blue-900/40 ring-1 ring-blue-400/20">
                            OH
                          </div>
                          <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/[0.08] bg-[#0a1120]/90 px-4 py-4 text-sm leading-relaxed text-slate-300 shadow-sm sm:max-w-[80%]">
                            <AssistantMessage content={msg.content} />
                          </div>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="my-auto flex w-full justify-center py-12">
                      <p className="text-sm text-slate-500">
                        Escriba una consulta para comenzar.
                      </p>
                    </div>
                  )}
                  {isLoading && (
                    <div className="flex gap-3 sm:gap-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-[10px] font-bold text-white shadow-md shadow-blue-900/40">
                        OH
                      </div>
                      <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/[0.08] bg-[#0a1120]/90 px-4 py-4 text-sm text-slate-500 sm:max-w-[80%]">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
                          </span>
                          Consultando {activeScopeLabel}…
                        </span>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-center text-sm text-red-400">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {showComposer && (
          <div className="shrink-0 border-t border-white/[0.04] bg-[#050b14]/60 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-xl sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className={`mx-auto w-full ${showHero ? "max-w-5xl" : activeTool === "seguimiento" ? "max-w-[1600px]" : "max-w-3xl"}`}>
              <div className="relative flex items-end rounded-2xl border border-white/[0.08] bg-[#0a1120]/90 shadow-2xl shadow-black/30 ring-1 ring-white/[0.04] backdrop-blur-sm transition focus-within:border-blue-500/40 focus-within:ring-blue-500/15">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoGrowTextarea();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Pregunte sobre normativa, estructuras, concreto, mampostería, geotecnia, diseño sísmico y construcción..."
                  disabled={isLoading}
                  className="max-h-36 min-h-[54px] flex-1 resize-none bg-transparent px-4 py-3.5 text-base text-slate-200 placeholder:text-slate-500 focus:outline-none disabled:opacity-50 sm:px-5 sm:text-sm"
                />
                <button
                  type="button"
                  aria-label="Enviar mensaje"
                  disabled={!input.trim() || isLoading}
                  onClick={() => sendMessage(input)}
                  className="m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                >
                  <Icon className="h-4 w-4" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </Icon>
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600 sm:text-xs">
                Las respuestas son una ayuda técnica basada en documentación procesada. Siempre verifique el
                texto oficial de la normativa aplicable.
              </p>
            </div>
          </div>
          )}
        </main>
      </div>

      {/* ===== History Panel (right side) — only in normativa/hero mode ===== */}
      {showHistoryPanel && (showHero || activeTool === "normativa") && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setShowHistoryPanel(false)}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-white/[0.06] bg-[#0a1120] lg:static lg:z-auto lg:w-72 lg:shrink-0"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <p className="text-sm font-semibold text-slate-200">🕘 Historial</p>
              <button
                type="button"
                onClick={() => setShowHistoryPanel(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {chatHistory.length === 0 ? (
                <p className="mt-8 text-center text-sm text-slate-600">
                  Aún no tienes consultas guardadas.
                  <br />
                  Haz una pregunta al Consultor Normativo.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Últimas {chatHistory.length} consultas
                  </p>
                  {chatHistory.map((entry, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setInput(entry.question);
                        // On mobile, close panel so they can see the input.
                        // On desktop, keep it open for browsing.
                        if (window.innerWidth < 1024) setShowHistoryPanel(false);
                      }}
                      className="block w-full rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-left transition hover:border-blue-500/20 hover:bg-blue-500/[0.04]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-400">
                          {i + 1}
                        </span>
                        <p className="line-clamp-2 flex-1 text-xs font-medium text-slate-200">
                          {entry.question}
                        </p>
                      </div>
                      <p className="mt-1.5 line-clamp-2 pl-6.5 text-[11px] text-slate-500" style={{ paddingLeft: "1.65rem" }}>
                        {entry.answer}
                      </p>
                      <p className="mt-1.5 pl-6.5 text-[10px] text-slate-600" style={{ paddingLeft: "1.65rem" }}>
                        {new Date(entry.timestamp).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(CHAT_HISTORY_KEY);
                      setChatHistory([]);
                    }}
                    className="mt-3 w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
                  >
                    🗑 Limpiar historial
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {showCreateProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a1120] p-6 shadow-2xl"
          >
            <h3 id="new-project-title" className="text-lg font-semibold text-white">
              Nuevo Proyecto
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Ingrese el nombre del proyecto. El identificador se generará automáticamente.
            </p>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateProject();
                }
              }}
              placeholder="Ej. Edificio Residencial Norte"
              autoFocus
              disabled={isCreatingProject}
              className="mt-4 w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
            />

            <p className="mt-4 text-xs font-medium text-slate-400">
              Carpetas iniciales (opcional):
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FOLDER_TEMPLATE.map((suggestion) => {
                const checked = selectedTemplateFolders.includes(suggestion);
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateFolders((prev) =>
                        prev.includes(suggestion)
                          ? prev.filter((s) => s !== suggestion)
                          : [...prev, suggestion],
                      );
                    }}
                    disabled={isCreatingProject}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                      checked
                        ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                        : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span>{folderIcon(suggestion)}</span>
                    {suggestion}
                    {checked && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Ciudad (para el mapa de obras)</label>
              <input
                type="text"
                value={newProjectCity}
                onChange={(e) => setNewProjectCity(e.target.value)}
                placeholder="Ej. Bogotá"
                className="w-full rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none"
              />
            </div>

            {projectError && (
              <p className="mt-3 text-sm text-red-400">{projectError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateProject(false);
                  setNewProjectName("");
      setNewProjectCity("");
                  setProjectError(null);
                }}
                disabled={isCreatingProject}
                className="rounded-xl px-4 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isCreatingProject}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingProject ? "Creando…" : "Crear proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a1120] p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Eliminar proyecto</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Esta acción eliminará permanentemente el proyecto{" "}
              <span className="font-medium text-slate-200">"{projectToDelete.name}"</span>{" "}
              y todos sus carpetas, archivos y conversaciones. No se puede deshacer.
            </p>
            <p className="mt-4 text-xs font-medium text-slate-400">
              Para confirmar, escribe el nombre del proyecto:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={projectToDelete.name}
              autoFocus
              disabled={isDeletingProject}
              className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-base text-slate-200 placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setProjectToDelete(null);
                  setDeleteConfirmText("");
                }}
                disabled={isDeletingProject}
                className="rounded-xl px-4 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleteConfirmText !== projectToDelete.name || isDeletingProject}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletingProject ? "Eliminando…" : "Eliminar proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateFolder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-folder-title"
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a1120] p-6 shadow-2xl"
          >
            <h3 id="new-folder-title" className="text-lg font-semibold text-white">
              Nueva Carpeta
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Organiza un área del proyecto. Cada carpeta tiene su propio chat y memoria.
            </p>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateFolder(newFolderName);
                }
              }}
              placeholder="Ej. Cimentación, Legal, Costos…"
              autoFocus
              disabled={isCreatingFolder}
              className="mt-4 w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FOLDER_TEMPLATE.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNewFolderName(suggestion)}
                  disabled={isCreatingFolder}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-400 transition hover:border-blue-500/25 hover:text-white"
                >
                  {folderIcon(suggestion)} {suggestion}
                </button>
              ))}
            </div>
            {folderError && (
              <p className="mt-3 text-sm text-red-400">{folderError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderName("");
                  setFolderError(null);
                }}
                disabled={isCreatingFolder}
                className="rounded-xl px-4 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCreateFolder(newFolderName)}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingFolder ? "Creando…" : "Crear carpeta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document preview modal */}
      {previewFile && (() => {
        const isIfc = previewKind(previewFile.name, previewFile.mimeType) === "ifc";
        return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-lg">{fileIcon(previewFile.name)}</span>
              <p className="truncate text-sm font-medium text-white">{previewFile.name}</p>
              <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                {formatFileSize(previewFile.sizeBytes)}
              </span>
              {isIfc && (
                <span className="hidden shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300 sm:inline">
                  Modelo BIM
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => previewFile && handleDownloadFile(previewFile.id)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Descargar
              </button>
              <button
                type="button"
                onClick={() => { setPreviewFile(null); setPreviewUrl(null); setIfcHighlightIds([]); }}
                aria-label="Cerrar"
                className="rounded-lg p-2.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-[#050b14]">
            {isLoadingPreview ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-slate-500">Cargando vista previa…</p>
              </div>
            ) : !previewUrl ? (
              <div className="flex h-full items-center justify-center px-4 text-center">
                <div>
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-2xl">
                    {fileIcon(previewFile.name)}
                  </div>
                  <p className="text-sm font-medium text-white">Vista previa no disponible</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Descarga el archivo para verlo.
                  </p>
                </div>
              </div>
            ) : isIfc ? (
              <IfcViewer
                url={previewUrl}
                projectSlug={activeProjectSlug ?? undefined}
                fileId={previewFile.id}
                highlightGlobalIds={ifcHighlightIds}
                onGenerateBudget={(ctx) => {
                  setPendingBudgetPrompt(ctx);
                  setPreviewFile(null);
                  setPreviewUrl(null);
                  setIfcHighlightIds([]);
                  setActiveTool("costos");
                }}
                onGenerateSchedule={(ctx) => {
                  setPendingScheduleContext(ctx);
                  setPreviewFile(null);
                  setPreviewUrl(null);
                  setIfcHighlightIds([]);
                  setActiveTool("seguimiento");
                }}
              />
            ) : previewKind(previewFile.name, previewFile.mimeType) === "pdf" ? (
              <iframe src={previewUrl} className="h-full w-full" title={previewFile.name} />
            ) : previewKind(previewFile.name, previewFile.mimeType) === "image" ? (
              <div className="flex h-full items-center justify-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={previewFile.name} className="max-h-full max-w-full rounded-lg" />
              </div>
            ) : isExcelFile(previewFile.name) ? (
              <ExcelPreview url={previewUrl} filename={previewFile.name} />
            ) : previewKind(previewFile.name, previewFile.mimeType) === "office" ? (
              <iframe
                src={`https://view.officeapps.office.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`}
                className="h-full w-full"
                title={previewFile.name}
              />
            ) : previewKind(previewFile.name, previewFile.mimeType) === "revit" ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-4xl ring-1 ring-blue-500/20">
                    🏭
                  </div>
                  <p className="text-base font-semibold text-white">Modelo de Revit</p>
                  <p className="mt-1 text-sm text-slate-400">{previewFile.name}</p>
                  <p className="mt-4 text-sm text-slate-500">
                    Los archivos <strong className="text-slate-300">.rvt</strong> son formato
                    propietario de Autodesk Revit y no pueden visualizarse directamente en el
                    navegador.
                  </p>
                  <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-left">
                    <p className="text-xs font-semibold text-blue-300">💡 Para visualizar este modelo en ObraHub:</p>
                    <ol className="mt-2 space-y-1.5 text-xs text-slate-400">
                      <li>1. En Revit: <strong>Archivo → Exportar → IFC</strong></li>
                      <li>2. Sube el archivo <strong className="text-cyan-300">.ifc</strong> exportado a esta carpeta</li>
                      <li>3. Haz clic en el archivo IFC — se abrirá el visor 3D completo</li>
                    </ol>
                  </div>
                  <button
                    type="button"
                    onClick={() => previewFile && handleDownloadFile(previewFile.id)}
                    className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                  >
                    Descargar modelo .rvt
                  </button>
                </div>
              </div>
            ) : previewKind(previewFile.name, previewFile.mimeType) === "cad" ? (
              previewFile.name.toLowerCase().endsWith(".dxf") ? (
                <DxfPreview url={previewUrl} filename={previewFile.name} />
              ) : (
                // .dwg — convert to DXF in-browser via libredwg WASM, then render.
                <DwgPreview url={previewUrl} filename={previewFile.name} />
              )
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center">
                <p className="text-sm text-slate-500">Vista previa no disponible. Descarga el archivo.</p>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
