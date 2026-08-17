"use client";

import { useEffect, useState } from "react";

/**
 * PWA install experience: registers the service worker (installable app +
 * offline shell) and surfaces a "📲 Instalar ObraHub" floating button when
 * the browser offers the native install prompt. Hidden when already
 * installed (standalone display) or after the user dismisses it.
 */
export function PwaInstall() {
  const [prompt, setPrompt] = useState<(Event & { prompt?: () => Promise<void> }) | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    // Register the service worker once.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* optional */ });
    }
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    setDismissed(localStorage.getItem("obrapp-install-dismissed") === "1");

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser banner; we show our own button
      setPrompt(e as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed || !prompt) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await prompt.prompt?.();
        } finally {
          setPrompt(null);
        }
      }}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-blue-500/30 bg-[#0a1120]/95 px-4 py-2.5 text-xs font-semibold text-blue-200 shadow-lg shadow-blue-950/50 backdrop-blur transition hover:bg-blue-500/20"
      title="Instala ObraHub en tu dispositivo"
    >
      📲 Instalar ObraHub
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          localStorage.setItem("obrapp-install-dismissed", "1");
          setDismissed(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            localStorage.setItem("obrapp-install-dismissed", "1");
            setDismissed(true);
          }
        }}
        className="ml-1 rounded-full p-0.5 text-slate-500 hover:text-slate-300"
        aria-label="Ocultar"
      >
        ✕
      </span>
    </button>
  );
}
