"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Step 1 — request the 6-digit code. Our own API route stores the code and
  // emails it via Resend (bypassing Supabase's flaky SMTP delivery).
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo enviar el código");
      }

      setStep("code");
      setTimeout(() => codeInputRef.current?.focus(), 50);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el código. Intente de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 2 — verify the 6-digit code via our own API route, which establishes
  // the session cookie server-side.
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Código inválido");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Código inválido. Verifique e intente de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetToEmailStep() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#050b14] px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-slate-200">
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

          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
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
                  className="w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-base text-slate-200 placeholder:text-slate-600 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50 sm:text-sm"
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
                {isSubmitting ? "Enviando…" : "Enviar código"}
              </button>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Te enviaremos un código de 6 dígitos por correo para iniciar sesión.
                Al continuar aceptas los términos del servicio.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3.5 text-center">
                <p className="text-sm text-slate-300">
                  Enviamos un código a
                </p>
                <p className="mt-0.5 text-sm font-medium text-blue-300">{email}</p>
              </div>

              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Código de verificación
                </label>
                <input
                  ref={codeInputRef}
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-center text-2xl font-semibold tracking-[0.5em] text-slate-100 placeholder:tracking-[0.5em] placeholder:text-slate-700 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={code.length !== 6 || isSubmitting}
                className="w-full rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting ? "Verificando…" : "Verificar código"}
              </button>

              <button
                type="button"
                onClick={resetToEmailStep}
                disabled={isSubmitting}
                className="w-full text-center text-sm text-slate-400 transition hover:text-white"
              >
                ← Usar otro correo
              </button>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Revisa tu correo (incluida la carpeta de spam). El código expira en 10 minutos.
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
