"use client";

/**
 * DWG (AutoCAD) viewer — parses DWG in-browser via libredwg (WASM),
 * converts to DwgDatabase → SVG, and renders it with REAL viewBox
 * zoom/pan (like a CAD viewport):
 *   - wheel zoom anchored at the cursor position
 *   - drag to pan
 *   - double-click to zoom in
 *   - fit / +/- controls for touch
 *
 * The libredwg WASM is ~9.5MB, loaded dynamically with ssr:false only
 * when a .dwg file is opened.
 */

import { useEffect, useRef, useState, useCallback } from "react";

type DwgPreviewProps = {
  /** Signed URL to the .dwg file in Supabase Storage. */
  url: string;
  /** Filename for display. */
  filename: string;
};

type ConvertState = "downloading" | "loading-wasm" | "parsing" | "rendering" | "ready" | "error";

/** A viewBox {x, y, w, h} in SVG user units (drawing coordinates). */
type View = { x: number; y: number; w: number; h: number };

const FIT_MARGIN = 1.06; // 3% padding on each side when fitting

/** High-visibility CAD crosshair cursor (blue with white outline + red center). */
const CROSSHAIR_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<g stroke="#ffffff" stroke-width="5" stroke-linecap="round">' +
    '<line x1="16" y1="2" x2="16" y2="30"/><line x1="2" y1="16" x2="30" y2="16"/>' +
    "</g>" +
    '<g stroke="#1e3a8a" stroke-width="2" stroke-linecap="round">' +
    '<line x1="16" y1="2" x2="16" y2="30"/><line x1="2" y1="16" x2="30" y2="16"/>' +
    "</g>" +
    '<circle cx="16" cy="16" r="2.5" fill="#ef4444" stroke="#ffffff" stroke-width="1"/>' +
    "</svg>";
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 16 16, crosshair`;
})();

export function DwgPreview({ url, filename }: DwgPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null); // interactive container (wheel/pan)
  const svgHostRef = useRef<HTMLDivElement>(null); // where the <svg> is injected

  const [state, setState] = useState<ConvertState>("downloading");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Descargando plano DWG…");
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [dwgVersion, setDwgVersion] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null); // current viewBox
  const boundsRef = useRef<View | null>(null); // full drawing bounds
  const svgElRef = useRef<SVGSVGElement | null>(null);

  // Pan state (refs — no re-render per mousemove)
  const panning = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const viewRef = useRef<View | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);

  const parseViewBox = useCallback((svg: string): View | null => {
    const m = svg.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
    if (!m) return null;
    const v = { x: parseFloat(m[1]), y: parseFloat(m[2]), w: parseFloat(m[3]), h: parseFloat(m[4]) };
    return v.w > 0 && v.h > 0 ? v : null;
  }, []);

  // -------------------------------------------------------------------
  // 1) Convert DWG → SVG (same pipeline as before)
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState("downloading");
        setProgress(10);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error HTTP ${res.status} al descargar`);
        const dwgBuffer = await res.arrayBuffer();
        if (cancelled) return;
        setProgress(20);

        setState("loading-wasm");
        setProgressLabel("Cargando motor CAD (WASM)…");
        const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
        const libredwg = await LibreDwg.create("/wasm");
        if (cancelled) return;
        setProgress(45);

        setState("parsing");
        setProgressLabel("Analizando archivo DWG…");
        const dataPtr = libredwg.dwg_read_data(dwgBuffer, Dwg_File_Type.DWG);
        if (cancelled) return;
        if (dataPtr == null) throw new Error("No se pudo leer el archivo DWG. Verifica que sea un DWG válido.");
        setProgress(60);

        try {
          const ver = libredwg.dwg_get_version_type(dataPtr);
          setDwgVersion(ver?.hdr ?? ver?.type ?? null);
        } catch { /* optional */ }

        setProgressLabel("Procesando entidades…");
        const { database } = libredwg.convertEx(dataPtr);
        if (cancelled) return;
        setProgress(75);
        try { libredwg.dwg_free(dataPtr); } catch { /* best effort */ }

        setState("rendering");
        setProgressLabel("Generando visualización…");
        const svg = libredwg.dwg_to_svg(database);
        if (cancelled) return;
        if (!svg || svg.trim().length === 0) throw new Error("El plano no contiene entidades renderizables.");

        const vb = parseViewBox(svg);
        if (!vb) throw new Error("No se pudieron calcular los límites del plano.");

        boundsRef.current = vb;
        setSvgContent(svg);
        setView(fitOf(vb));
        setProgress(100);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("DWG load error:", err);
        setError(err instanceof Error ? err.message : "Error al cargar el plano DWG");
        setState("error");
      }
    }

    function fitOf(v: View): View {
      const w = v.w * FIT_MARGIN;
      const h = v.h * FIT_MARGIN;
      return { x: v.x - (w - v.w) / 2, y: v.y - (h - v.h) / 2, w, h };
    }

    load();
    return () => { cancelled = true; };
  }, [url, parseViewBox]);

  // -------------------------------------------------------------------
  // 2) Inject the SVG and force it to fill the container
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!svgContent || !svgHostRef.current) return;
    svgHostRef.current.innerHTML = svgContent;
    const svgEl = svgHostRef.current.querySelector("svg");
    if (!svgEl) return;
    svgElRef.current = svgEl;
    svgEl.setAttribute("width", "100%");
    svgEl.setAttribute("height", "100%");

    // ── Beautify: recolor for dark background with AutoCAD layer palette ──
    const LAYER_COLORS = [
      "#00ffff", // cyan (layer 1)
      "#ff00ff", // magenta (layer 2)
      "#00ff00", // green (layer 3)
      "#ff0000", // red (layer 4)
      "#0000ff", // blue (layer 5)
      "#ffff00", // yellow (layer 6)
      "#ff8c00", // orange (layer 7)
      "#ffffff", // white (layer 8)
    ];
    const strokes = svgEl.querySelectorAll("[stroke]");
    strokes.forEach((el, i) => {
      const cur = el.getAttribute("stroke") ?? "";
      if (cur === "none") return;
      if (cur === "black" || cur === "#000000" || cur === "#000" || cur === "rgb(0,0,0)") {
        el.setAttribute("stroke", LAYER_COLORS[i % LAYER_COLORS.length]);
      }
      // Line weights: give structural elements thicker strokes
      const tag = el.tagName?.toLowerCase() ?? "";
      if (tag === "line" || tag === "polyline" || tag === "path") {
        const curW = parseFloat(el.getAttribute("stroke-width") ?? "1");
        if (Number.isNaN(curW) || curW < 0.5) {
          el.setAttribute("stroke-width", "0.8");
        }
      }
    });
    // Fill elements: white → light
    const fills = svgEl.querySelectorAll("[fill]");
    fills.forEach((el) => {
      const cur = el.getAttribute("fill") ?? "";
      if (cur === "black" || cur === "#000000" || cur === "#000") {
        el.setAttribute("fill", "rgba(255,255,255,0.9)");
      }
    });
    // Text: light gray
    const texts = svgEl.querySelectorAll("text, tspan");
    texts.forEach((el) => {
      el.setAttribute("fill", "#e2e8f0");
      el.setAttribute("stroke", "none");
    });
    // Add subtle glow filter for visibility on dark
    const defs = svgEl.querySelector("defs") ?? svgEl.ownerDocument?.createElementNS("http://www.w3.org/2000/svg", "defs");
    if (defs && !defs.querySelector("#obrapp-cad-glow")) {
      defs.id = "obrapp-cad-defs";
      defs.innerHTML = `<filter id="obrapp-cad-glow" x="-5%" y="-5%" width="110%" height="110%">
        <feGaussianBlur stdDeviation="0.3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
      svgEl.insertBefore(defs, svgEl.firstChild);
    }
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svgEl.style.display = "block";
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
  }, [svgContent]);

  // Apply the current view to the actual <svg> viewBox attribute.
  useEffect(() => {
    if (view && svgElRef.current) {
      svgElRef.current.setAttribute(
        "viewBox",
        `${view.x} ${view.y} ${view.w} ${view.h}`,
      );
    }
  }, [view, svgContent]);

  // -------------------------------------------------------------------
  // 3) Zoom/pan interactions (non-passive wheel + pointer drag)
  // -------------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || state !== "ready") return;

    /** Zoom by `factor` keeping the view point under clientX/Y fixed. */
    const zoomAt = (clientX: number, clientY: number, factor: number) => {
      const v = viewRef.current;
      const b = boundsRef.current;
      if (!v || !b) return;
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      let s = 1 / factor; // factor>1 zooms in → smaller view span
      // Clamp deep/outer zoom relative to the full drawing span.
      const newW = v.w * s;
      if (newW < b.w * 1e-5) s = (b.w * 1e-5) / v.w;
      if (newW > b.w * 20) s = (b.w * 20) / v.w;
      const w2 = v.w * s;
      const h2 = v.h * s;
      const vx = v.x + px * v.w;
      const vy = v.y + py * v.h;
      setView({ x: vx - px * w2, y: vy - py * h2, w: w2, h: h2 });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8);
    };

    const onPointerDown = (e: PointerEvent) => {
      panning.current = true;
      lastPt.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "move";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!panning.current) return;
      const v = viewRef.current;
      if (!v) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - lastPt.current.x;
      const dy = e.clientY - lastPt.current.y;
      lastPt.current = { x: e.clientX, y: e.clientY };
      const ux = (dx / rect.width) * v.w;
      const uy = (dy / rect.height) * v.h;
      setView((prev) => (prev ? { ...prev, x: prev.x - ux, y: prev.y - uy } : prev));
    };
    const onPointerUp = (e: PointerEvent) => {
      panning.current = false;
      el.style.cursor = CROSSHAIR_CURSOR;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, 2);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("dblclick", onDblClick);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [state]);

  const zoomBtn = (factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Zoom centered on the middle of the viewport.
    const fake = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const v = viewRef.current;
    const b = boundsRef.current;
    if (!v || !b) return;
    let s = 1 / factor;
    const newW = v.w * s;
    if (newW < b.w * 1e-5) s = (b.w * 1e-5) / v.w;
    if (newW > b.w * 20) s = (b.w * 20) / v.w;
    const w2 = v.w * s;
    const h2 = v.h * s;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h / 2;
    setView({ x: cx - w2 / 2, y: cy - h2 / 2, w: w2, h: h2 });
    void fake; // center-based, no cursor needed
  };

  const fit = () => {
    const b = boundsRef.current;
    if (b) {
      const w = b.w * FIT_MARGIN;
      const h = b.h * FIT_MARGIN;
      setView({ x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h });
    }
  };

  const zoomPct =
    view && boundsRef.current
      ? Math.round((boundsRef.current.w / view.w) * 100)
      : 100;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a1120]">
      {/* Toolbar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fit}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🎯 Ajustar
        </button>
        <button
          type="button"
          onClick={() => zoomBtn(1.3)}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🔍+
        </button>
        <button
          type="button"
          onClick={() => zoomBtn(1 / 1.3)}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🔍−
        </button>
        <span className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs text-slate-400 backdrop-blur">
          📐 {filename}
          {dwgVersion && ` · ${dwgVersion}`}
          {state === "ready" && ` · ${zoomPct}%`}
        </span>
      </div>

      {/* Hint */}
      {state === "ready" && (
        <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-[#0a1120]/80 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur">
          Rueda: zoom en el cursor · Arrastrar: mover · Doble clic: acercar
        </span>
      )}

      {/* CAD viewport — dark AutoCAD style with grid */}
      {state === "ready" && (
        <div
          ref={wrapRef}
          className="absolute inset-0"
          style={{
            cursor: CROSSHAIR_CURSOR,
            background: "#1a1a2e",
            backgroundImage:
              "linear-gradient(rgba(90,100,140,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(90,100,140,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        >
          <div ref={svgHostRef} className="h-full w-full" />
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
                <li>• Exportar como <strong>DXF</strong> desde AutoCAD y subir el .dxf (se renderiza con capas y controles)</li>
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
