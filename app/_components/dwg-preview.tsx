"use client";

/**
 * DWG (AutoCAD) viewer — parses DWG in-browser via libredwg (WASM),
 * converts to DwgDatabase, then generates SVG for rendering.
 *
 * The libredwg WASM is ~9.5MB so this component is loaded dynamically with
 * ssr:false only when a .dwg file is opened.
 */

import { useEffect, useRef, useState } from "react";

type DwgPreviewProps = {
  /** Signed URL to the .dwg file in Supabase Storage. */
  url: string;
  /** Filename for display. */
  filename: string;
};

type ConvertState = "downloading" | "loading-wasm" | "parsing" | "rendering" | "ready" | "error";

export function DwgPreview({ url, filename }: DwgPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ConvertState>("downloading");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Descargando plano DWG…");
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [dwgVersion, setDwgVersion] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Step 1: Download the DWG file.
        setState("downloading");
        setProgress(10);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error HTTP ${res.status} al descargar`);
        const dwgBuffer = await res.arrayBuffer();
        if (cancelled) return;
        setProgress(20);

        // Step 2: Load libredwg WASM.
        setState("loading-wasm");
        setProgressLabel("Cargando motor CAD (WASM)…");
        const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
        const libredwg = await LibreDwg.create("/wasm");
        if (cancelled) return;
        setProgress(45);

        // Step 3: Read the DWG file into libredwg data structure.
        setState("parsing");
        setProgressLabel("Analizando archivo DWG…");
        const dataPtr = libredwg.dwg_read_data(dwgBuffer, Dwg_File_Type.DWG);
        if (cancelled) return;
        if (dataPtr == null) {
          throw new Error("No se pudo leer el archivo DWG. Verifica que sea un DWG válido.");
        }
        setProgress(60);

        // Get version info for display.
        try {
          const ver = libredwg.dwg_get_version_type(dataPtr);
          setDwgVersion(ver?.hdr ?? ver?.type ?? null);
        } catch {
          /* version optional */
        }

        // Step 4: Convert to DwgDatabase (structured data).
        setProgressLabel("Procesando entidades…");
        const { database } = libredwg.convertEx(dataPtr);
        if (cancelled) return;
        setProgress(75);

        // Free the raw DWG data — we have the database now.
        try {
          libredwg.dwg_free(dataPtr);
        } catch {
          /* best effort */
        }

        // Step 5: Convert database to SVG for rendering.
        setState("rendering");
        setProgressLabel("Generando visualización…");
        const svg = libredwg.dwg_to_svg(database);
        if (cancelled) return;

        if (!svg || svg.trim().length === 0) {
          throw new Error("El plano no contiene entidades renderizables.");
        }

        setSvgContent(svg);
        setProgress(100);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("DWG load error:", err);
        setError(err instanceof Error ? err.message : "Error al cargar el plano DWG");
        setState("error");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Pan handling
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });

  function handlePointerDown(e: React.PointerEvent) {
    isPanning.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPan.current.x;
    const dy = e.clientY - lastPan.current.y;
    lastPan.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  function handlePointerUp(e: React.PointerEvent) {
    isPanning.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.05, Math.min(20, z * factor)));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a1120]">
      {/* Toolbar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={resetView}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🎯 Reset
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(20, z * 1.3))}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🔍+
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.05, z * 0.7))}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🔍−
        </button>
        <span className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs text-slate-400 backdrop-blur">
          📐 {filename}
          {dwgVersion && ` · ${dwgVersion}`}
          {state === "ready" && ` · ${Math.round(zoom * 100)}%`}
        </span>
      </div>

      {/* SVG render area — white background like a real CAD viewport */}
      {state === "ready" && svgContent && (
        <div
          className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <div className="flex h-full w-full items-center justify-center bg-white p-4">
            <div
              ref={containerRef}
              className="flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isPanning.current ? "none" : "transform 0.1s ease-out",
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {state !== "ready" && state !== "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1120]/95 backdrop-blur">
          <div className="w-80 max-w-[90%] text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl">
              📐
            </div>
            <p className="text-sm font-medium text-white">{progressLabel}</p>
            <div className="mx-auto mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{progress}%</p>
            {state === "loading-wasm" && (
              <p className="mt-2 text-[10px] text-slate-600">
                Cargando motor CAD (~9.5 MB, solo la primera vez)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1120]/95 backdrop-blur">
          <div className="max-w-md px-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-2xl">
              ⚠️
            </div>
            <p className="text-sm font-medium text-white">No se pudo cargar el plano DWG</p>
            <p className="mt-1 text-xs text-slate-400">{error}</p>
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
              <p className="text-[11px] font-semibold text-amber-300">💡 Alternativas:</p>
              <ul className="mt-1.5 space-y-1 text-[11px] text-slate-400">
                <li>• Exportar como <strong>DXF</strong> desde AutoCAD y subir el .dxf (se renderiza nativamente)</li>
                <li>• Abrir en <a href="https://viewer.autodesk.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Autodesk Viewer online</a> (gratuito)</li>
                <li>• DWG de versiones muy antiguas (pre-2000) pueden no ser compatibles</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
