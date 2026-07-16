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
}: {
  initial: ProfileData;
  professions: string[];
}) {
  const [fullName, setFullName] = useState(initial.full_name);
  const [professionType, setProfessionType] = useState(initial.profession_type);
  const [company, setCompany] = useState(initial.company);
  const [phone, setPhone] = useState(initial.phone);
  const [isSaving, setIsSaving] = useState(false);
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
        throw new Error(
          typeof data.error === "string" ? data.error : "No se pudo guardar el perfil",
        );
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil");
    } finally {
      setIsSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50";
  const labelClass = "mb-1.5 block text-sm font-medium text-slate-300";

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div>
        <label htmlFor="full_name" className={labelClass}>
          Nombre completo
        </label>
        <input
          id="full_name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ej. Diego Pineda"
          disabled={isSaving}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="profession_type" className={labelClass}>
          Profesión
        </label>
        <select
          id="profession_type"
          value={professionType}
          onChange={(e) => setProfessionType(e.target.value)}
          disabled={isSaving}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">Selecciona tu profesión</option>
          {professions.map((p) => (
            <option key={p} value={p} className="bg-[#050b14]">
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="company" className={labelClass}>
          Empresa / Compañía
        </label>
        <input
          id="company"
          type="text"
          autoComplete="organization"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Ej. Constructora Andina S.A.S."
          disabled={isSaving}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Teléfono
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ej. +57 300 123 4567"
          disabled={isSaving}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-400">
          Perfil guardado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="w-full rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {isSaving ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
