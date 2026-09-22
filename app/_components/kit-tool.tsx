"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * #4 — SELECCIONADOR / FILTRO DE PROYECTO IFC TOTALIZADO (Kit de Proyecto).
 * Aqui el usuario declara CUAL es el conjunto oficial de archivos (2D, IFC
 * con cantidades, presupuesto...) que alimentara TODO el flujo: Costos,
 * Gantt, Bitacora, Control, Asamblea y Pasaporte. Queda activo hasta que el
 * usuario lo cambie. Valida lo que falta por herramienta (aprende con el
 * uso que informacion exacta exige cada una).
 */
type FileRow = { id: string; name: string; sizeBytes?: number; contentType?: string };
type Kit = { name: string; fileIds: string[]; note?: string; updatedAt?: string };

export function KitTool({ projectSlug }: { projectSlug?: string }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [kit, setKit] = useState<Kit | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kitName, setKitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectSlug) { setLoading(false); return; }
    setLoading(true);
    try {
      const [rootRes, kitRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectSlug)}/folders`),
        fetch(`/api/projects/${encodeURIComponent(projectSlug)}/kit`),
      ]);
      const rootData = rootRes.ok ? await rootRes.json() : { folders: [] };
      const folders: Array<{ id: string }> = rootData.folders ?? [];
      const lists = await Promise.all(
        folders.map(async (f) => {
          const r = await fetch(`/api/folders/${f.id}/files`);
          const d = r.ok ? await r.json() : { files: [] };
          return (d.files ?? []) as FileRow[];
        }),
      );
      setFiles(lists.flat());
      if (kitRes.ok) {
        const kd = await kitRes.json();
        if (kd.kit) { setKit(kd.kit); setSelected(new Set(kd.kit.fileIds ?? [])); setKitName(kd.kit.name ?? ""); }
      }
    } finally { setLoading(false); }
  }, [projectSlug]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!projectSlug || !kitName.trim() || selected.size === 0) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/kit`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: kitName.trim(), fileIds: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      setKit(d.kit);
      setMsg("✅ Kit definido — Costos, Seguimiento, Bitácora, Control y Pasaporte usarán estos archivos.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ifcCount = files.filter((f) => selected.has(f.id) && /\.ifc$/i.test(f.name)).length;
  const validations = [
    { ok: selected.size > 0, label: "Kit con archivos", hint: "Selecciona al menos un archivo" },
    { ok: ifcCount > 0, label: "Modelo IFC", hint: "Costos/Seguimiento esperan un IFC con cantidades" },
    { ok: ifcCount <= 1, label: "Un solo IFC maestro", hint: "Mas de uno crea ambigüedad en el flujo" },
  ];

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando archivos del proyecto…</div>;
  if (!projectSlug) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">Selecciona un proyecto para definir su kit.</div>;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">Paso 4 · Datos maestros del flujo</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Kit del proyecto — archivos oficiales</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
          Marca los archivos que alimentarán <b className="text-slate-300">Costos, Seguimiento, Bitácora, Control de obra y Pasaporte</b>: planos 2D, modelo 3D con cantidades, presupuesto, estudios. El kit queda activo hasta que lo cambies.
        </p>

        {kit && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
            <span className="font-semibold">📦 Kit activo: {kit.name}</span>
            <span className="text-amber-200/60">{kit.fileIds.length} archivo(s){kit.updatedAt ? ` · ${new Date(kit.updatedAt).toLocaleDateString("es-CO")}` : ""}</span>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07]">
          {files.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Sin archivos aún — súbelos en 📁 Documentos y vuelve.</p>
          ) : files.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-3 border-b border-white/[0.05] px-4 py-3 transition last:border-0 hover:bg-white/[0.02]">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="h-4 w-4 accent-amber-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{f.name}</span>
              {/\.ifc$/i.test(f.name) && <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-300">IFC</span>}
              {/\.dxf$|\.dwg$/i.test(f.name) && <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-violet-300">2D</span>}
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {validations.map((v) => (
            <div key={v.label} className={`rounded-xl border px-3 py-2 text-[11px] ${v.ok ? "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300" : "border-white/[0.08] bg-white/[0.02] text-slate-500"}`}>
              {v.ok ? "✓" : "○"} {v.label}{!v.ok && <span className="mt-0.5 block text-[9.5px] text-slate-600">{v.hint}</span>}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={kitName} onChange={(e) => setKitName(e.target.value)}
            placeholder="Nombre del kit (ej. Licencia Chapinero — set completo)"
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none"
          />
          <button type="button" onClick={save} disabled={saving || !kitName.trim() || selected.size === 0}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50">
            {saving ? "Guardando…" : `📦 Definir kit (${selected.size})`}
          </button>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-400">{msg}</p>}
      </div>
    </div>
  );
}
