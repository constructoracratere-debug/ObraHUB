"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 👁️ Interventor IA — chat multimodal continuo.
 * Foto (cámara/galería) + nota de voz + texto → GPT-4o vision.
 * Conversación real: el historial (con la última foto) viaja en cada
 * turno para poder profundizar sin repetir la consulta inicial.
 */

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string; // data URL (miniatura) para turnos con foto
  audioText?: string; // transcripción de nota de voz
};

/** Reduce la imagen a máx 1024px / jpeg 0.8 para mandarla en el historial sin pesar. */
async function shrinkToDataUrl(file: File, maxDim = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = no;
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FOLLOW_UPS = [
  "⚖️ ¿Qué norma exacta aplica?",
  "🔧 ¿Cómo lo corrijo paso a paso?",
  "📐 ¿Qué materiales y cantidades necesito?",
  "🧪 ¿Cómo verifico que quedó bien?",
];

export function VisualConsultant({ projectSlug }: { projectSlug?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoThumb, setPhotoThumb] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ancla el scroll al final cuando llegan mensajes nuevos (sin saltos de página).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

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

  async function handlePhoto(f: File | null) {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setError("La foto debe pesar menos de 12 MB");
      return;
    }
    setPhoto(f);
    setPhotoThumb(await shrinkToDataUrl(f));
    setError(null);
  }

  async function send(text: string) {
    const question = text.trim();
    if ((!photo && !question && !audioBlob) || busy) return;
    setBusy(true);
    setError(null);

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      text: question,
      imageUrl: photoThumb ?? undefined,
    };
    const history = [...messages, userMsg].slice(-9);

    setMessages((m) => [...m, userMsg]);
    setInput("");
    const sentPhoto = photo;
    const sentAudio = audioBlob;
    setPhoto(null);
    setPhotoThumb(null);
    setAudioBlob(null);

    try {
      const fd = new FormData();
      if (sentPhoto) fd.append("image", sentPhoto);
      if (sentAudio) fd.append("audio", new File([sentAudio], "note.webm", { type: "audio/webm" }));
      fd.append("text", question);
      fd.append(
        "history",
        JSON.stringify(
          history.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.audioText ? `${m.text}\n[Nota de voz]: ${m.audioText}` : m.text,
            imageUrl: m.imageUrl ?? undefined,
          })),
        ),
      );
      if (projectSlug) fd.append("projectSlug", projectSlug);

      const res = await fetch("/api/consult", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al analizar");

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.answer ?? "",
        },
      ]);
      // Adjunta la transcripción de la nota de voz al turno del usuario.
      if (data.transcript) {
        setMessages((m) => m.map((x) => (x.id === userMsg.id ? { ...x, audioText: data.transcript } : x)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar");
      // Devuelve la foto/audio para que el usuario no pierda nada.
      setPhoto(sentPhoto);
      setPhotoThumb(photoThumb);
      if (sentAudio) setAudioBlob(sentAudio);
    } finally {
      setBusy(false);
    }
  }

  const hasContent = !!photo || !!input.trim() || !!audioBlob;
  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      {/* Header */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-2xl ring-1 ring-cyan-500/25">
            👁️
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Interventor IA</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Foto + voz + texto en una sola conversación. Tras el primer análisis puedes seguir
              profundizando — la foto queda en contexto y cada respuesta recuerda la anterior.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition hover:text-white"
            >
              ✕ Nueva
            </button>
          )}
        </div>
      </div>

      {/* Hilo de conversación — scroll propio, sin mover la página */}
      <div
        ref={threadRef}
        className="mt-4 flex max-h-[62vh] min-h-[280px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
      >
        {empty && (
          <div className="my-auto text-center">
            <p className="text-3xl">🏗️</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Sube una foto de obra (o graba una nota de voz / escribe tu duda) y pregunta lo que
              quieras. Después del análisis puedes seguir conversando: <b className="text-slate-200">¿qué norma aplica?, ¿cómo lo corrijo?, ¿qué materiales necesito?</b>
            </p>
            <p className="mt-3 text-[11px] text-slate-600">
              💡 Acércate al elemento (1–2 m), incluye una referencia de escala (flexómetro, moneda, ladrillo).
            </p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] space-y-2">
                {m.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.imageUrl}
                    alt="Foto enviada"
                    className="ml-auto max-h-44 rounded-xl border border-cyan-500/20 object-cover"
                  />
                )}
                {(m.text || m.audioText) && (
                  <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-600 to-cyan-700 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-cyan-950/30">
                    {m.audioText && (
                      <p className="mb-1 border-b border-white/20 pb-1 text-[11px] italic text-cyan-100">
                        🎤 {m.audioText}
                      </p>
                    )}
                    {m.text}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-sm shadow-md shadow-cyan-950/40">
                👁️
              </div>
              <div
                className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/[0.08] bg-[#0a1120]/90 px-4 py-3 text-sm leading-relaxed text-slate-300 [&_b]:text-white [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-cyan-300 [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-slate-200 [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-white"
                dangerouslySetInnerHTML={{
                  __html: m.text
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/^### (.*?)$/gm, "<h3>$1</h3>")
                    .replace(/^## (.*?)$/gm, "<h2>$1</h2>")
                    .replace(/\n/g, "<br/>"),
                }}
              />
            </div>
          ),
        )}

        {busy && (
          <div className="flex gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-sm animate-pulse">
              👁️
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-white/[0.08] bg-[#0a1120]/90 px-4 py-3 text-sm text-slate-400">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
              </span>
              {photo ? "Analizando la foto…" : audioBlob || messages.at(-1)?.role === "user" ? "Pensando…" : "Consultando…"}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Chips de seguimiento — seguir investigando a fondo */}
      {!empty && !busy && messages.at(-1)?.role === "assistant" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {FOLLOW_UPS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => void send(f)}
              className="rounded-full border border-cyan-500/25 bg-cyan-500/[0.06] px-3 py-1.5 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/15"
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      {/* Adjuntos pendientes */}
      {(photoThumb || audioBlob) && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
          {photoThumb && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoThumb} alt="" className="h-14 w-14 rounded-lg border border-cyan-500/20 object-cover" />
              <button
                type="button"
                onClick={() => { setPhoto(null); setPhotoThumb(null); }}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white shadow"
              >
                ✕
              </button>
            </div>
          )}
          {audioBlob && (
            <div className="flex items-center gap-2 rounded-lg bg-teal-500/10 px-3 py-2 text-xs text-teal-200">
              🎤 Nota de voz lista ({Math.round(audioBlob.size / 1024)} KB)
              <button type="button" onClick={() => setAudioBlob(null)} className="font-bold text-red-400">✕</button>
            </div>
          )}
        </div>
      )}

      {/* Composer fijo abajo del panel */}
      <div className="sticky bottom-0 mt-3 rounded-2xl border border-white/[0.08] bg-[#070d18]/95 p-2.5 backdrop-blur">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            title="Tomar foto"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] text-lg transition hover:bg-cyan-500/20"
          >
            📷
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            title="Desde galería"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-lg transition hover:bg-white/10"
          >
            🖼️
          </button>
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording() : void startRecording())}
            title="Nota de voz"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg transition ${
              isRecording
                ? "animate-pulse border-red-500/50 bg-red-500/15"
                : "border-white/10 bg-white/[0.03] hover:bg-white/10"
            }`}
          >
            {isRecording ? "⏹️" : "🎤"}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={isRecording ? "Grabando… presiona ⏹️ para terminar" : "Pregunta (funciona con 1 palabra: curado, pañete, bahareque…)"}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-white/[0.08] bg-[#050b14] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={busy || (!hasContent && !isRecording)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-700 px-4 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:from-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : "Enviar ➤"}
          </button>
        </div>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)} />
    </div>
  );
}
