"use client";

import { useState } from "react";

type ProfileData = {
  full_name: string;
  profession_type: string;
  company: string;
  phone: string;
};

export function ProfileForm({
  initial,
  professions,
  email,
  memberSince,
  avatarUrl,
}: {
  initial: ProfileData;
  professions: string[];
  email: string;
  memberSince: string;
  avatarUrl: string | null;
}) {
  const hasProfile = Boolean(initial.full_name?.trim() || initial.profession_type?.trim());
  const [mode, setMode] = useState<"view" | "edit">(hasProfile ? "view" : "edit");

  const [fullName, setFullName] = useState(initial.full_name);
  const [professionType, setProfessionType] = useState(initial.profession_type);
  const [company, setCompany] = useState(initial.company);
  const [phone, setPhone] = useState(initial.phone);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(avatarUrl);
  const [isUploading, setIsUploading] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al subir la foto");
      setAvatarSrc(URL.createObjectURL(file));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setIsUploading(false);
    }
  }
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          profession_type: professionType.trim(),
          company: company.trim(),
          phone: phone.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo guardar el perfil");
      }
      setSaved(true);
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil");
    } finally {
      setIsSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50";
  const labelClass = "mb-1.5 block text-sm font-medium text-slate-300";

  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || email.slice(0, 2).toUpperCase();

  const displayName = fullName.trim() || email.split("@")[0];

  if (mode === "view") {
    return (
      <div className="mt-6">
        {/* Avatar + identidad */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="relative block h-20 w-20 shrink-0 cursor-pointer" title="Cambiar foto de perfil">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="Foto de perfil" className="h-20 w-20 rounded-2xl object-cover ring-1 ring-blue-400/30" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-2xl font-bold text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/30">
                {initials}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] text-white shadow">
              {isUploading ? "…" : "📷"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={isUploading} />
          </label>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-white">{displayName}</h2>
            {professionType && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                🛠️ {professionType}
              </span>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Miembro ObraHub desde {new Date(memberSince).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setSaved(false); setMode("edit"); }}
            className="ml-auto rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-blue-500/30 hover:bg-blue-500/10"
          >
            ✏️ Editar perfil
          </button>
        </div>

        {/* Datos */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoCard icon="📧" label="Correo" value={email} />
          <InfoCard icon="🏢" label="Empresa / Compañía" value={company.trim() || "—"} />
          <InfoCard icon="📞" label="Teléfono" value={phone.trim() || "—"} />
          <InfoCard icon="🪪" label="Profesión" value={professionType || "Sin definir"} />
        </div>

        {saved && (
          <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-400">
            ✓ Perfil guardado correctamente.
          </p>
        )}

        <p className="mt-6 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          💡 Un perfil completo fortalece tu red profesional en el ecosistema ObraHub: las constructoras
          podrán validar tu experiencia para contrataciones y proyectos futuros.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div>
        <label htmlFor="full_name" className={labelClass}>Nombre completo</label>
        <input id="full_name" type="text" autoComplete="name" value={fullName}
          onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Diego Pineda"
          disabled={isSaving} className={inputClass} />
      </div>
      <div>
        <label htmlFor="profession_type" className={labelClass}>Profesión</label>
        <select id="profession_type" value={professionType} onChange={(e) => setProfessionType(e.target.value)}
          disabled={isSaving} className={`${inputClass} cursor-pointer`}>
          <option value="">Selecciona tu profesión</option>
          {professions.map((p) => <option key={p} value={p} className="bg-[#050b14]">{p}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="company" className={labelClass}>Empresa / Compañía</label>
        <input id="company" type="text" autoComplete="organization" value={company}
          onChange={(e) => setCompany(e.target.value)} placeholder="Ej. Constructora Andina S.A.S."
          disabled={isSaving} className={inputClass} />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>Teléfono</label>
        <input id="phone" type="tel" autoComplete="tel" value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="Ej. +57 300 123 4567"
          disabled={isSaving} className={inputClass} />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-3">
        {hasProfile && (
          <button type="button" onClick={() => setMode("view")} disabled={isSaving}
            className="flex-1 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isSaving}
          className="flex-1 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
          {isSaving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function InfoCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{icon} {label}</p>
      <p className="mt-1 truncate text-sm text-slate-200" title={value}>{value}</p>
    </div>
  );
}
