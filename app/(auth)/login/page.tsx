"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: value,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (otpError) {
        throw otpError;
      }

      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el enlace. Intente de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050b14] px-4 text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(37,99,235,0.18),transparent_60%)]"
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-900/50">
              OH
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Bienvenido a Obra<span className="text-blue-400">Hub</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              El asistente técnico para profesionales de la construcción en Colombia.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-5 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white">Revisa tu correo ✉️</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  Hemos enviado un enlace de acceso a
                </p>
                <p className="mt-0.5 text-sm font-medium text-blue-300">{email}</p>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  El enlace expira en breve. Si no recibes el correo en unos minutos,
                  revisa la carpeta de spam.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                Usar otro correo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  disabled={isSubmitting}
                  autoFocus
                  className="w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!email.trim() || isSubmitting}
                className="w-full rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting ? "Enviando…" : "Enviar enlace mágico"}
              </button>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Te enviaremos un enlace para iniciar sesión sin contraseña.
                Al continuar aceptas los términos del servicio.
              </p>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          ObraHub · Asistente NSR-10 para Colombia
        </p>
      </div>
    </div>
  );
}
