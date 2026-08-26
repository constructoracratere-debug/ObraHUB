"use client";

import { useRef, useState } from "react";

/**
 * 👁️ Consultor Visual — the multimodal site expert.
 * Photo (camera on mobile) + optional question → master-constructor
 * analysis: technique, visual measurements, verdict, NSR-10 citations,
 * corrections. For pros and first-time builders alike.
 */

type Consultation = {
  id: string;
  imageUrl: string;
  question: string;
  answer: string;
  at: Date;
};

export function VisualConsultant({ projectSlug }: { projectSlug?: string }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Consultation[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      setError("No se pudo acceder al micrófono");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  function handlePhoto(f: File | null) {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setError("La foto debe pesar menos de 12 MB");
      return;
    }
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function handleConsult() {
    if ((!photo && !question.trim() && !audioBlob) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      if (photo) fd.append("image", photo);
      if (audioBlob) fd.append("audio", new File([audioBlob], "note.webm", { type: "audio/webm" }));
      fd.append("text", question.trim());
      const res = await fetch("/api/consult", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al analizar");
      setHistory((h) => [
        { id: crypto.randomUUID(), imageUrl: preview ?? "", question: question.trim(), answer: data.answer, at: new Date() },
        ...h,
      ]);
      setPhoto(null);
      setPreview(null);
      setQuestion("");
      setAudioBlob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar la foto");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/[0.08] bg-[#050b14] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
      {/* Header */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-2xl ring-1 ring-cyan-500/25">
            👁️
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white">Consultor Visual de Obra</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-400">
              Tómale una foto a cualquier elemento de construcción y el interventor AI te dice: qué técnica es,
              si está bien hecha, qué normativa aplica y qué corregir. Ideal para resolver dudas en el momento —
              seas maestro de obra o estés en tu primera obra.
            </p>
          </div>
        </div>
      </div>

      {/* Photo capture */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-cyan-500/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Foto de obra" className="max-h-72 w-full object-contain bg-[#050b14]" />
            <button
              type="button"
              onClick={() => { setPhoto(null); setPreview(null); }}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white backdrop-blur transition hover:bg-black/80"
            >
              ✕ Quitar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cyan-500/25 bg-cyan-500/[0.04] px-4 py-8 transition hover:border-cyan-500/40 hover:bg-cyan-500/[0.08]"
            >
              <span className="text-3xl">📷</span>
              <span className="text-sm font-semibold text-cyan-200">Tomar foto</span>
              <span className="text-[10px] text-slate-500">Abre la cámara</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 transition hover:border-cyan-500/30"
            >
              <span className="text-3xl">🖼️</span>
              <span className="text-sm font-semibold text-slate-300">Desde galería</span>
              <span className="text-[10px] text-slate-500">Subir imagen</span>
            </button>
          </div>
        )}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
        />

        <div className="mt-4 space-y-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="Escribe tu pregunta técnica (NSR-10, materiales, procedimientos…) o sube una foto de obra"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void handleConsult()}
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:from-cyan-500 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "🔍 Analizando…" : "👁️ Consultar al interventor IA"}
            </button>
            <button
              type="button"
              onClick={() => (isRecording ? stopRecording() : void startRecording())}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-bold transition ${
                isRecording
                  ? "border-red-500/50 bg-red-500/15 text-red-300 animate-pulse"
                  : "border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-300 hover:bg-cyan-500/15"
              }`}
            >
              {isRecording ? "⏹ Detener" : "🎤 Nota de voz"}
            </button>
          </div>
        {error && <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* Results */}
      {history.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex gap-3 border-b border-white/[0.06] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.imageUrl} alt="" className="h-20 w-28 shrink-0 rounded-lg border border-white/[0.08] object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-cyan-300">
                {c.at.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              {c.question && <p className="mt-1 text-sm italic text-slate-400">"{c.question}"</p>}
            </div>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none p-4 text-sm leading-relaxed text-slate-300 [&_b]:text-white [&_h1]:hidden [&_h2]:text-cyan-300 [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-slate-200 [&_h3]:font-semibold [&_strong]:text-white"
            dangerouslySetInnerHTML={{
              __html: c.answer
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/^### (.*?)$/gm, "<h3>$1</h3>")
                .replace(/^## (.*?)$/gm, "<h2>$1</h2>")
                .replace(/\n/g, "<br/>"),
            }}
          />
        </div>
      ))}

      {history.length === 0 && !busy && (
        <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-6 text-center">
          <p className="text-sm text-slate-500">
            <span className="text-2xl">🏗️</span>
          </p>
          <p className="mt-2 text-sm text-slate-400">
            El interventor AI reconoce: muros, columnas, losas, refuerzo, formaletas, acabados, instalaciones,
            excavaciones, impermeabilización, y más — con referencia a NSR-10, RETIE, RAS y buenas prácticas.
          </p>
          <p className="mt-3 text-[11px] text-slate-600">
            💡 Consejo: acércate al elemento (1–2 m), incluye una referencia de escala si puedes (flexómetro, moneda, ladrillo)
            y captura buena luz natural.
          </p>
        </div>
      )}
    </div>
  );
}
