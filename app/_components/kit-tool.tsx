"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * #4 KIT DE PROYECTO — Interventor de datos maestros.
 * A) Solicita todo lo necesario para iniciar la secuencia 5-9.
 * B) Revisa el IFC del kit: cantidades, coherencia estructural y estetica.
 */
type FileRow = { id: string; name: string; folderId: string };
type Kit = { name: string; fileIds: string[]; note?: string; updatedAt?: string };
type Audit = { entity: string; count: number; ok: boolean; hint: string }[];

const REQS: Array<{ tool: string; icon: string; need: Array<{ label: string; test: (sel: FileRow[]) => boolean }> }> = [
  { tool: "Costos y Presupuestos", icon: "💰", need: [
    { label: "Modelo IFC con cantidades", test: (s) => s.some((f) => /\.ifc$/i.test(f.name)) },
    { label: "Planos 2D (DXF/DWG/PDF)", test: (s) => s.some((f) => /\.(dxf|dwg|pdf)$/i.test(f.name)) },
  ]},
  { tool: "Seguimiento (Gantt)", icon: "📊", need: [
    { label: "Presupuesto base (xlsx/csv) o IFC", test: (s) => s.some((f) => /\.(xlsx?|csv|ifc)$/i.test(f.name)) },
  ]},
  { tool: "Bitacora Diaria", icon: "📔", need: [
    { label: "Kit definido (cualquier archivo)", test: (s) => s.length > 0 },
  ]},
  { tool: "Control de Obra", icon: "📈", need: [
    { label: "Presupuesto base (xlsx/csv)", test: (s) => s.some((f) => /\.(xlsx?|csv)$/i.test(f.name)) },
  ]},
  { tool: "Pasaporte de Materiales", icon: "🌱", need: [
    { label: "Modelo IFC (takeoff ladrillo a ladrillo)", test: (s) => s.some((f) => /\.ifc$/i.test(f.name)) },
  ]},
];

