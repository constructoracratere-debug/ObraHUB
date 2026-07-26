"use client";

import { useState } from "react";
import type { Country, KBDocument } from "@/lib/documents";

const MAX_FILE_MB = 25;

type CountryTab = { id: Country; label: string; flag: string; placeholder: string };
const COUNTRY_TABS: CountryTab[] = [
  { id: "colombia", label: "Colombia", flag: "🇨🇴", placeholder: "Ej. NSR-10, RETIE, RAS…" },
  { id: "mexico", label: "México", flag: "🇲🇽", placeholder: "Ej. NTC, RCDF, NOM…" },
];

const STATUS_LABELS: Record<string, { text: string; classes: string }> = {
  ready: { text: "Listo", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  processing: { text: "Procesando…", classes: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
  failed: { text: "Error", classes: "border-red-500/20 bg-red-500/10 text-red-400" },
};

export function DocumentsManager({
  globalDocs,
  isAdmin,
  projectSlug,
}: {
  globalDocs: KBDocument[];
  isAdmin: boolean;
  projectSlug: string | null;
}) {
  const [docs, setDocs] = useState<KBDocument[]>(globalDocs);
  const [country, setCountry] = useState<Country>("colombia");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const visibleDocs = docs.filter((d) => d.country === country);
  const activeTab = COUNTRY_TABS.find((t) => t.id === country)!;

  async function handleUpload(file: File) {
    if (uploading) return;
    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", "global");
      form.append("country", country);
      if (title.trim()) form.append("title", title.trim());

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Error al subir");
      }

      // Refresh the list to pick up the new doc with its final status.
      await refresh();
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el documento");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    try {
      await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    } catch {
      await refresh();
    }
  }

  async function refresh() {
    try {
      // Load all global docs (both countries) so tab counts stay in sync.
      const res = await fetch("/api/documents?scope=global");
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
    } catch {
      // keep current state
    }
  }

  return (
    <div className="space-y-8">
      {/* Country tabs */}
      <div className="flex gap-2">
        {COUNTRY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCountry(tab.id)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              country === tab.id
                ? "border-blue-500/40 bg-blue-500/15 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="text-base">{tab.flag}</span>
            {tab.label}
            <span className="ml-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-slate-500">
              {docs.filter((d) => d.country === tab.id).length}
            </span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          <h2 className="text-lg font-semibold text-white">Subir documento (global)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Añade una normativa o reglamento a la biblioteca compartida. Solo administradores.
          </p>

          <div className="mt-4">
            <label htmlFor="doc-title" className="mb-1.5 block text-sm font-medium text-slate-300">
              Título (opcional)
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={activeTab.placeholder}
              disabled={uploading}
              className="w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50 sm:text-sm"
            />
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center transition hover:border-blue-500/40 hover:bg-blue-500/[0.04]">
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <div>
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-200">
                {uploading ? "Procesando PDF…" : "Haz clic para subir un PDF"}
              </p>
              <p className="mt-1 text-xs text-slate-500">PDF hasta {MAX_FILE_MB} MB</p>
            </div>
          </label>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Documentos · {activeTab.flag} {activeTab.label} ({visibleDocs.length})
        </h2>

        {visibleDocs.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl ring-1 ring-blue-500/20">
              {activeTab.flag}
            </div>
            <p className="text-sm font-medium text-white">
              {country === "mexico"
                ? "México aún no tiene documentos"
                : "Sin documentos aún"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {country === "mexico"
                ? isAdmin
                  ? "Sube una normativa mexicana para habilitar la búsqueda."
                  : "Los administradores añadirán normativas mexicanas próximamente."
                : isAdmin
                  ? "Sube una normativa para que el asistente pueda consultarla."
                  : "Los administradores aún no han añadido documentos."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleDocs.map((doc) => {
              const status = STATUS_LABELS[doc.status] ?? STATUS_LABELS.processing;
              const canDelete = isAdmin;
              return (
                <li
                  key={doc.id}
                  className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-lg ring-1 ring-blue-500/20">
                    📄
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{doc.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {doc.sourceFilename ?? "—"} · {doc.pageCount} pág.
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.classes}`}>
                    {status.text}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      aria-label="Eliminar documento"
                      className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
