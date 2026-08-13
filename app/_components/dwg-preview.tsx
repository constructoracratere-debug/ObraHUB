"use client";

/**
 * DWG (AutoCAD) viewer — converts DWG to DXF in-browser via libredwg (WASM),
 * then renders the DXF using dxf-viewer + three.js.
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

type ConvertState = "downloading" | "loading-wasm" | "converting" | "rendering" | "ready" | "error";

export function DwgPreview({ url, filename }: DwgPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [state, setState] = useState<ConvertState>("downloading");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Descargando plano DWG…");
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Array<{ name: string; color: number; visible: boolean }>>([]);

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
        setProgress(25);

        // Step 2: Load libredwg WASM.
        setState("loading-wasm");
        setProgressLabel("Cargando motor CAD (WASM)…");
        const { LibreDwg } = await import("@mlightcad/libredwg-web");
        const libredwg = await LibreDwg.create("/wasm");
        if (cancelled) return;
        setProgress(50);

        // Step 3: Convert DWG → DXF in memory.
        setState("converting");
        setProgressLabel("Convirtiendo DWG a DXF…");
        const dxfBytes = libredwg.dwg_write_dxf(dwgBuffer);
        if (cancelled) return;

        if (!dxfBytes || dxfBytes.length === 0) {
          throw new Error("No se pudo convertir el archivo DWG. Puede ser una versión no soportada.");
        }
        setProgress(65);

        // Create a Blob URL from the DXF bytes for dxf-viewer.
        const dxfBlob = new Blob([dxfBytes as BlobPart], { type: "application/dxf" });
        const dxfUrl = URL.createObjectURL(dxfBlob);

        // Step 4: Render the DXF with dxf-viewer.
        setState("rendering");
        setProgressLabel("Renderizando plano…");
        const { DxfViewer } = await import("dxf-viewer");
        if (cancelled || !containerRef.current) {
          URL.revokeObjectURL(dxfUrl);
          return;
        }

        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true,
          clearColor: { r: 0.04, g: 0.07, b: 0.12 },
          clearAlpha: 1,
          antialias: true,
          colorCorrection: true,
          blackWhiteInversion: true,
          pointSize: 3,
          sceneOptions: { arcTessellationAngle: Math.PI / 16 },
        });
        viewerRef.current = viewer;

        await viewer.Load({
          url: dxfUrl,
          fonts: null,
          progressCbk: (_phase: string, processed: number, total: number) => {
            if (cancelled) return;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            setProgress(65 + Math.round(pct * 0.3));
          },
        });

        // Clean up the blob URL — dxf-viewer has its own copy now.
        URL.revokeObjectURL(dxfUrl);

        if (cancelled) return;

        // Get layers.
        try {
          const layerList = Array.from(viewer.GetLayers() as Iterable<any>);
          setLayers(
            layerList.map((l: any) => ({
              name: l.displayName ?? l.name,
              color: l.color,
              visible: true,
            })),
          );
        } catch {
          /* layers optional */
        }

        // Fit view.
        try {
          const bounds = viewer.GetBounds();
          if (bounds) {
            viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.1);
          }
        } catch {
          /* fit optional */
        }

        setState("ready");
        setProgress(100);
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
      if (viewerRef.current) {
        try {
          viewerRef.current.Destroy();
        } catch {
          /* ignore */
        }
        viewerRef.current = null;
      }
    };
  }, [url]);

  function toggleLayer(name: string) {
    const layer = layers.find((l) => l.name === name);
    if (!layer || !viewerRef.current) return;
    const newVisible = !layer.visible;
    try {
      viewerRef.current.ShowLayer(name, newVisible);
    } catch {
      /* ignore */
    }
    setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible: newVisible } : l)));
  }

  function fitToView() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      const bounds = viewer.GetBounds();
      if (bounds) viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.1);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative h-full w-full bg-[#0a1120]">
      {/* Canvas container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Toolbar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
        {state === "ready" && (
          <button
            type="button"
            onClick={fitToView}
            className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
          >
            🎯 Ajustar vista
          </button>
        )}
        <span className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs text-slate-400 backdrop-blur">
          📐 {filename}
        </span>
      </div>

      {/* Layers panel */}
      {state === "ready" && layers.length > 0 && (
        <div className="absolute right-3 top-3 z-10 max-h-[60vh] w-56 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a1120]/95 p-3 backdrop-blur-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Capas ({layers.length})
          </p>
          <div className="space-y-0.5">
            {layers.map((layer) => (
              <button
                key={layer.name}
                type="button"
                onClick={() => toggleLayer(layer.name)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition hover:bg-white/[0.04]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/20"
                  style={{
                    backgroundColor: layer.visible
                      ? `#${layer.color.toString(16).padStart(6, "0")}`
                      : "transparent",
                  }}
                />
                <span className={layer.visible ? "truncate text-slate-300" : "truncate text-slate-600 line-through"}>
                  {layer.name}
                </span>
              </button>
            ))}
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
            <p className="mt-3 text-[11px] text-slate-600">
              Algunos archivos DWG de versiones muy antiguas (anteriores a AutoCAD 2000) o con
              entidades complejas pueden no ser compatibles. Intenta exportarlo como DXF desde
              AutoCAD y subir el archivo .dxf.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