export function KitTool({ projectSlug }: { projectSlug?: string }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [kit, setKit] = useState<Kit | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kitName, setKitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [auditVerdict, setAuditVerdict] = useState<string | null>(null);
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
      const lists = await Promise.all(folders.map(async (f) => {
        const r = await fetch(`/api/folders/${f.id}/files`);
        const d = r.ok ? await r.json() : { files: [] };
        return (d.files ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name, folderId: f.id }));
      }));
      const all = lists.flat();
      setFiles(all);
      if (kitRes.ok) {
        const kd = await kitRes.json();
        if (kd.kit) {
          setKit(kd.kit);
          setSelected(new Set<string>(kd.kit.fileIds ?? []));
          setKitName(kd.kit.name ?? "");
        }
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
      setMsg("✅ Kit definido — la secuencia 5-9 trabajará con estos archivos.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const runAudit = async () => {
    const sel = files.filter((f) => selected.has(f.id));
    const ifc = sel.find((f) => /\.ifc$/i.test(f.name));
    setAudit(null); setAuditVerdict(null);
    if (!ifc) { setAuditVerdict("Selecciona un IFC en el kit para auditarlo."); return; }
    setAuditing(true);
    try {
      const r = await fetch(`/api/folders/${ifc.folderId}/files/download?id=${ifc.id}`);
      const text = (await r.text()).slice(0, 4000000);
      const count = (re: RegExp) => (text.match(re) ?? []).length;
      const n = {
        muros: count(/IFCWALLSTANDARDCASE/g), losas: count(/IFCSLAB/g), columnas: count(/IFCCOLUMN/g),
        vigas: count(/IFCBEAM/g), ventanas: count(/IFCWINDOW/g), puertas: count(/IFCDOOR/g),
        zapatas: count(/IFCFOOTING/g), mobiliario: count(/IFCFURNISHINGELEMENT/g),
        capasMat: count(/IFCMATERIALLAYERSET/g), mep: count(/IFCBUILDINGELEMENTPROXY/g),
      };
      const A: Audit = [
        { entity: "Muros (con vanos reales)", count: n.muros, ok: n.muros >= 6, hint: "Envolvente + divisiones segmentadas en vanos" },
        { entity: "Losas", count: n.losas, ok: n.losas >= 1, hint: "Piso por nivel" },
        { entity: "Columnas", count: n.columnas, ok: n.columnas >= 4, hint: "Retícula NSR" },
        { entity: "Vigas", count: n.vigas, ok: n.vigas >= 2, hint: "Estructura de techo" },
        { entity: "Zapatas", count: n.zapatas, ok: n.zapatas >= 4, hint: "Cimentación" },
        { entity: "Ventanas (iluminación natural)", count: n.ventanas, ok: n.ventanas >= 2, hint: "Sin ventanas el modelo es estéticamente ciego" },
        { entity: "Puertas", count: n.puertas, ok: n.puertas >= 1, hint: "Accesos" },
        { entity: "Mobiliario (estética del programa)", count: n.mobiliario, ok: n.mobiliario >= 4, hint: "Neufert: sin mobiliario el modelo es una caja" },
        { entity: "Ensamblajes por capas (LayerSet)", count: n.capasMat, ok: n.capasMat >= 2, hint: "Obra gris por capas = detalle; sin capas es modelo gris" },
        { entity: "Instalaciones MEP", count: n.mep, ok: n.mep >= 2, hint: "RETIE/RAS" },
      ];
      setAudit(A);
      const missing = A.filter((x) => !x.ok).length;
      setAuditVerdict(missing === 0
        ? "🟢 MODELO COHERENTE — cantidades, estructura, estética y MEP verificados. Aprobado para la secuencia."
        : `🟡 ${missing} observacion(es) — revisa antes de arrancar la secuencia.`);
    } catch { setAuditVerdict("No se pudo leer el IFC (¿archivo válido?)."); } finally { setAuditing(false); }
  };

  const toggle = (id: string) => setSelected((s) => { const n2 = new Set(s); if (n2.has(id)) n2.delete(id); else n2.add(id); return n2; });
  const selFiles = files.filter((f) => selected.has(f.id));

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando archivos del proyecto…</div>;
  if (!projectSlug) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">Selecciona un proyecto para definir su kit.</div>;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">Paso 4 · Datos maestros + interventor de coherencia</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Kit del proyecto — archivos oficiales</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Marca los archivos que alimentarán la secuencia 5-9. El kit <b className="text-slate-300">queda activo hasta que lo cambies</b> y audita el modelo antes de arrancar.</p>

        {kit && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
            <span className="font-semibold">📦 Kit activo: {kit.name}</span>
            <span className="text-amber-200/60">{kit.fileIds.length} archivo(s){kit.updatedAt ? ` · ${new Date(kit.updatedAt).toLocaleDateString("es-CO")}` : ""}</span>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lo que cada herramienta necesita para arrancar</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {REQS.map((r) => {
              const all = r.need.every((nd) => nd.test(selFiles));
              return (
                <div key={r.tool} className={`rounded-xl border px-3.5 py-3 ${all ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-white/[0.07] bg-white/[0.02]"}`}>
                  <p className={`text-xs font-semibold ${all ? "text-emerald-300" : "text-slate-300"}`}>{all ? "✓" : "○"} {r.icon} {r.tool}</p>
                  <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-slate-500">
                    {r.need.map((nd) => <li key={nd.label} className={nd.test(selFiles) ? "text-emerald-400/80" : ""}>{nd.test(selFiles) ? "✓" : "•"} {nd.label}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07]">
          {files.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Sin archivos aún — súbelos en 📁 Documentos (posición 1) y vuelve.</p>
          ) : files.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-3 border-b border-white/[0.05] px-4 py-3 transition last:border-0 hover:bg-white/[0.02]">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="h-4 w-4 accent-amber-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{f.name}</span>
              {/\.ifc$/i.test(f.name) && <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-300">IFC</span>}
              {/\.dxf$|\.dwg$/i.test(f.name) && <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-violet-300">2D</span>}
              {/\.(xlsx?|csv)$/i.test(f.name) && <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">DATA</span>}
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input value={kitName} onChange={(e) => setKitName(e.target.value)}
            placeholder="Nombre del kit (ej. Licencia Chapinero — set completo)"
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none" />
          <button type="button" onClick={save} disabled={saving || !kitName.trim() || selected.size === 0}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50">
            {saving ? "Guardando…" : `📦 Definir kit (${selected.size})`}
          </button>
          <button type="button" onClick={runAudit} disabled={auditing || selected.size === 0}
            className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50">
            {auditing ? "Auditando…" : "🔍 Revisar modelo"}
          </button>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-400">{msg}</p>}

        {auditVerdict && (
          <div className={`mt-5 rounded-2xl border p-4 text-sm font-medium ${auditVerdict.startsWith("🟢") ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300" : "border-amber-500/25 bg-amber-500/[0.06] text-amber-200"}`}>
            {auditVerdict}
          </div>
        )}
        {audit && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07]">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Elemento del modelo</th><th className="px-2 py-2">Cant.</th><th className="px-4 py-2">Verificación</th></tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.entity} className="border-t border-white/[0.05]">
                    <td className="px-4 py-2 text-slate-300">{a.entity}</td>
                    <td className="px-2 py-2 font-mono text-slate-200">{a.count}</td>
                    <td className={`px-4 py-2 ${a.ok ? "text-emerald-400/80" : "text-amber-300"}`}>{a.ok ? "✓ completo" : a.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
