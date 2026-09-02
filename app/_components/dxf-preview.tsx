"use client";

/**
 * DXF (AutoCAD) viewer using dxf-viewer + three.js WebGL.
 *
 * Renderiza planos DXF en el navegador con TRES modos de vista:
 *  - 🖨️ Plano: blueprint profesional — líneas claras, rellenos oscuros translúcidos
 *    (ignora los colores verdes/ chillones de las capas del archivo CAD).
 *  - 🔲 Alambre: wireframe/frame view clásico de CAD (wireframeMesh) para
 *    identificar elementos estructurales rápido.
 *  - 🎨 Colores CAD: respeta los colores originales de capa del archivo.
 */

import { useEffect, useRef, useState } from "react";

type DxfPreviewProps = {
  /** Signed URL to the .dxf file in Supabase Storage. */
  url: string;
  /** Filename for display. */
  filename: string;
};

type LoadState = "loading" | "ready" | "error";
type ViewMode = "plano" | "alambre" | "capas";

const MODES: Array<{ id: ViewMode; label: string; title: string }> = [
  { id: "plano", label: "🖨️ Plano", title: "Blueprint profesional: líneas claras, rellenos translúcidos" },
  { id: "alambre", label: "🔲 Alambre", title: "Vista en alambre (frame) para identificar elementos rápido" },
  { id: "capas", label: "🎨 Colores CAD", title: "Colores originales de las capas del archivo" },
];

/**
 * Repinta la escena con una paleta profesional según el TIPO de geometría
 * (no por los colores de capa del archivo, que suelen ser verdes de AutoCAD):
 *  - Líneas/puntos → acero claro #D7E1EE
 *  - Mallas (rellenos, caras 3D, hatch) → azul pizarra translúcido
 *  - En modo alambre todo → azul cielo CAD, con wireframe activo.
 */
function applyPalette(viewer: any, mode: ViewMode) {
  if (mode === "capas") return;
  const scene = viewer.GetScene?.();
  if (!scene?.traverse) return;
  const LINE = 0xd7e1ee; // acero claro
  const WIRE = 0x8fb8de; // azul cielo CAD
  const FILL = 0x2e3d57; // azul pizarra
  scene.traverse((obj: any) => {
    const mats: any[] = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];
    for (const m of mats) {
      if (!m?.color?.setHex) continue;
      // El color de vértice (color de capa horneado) dominaría el material.
      try {
        if (m.vertexColors) {
          m.vertexColors = false;
          m.needsUpdate = true;
        }
      } catch {
        /* ignore */
      }
      if (mode === "alambre") {
        m.color.setHex(WIRE);
        if ("wireframe" in m) m.wireframe = true;
        continue;
      }
      if (obj.isMesh) {
        m.color.setHex(FILL);
        m.transparent = true;
        m.opacity = 0.55;
        m.depthWrite = false;
      } else {
        m.color.setHex(LINE);
      }
    }
  });
  try {
    viewer.Render();
  } catch {
    /* ignore */
  }
}

export function DxfPreview({ url, filename }: DxfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [mode, setMode] = useState<ViewMode>("plano");
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Array<{ name: string; color: number; visible: boolean }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      try {
        // Dynamic import so the heavy three.js + dxf-viewer bundle only loads
        // when a DXF file is actually opened.
        const { DxfViewer } = await import("dxf-viewer");
        const { Color } = await import("three");
        if (cancelled || !containerRef.current) return;

        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true,
          // dxf-viewer ≥1.0.x requiere un THREE.Color (llama .getHex()).
          clearColor: new Color(0.04, 0.07, 0.12), // #0a1120
          clearAlpha: 1,
          antialias: true,
          colorCorrection: true,
          blackWhiteInversion: true,
          pointSize: 3,
          sceneOptions: {
            arcTessellationAngle: Math.PI / 16,
            // Frame view: la librería renderiza hasta las mallas como aristas.
            wireframeMesh: mode === "alambre",
          },
        });
        viewerRef.current = viewer;

        await viewer.Load({
          url,
          fonts: null,
          progressCbk: (phase: string, processed: number, total: number) => {
            if (cancelled) return;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            setProgress(pct);
            const phaseLabels: Record<string, string> = {
              fetch: "Descargando plano…",
              parse: "Analizando entidades…",
              prepare: "Preparando geometría…",
              font: "Cargando fuentes…",
            };
            setProgressPhase(phaseLabels[phase] ?? phase);
          },
        });

        if (cancelled) return;

        // Paleta profesional (no los verdes del archivo CAD).
        applyPalette(viewer, mode);

        // Get layers for the layer panel.
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

        // Fit the view to the drawing bounds.
        try {
          const bounds = viewer.GetBounds();
          if (bounds) {
            viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.1);
          }
        } catch {
          /* fit optional */
        }

        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("DXF load error:", err);
        setError(err instanceof Error ? err.message : "Error al cargar el plano DXF");
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
  }, [url, mode]);

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
      if (bounds) {
        viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.1);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative h-full w-full bg-[#0a1120]">
      {/* The dxf-viewer canvas container.
          ⚠️ h-full en vez de absolute inset-0: la librería cambia el position
          del contenedor a "relative" (estático en flujo) — con inset-0 la
          altura colapsaba a 0px y el canvas nunca se dimensionaba. */}
      <div ref={containerRef} className="h-full w-full cursor-crosshair" />

      {/* Top toolbar: fit + filename */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={fitToView}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🎯 Ajustar vista
        </button>
        <span className="hidden rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs text-slate-400 backdrop-blur sm:inline">
          📐 {filename}
        </span>
      </div>

      {/* View mode selector */}
      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0a1120]/85 p-1 backdrop-blur">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.title}
            onClick={() => setMode(m.id)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
              mode === m.id
                ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            }`}
          >
            {m.label}
          </button>
        ))}
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

      {/* Loading overlay (initial load and mode switches) */}
      {state === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1120]/90 backdrop-blur">
          <div className="w-80 max-w-[90%] text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl">
              📐
            </div>
            <p className="text-sm font-medium text-white">{progressPhase || "Cargando plano…"}</p>
            <div className="mx-auto mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{progress}%</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1120]/90 backdrop-blur">
          <div className="max-w-md px-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-2xl">
              ⚠️
            </div>
            <p className="text-sm font-medium text-white">No se pudo cargar el plano DXF</p>
            <p className="mt-1 text-xs text-slate-400">{error}</p>
            <p className="mt-3 text-[11px] text-slate-600">
              Algunos archivos DXF generados por versiones antiguas de AutoCAD o CAD específicos
              pueden no ser compatibles. Intenta exportarlo como DXF versión ASCII 2010 o superior.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
