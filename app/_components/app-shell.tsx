"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ACTIVE_PROJECT_KEY = "obrahub-active-project";

type Project = {
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
  "Basado en NSR-10",
  "Respuestas con referencias",
  "Diseñado para profesionales",
];

const features = [
  {
    title: "Consultar NSR-10",
    description: "Acceso directo al Reglamento Colombiano de Construcción Sismo Resistente.",
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
              className="flex-1 rounded-lg border border-white/[0.08] bg-[#050b14] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
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
                    className="shrink-0 text-slate-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemory, setShowMemory] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const hasRestoredProject = useRef(false);

  const displayName = profile.full_name?.trim() || "Profesional";
  const initials = initialsFromName(displayName);

  const activeProject = projects.find((project) => project.slug === activeProjectSlug);
  const showHero = messages.length === 0 && !activeProjectSlug;
  const showProjectView =
    !!activeProjectSlug &&
    messages.length === 0 &&
    !isLoadingConversations;

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

    const savedSlug = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (!savedSlug) {
      hasRestoredProject.current = true;
      return;
    }

    if (!projects.some((project) => project.slug === savedSlug)) {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
      hasRestoredProject.current = true;
      return;
    }

    hasRestoredProject.current = true;
    setActiveProjectSlug(savedSlug);
    void loadProjectConversations(savedSlug);
  }, [isLoadingProjects, projects]);

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
        body: JSON.stringify({ name }),
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

  function openProject(slug: string) {
    setActiveProjectSlug(slug);
    localStorage.setItem(ACTIVE_PROJECT_KEY, slug);
    setError(null);
    setSidebarOpen(false);
    setMemories([]);
    setShowMemory(false);
    void loadProjectConversations(slug);
    void loadProjectMemories(slug);
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

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    try {
      if (projectSlug) {
        const savedUserMessage = await persistMessage(projectSlug, "user", message);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex]?.role === "user") {
            updated[lastIndex] = savedUserMessage;
          }
          return updated;
        });
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, projectSlug: projectSlug ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al enviar el mensaje");
      }

      const assistantContent = data.response;

      if (projectSlug) {
        try {
          const savedAssistantMessage = await persistMessage(
            projectSlug,
            "assistant",
            assistantContent,
          );
          setMessages((prev) => [...prev, savedAssistantMessage]);
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
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    setMessages([]);
    setMemories([]);
    setShowMemory(false);
    setError(null);
    setInput("");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#050b14] text-slate-200">
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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.06] bg-[#080f1c]/95 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 lg:static ${
          sidebarCollapsed ? "w-[72px]" : "w-[280px]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className={`border-b border-white/[0.06] py-5 ${
            sidebarCollapsed ? "flex justify-center px-2" : "px-5"
          }`}
        >
          {sidebarCollapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-lg shadow-blue-900/50">
              OH
            </div>
          ) : (
            <div className="pr-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400/80">
                ObraHub
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-slate-300">
                Asistente Técnico para Construcción
              </p>
            </div>
          )}
          <button
            type="button"
            aria-label="Cerrar sidebar"
            className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
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
            className={`flex w-full items-center gap-2.5 rounded-xl border border-blue-500/20 bg-blue-600/10 text-sm font-medium text-white shadow-sm shadow-blue-900/20 transition hover:border-blue-400/30 hover:bg-blue-600/20 ${
              sidebarCollapsed ? "justify-center px-2 py-2.5" : "px-3.5 py-2.5"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-blue-400" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </Icon>
            {!sidebarCollapsed && "Nueva consulta"}
          </button>

          {!sidebarCollapsed && (
            <div className="mt-6 space-y-6">
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
                    className="text-xs font-medium text-blue-400 transition hover:text-blue-300"
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
                      <li key={project.slug}>
                        <button
                          type="button"
                          onClick={() => openProject(project.slug)}
                          className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
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
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{project.name}</span>
                            <span className="mt-0.5 block text-xs text-slate-600">
                              {new Date(project.updatedAt).toLocaleDateString("es-CO", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div>
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Normativa activa
                </p>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Icon className="h-4 w-4 text-emerald-400">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                        />
                      </Icon>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">NSR-10</p>
                      <p className="text-xs text-slate-500">Reglamento vigente</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  NSR-10
                </p>
                <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-slate-400">
                  <Icon className="h-4 w-4 shrink-0 text-blue-400">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m6-12.18A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-12.18v12.18"
                    />
                  </Icon>
                  <span className="truncate">Construcción Sismo Resistente</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {sidebarCollapsed && <div className="flex-1" />}

        <div className={`mt-auto border-t border-white/[0.06] p-3 ${sidebarCollapsed ? "px-2" : ""}`}>
          <div className="space-y-1">
            <Link
              href="/profile"
              className={`flex items-center rounded-xl transition hover:bg-white/[0.03] ${
                sidebarCollapsed ? "justify-center p-2" : "gap-3 px-2 py-2"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-semibold text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/20">
                {initials}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
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
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm text-slate-500 transition hover:bg-white/[0.03] hover:text-red-400"
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
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#050b14]/80 px-4 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </Icon>
            </button>
            <div>
              <Logo size="large" />
              {activeProject && (
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  Proyecto: <span className="text-slate-300">{activeProject.name}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <span className="hidden rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300 sm:inline-flex sm:items-center sm:gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              NSR-10 Colombia
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
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
                showHero ? "max-w-5xl py-8 sm:py-10" : "max-w-3xl min-h-full py-6 sm:py-8"
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
              ) : isLoadingConversations && activeProjectSlug ? (
                <div className="my-auto flex w-full justify-center py-12">
                  <p className="text-sm text-slate-500">Cargando conversaciones…</p>
                </div>
              ) : showProjectView ? (
                <div className="my-auto w-full py-8">
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-6 shadow-sm sm:p-8">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                      <Icon className="h-6 w-6 text-blue-400">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z"
                        />
                      </Icon>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white">
                      {activeProject?.name}
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
                      Proyecto activo. Realice consultas técnicas sobre la NSR-10, estructuras,
                      concreto y normativa colombiana. Las conversaciones de este proyecto se
                      guardarán en su cuenta.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
                        NSR-10
                      </span>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
                        {activeProject?.slug}
                      </span>
                    </div>
                    <MemoryPanel
                      memories={memories}
                      open={showMemory}
                      onToggle={() => setShowMemory((v) => !v)}
                      newMemory={newMemory}
                      setNewMemory={setNewMemory}
                      onAdd={handleAddMemory}
                      onDelete={handleDeleteMemory}
                      isSaving={isSavingMemory}
                    />
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-6 pb-4">
                  {activeProjectSlug && showMemory && (
                    <MemoryPanel
                      memories={memories}
                      open={showMemory}
                      onToggle={() => setShowMemory(false)}
                      newMemory={newMemory}
                      setNewMemory={setNewMemory}
                      onAdd={handleAddMemory}
                      onDelete={handleDeleteMemory}
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
                            <p className="whitespace-pre-wrap">{msg.content}</p>
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
                          Consultando NSR-10…
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

          <div className="shrink-0 border-t border-white/[0.04] bg-[#050b14]/60 px-4 pb-4 pt-3 backdrop-blur-xl sm:px-6 sm:pb-6">
            <div className={`mx-auto w-full ${showHero ? "max-w-5xl" : "max-w-3xl"}`}>
              <div className="relative flex items-end rounded-2xl border border-white/[0.08] bg-[#0a1120]/90 shadow-2xl shadow-black/30 ring-1 ring-white/[0.04] backdrop-blur-sm transition focus-within:border-blue-500/40 focus-within:ring-blue-500/15">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Pregunte sobre NSR-10, estructuras, concreto, mampostería, geotecnia, diseño sísmico y construcción..."
                  disabled={isLoading}
                  className="max-h-36 min-h-[54px] flex-1 resize-none bg-transparent px-4 py-3.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none disabled:opacity-50 sm:px-5"
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
        </main>
      </div>

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
              className="mt-4 w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
            />
            {projectError && (
              <p className="mt-3 text-sm text-red-400">{projectError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateProject(false);
                  setNewProjectName("");
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
    </div>
  );
}
