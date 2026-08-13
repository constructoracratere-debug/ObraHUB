"use client";

/**
 * IFC 3D viewer using web-ifc (WASM) + Three.js.
 *
 * Loaded dynamically with ssr:false from app-shell — the WASM/Three bundle is
 * heavy (~1.5 MB) and must never block login or the tool launcher.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { IfcAPI } from "web-ifc";
import {
  extractQuantities,
  buildBudgetContextFromIFC,
  buildScheduleContextFromIFC,
  classNameForTypeId,
  getTrackedTypeIds,
  type IfcQuantitySummary,
  type IfcClassGroup,
} from "@/lib/ifc-quantities";

type IfcViewerProps = {
  /** Signed URL to the .ifc file in Supabase Storage. */
  url: string;
  /** Called when the user wants to generate an APU budget from the model. */
  onGenerateBudget?: (contextPrompt: string, summary: IfcQuantitySummary) => void;
  /** Called when the user wants to generate a Gantt schedule from the model. */
  onGenerateSchedule?: (contextPrompt: string, summary: IfcQuantitySummary) => void;
};

type LoadState = "loading-wasm" | "downloading" | "parsing" | "ready" | "error";

export function IfcViewer({ url, onGenerateBudget, onGenerateSchedule }: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js refs (kept in refs so the render loop doesn't re-subscribe).
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const ifcApiRef = useRef<IfcAPI | null>(null);
  const modelIdRef = useRef<number>(-1);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const elementToMeshRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());

  // React state for UI
  const [state, setState] = useState<LoadState>("loading-wasm");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<IfcQuantitySummary | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [elementCount, setElementCount] = useState(0);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      disposeScene();
      if (modelIdRef.current >= 0 && ifcApiRef.current) {
        try {
          ifcApiRef.current.CloseModel(modelIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Main load sequence
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState("loading-wasm");
        setProgress(5);

        const ifcApi = new IfcAPI();
        // Locate the WASM file in /public/wasm (copied during build).
        await ifcApi.Init((filename: string) => `/wasm/${filename}`);
        if (cancelled) return;
        ifcApiRef.current = ifcApi;
        setProgress(15);

        // Download the IFC file with progress.
        setState("downloading");
        const buffer = await downloadIfc(url, (p) => {
          if (!cancelled) setProgress(15 + Math.round(p * 35));
        });
        if (cancelled) return;

        // Open the model.
        setState("parsing");
        setProgress(55);
        const modelID = ifcApi.OpenModel(new Uint8Array(buffer), {
          COORDINATE_TO_ORIGIN: true,
        });
        if (modelID < 0) throw new Error("No se pudo abrir el modelo IFC.");
        modelIdRef.current = modelID;

        // Build Three.js scene + render all meshes.
        initScene();
        const trackedIds = getTrackedTypeIds();
        let processed = 0;
        ifcApi.StreamAllMeshesWithTypes(modelID, trackedIds, (mesh) => {
          if (cancelled) return;
          const geom = ifcApi.GetGeometry(modelID, mesh.geometries.get(0).geometryExpressID);
          const threeGeom = ifcGeometryToThree(ifcApi, geom, mesh.geometries.get(0).flatTransformation);
          const material = new THREE.MeshStandardMaterial({
            color: colorForClass(classNameForTypeId(ifcApi.GetLineType(modelID, mesh.expressID)) ?? ""),
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });
          const threeMesh = new THREE.Mesh(threeGeom, material);
          sceneRef.current?.add(threeMesh);
          meshesRef.current.push(threeMesh);
          elementToMeshRef.current.set(mesh.expressID, threeMesh);
          processed++;
          if (processed % 50 === 0) {
            setProgress(55 + Math.min(35, Math.round((processed / 200) * 35)));
          }
        });

        if (cancelled) return;

        // Fit camera to model bounds.
        fitCameraToModel();
        setElementCount(processed);
        setProgress(92);

        // Extract quantities (async, reads psets/qsets).
        const quantSummary = await extractQuantities(ifcApi, modelID);
        if (cancelled) return;
        setSummary(quantSummary);
        setProgress(100);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("IFC load error:", err);
        setError(err instanceof Error ? err.message : "Error al cargar el modelo IFC");
        setState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // -------------------------------------------------------------------------
  // Three.js scene management
  // -------------------------------------------------------------------------
  function initScene() {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1120);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.6));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dir1.position.set(50, 80, 30);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x99bbff, 0.4);
    dir2.position.set(-40, 20, -30);
    scene.add(dir2);
    sceneRef.current = scene;

    const { clientWidth: w, clientHeight: h } = container;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    camera.position.set(40, 40, 40);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    rendererRef.current = renderer;

    // OrbitControls — loaded lazily to avoid SSR issues.
    const controls = createOrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(container);

    // Render loop
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    let rafId = requestAnimationFrame(animate);

    // Click → highlight element
    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycasterRef.current.intersectObjects(meshesRef.current, false);
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh;
        highlightMesh(hit);
        // Find the expressID for this mesh
        for (const [eid, m] of elementToMeshRef.current) {
          if (m === hit) {
            console.log("Selected element", eid);
            break;
          }
        }
      }
    };
    renderer.domElement.addEventListener("click", handleClick);

    // Store cleanup on the renderer ref for disposal
    (renderer as any).__cleanup = () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      controls.dispose();
    };
  }

  function fitCameraToModel() {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || meshesRef.current.length === 0) return;

    const box = new THREE.Box3();
    for (const m of meshesRef.current) {
      box.expandByObject(m);
    }
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;
    camera.position.set(center.x + dist, center.y + dist * 0.7, center.z + dist);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  function disposeScene() {
    const renderer = rendererRef.current;
    if (renderer && (renderer as any).__cleanup) {
      (renderer as any).__cleanup();
    }
    for (const m of meshesRef.current) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    meshesRef.current = [];
    elementToMeshRef.current.clear();
    rendererRef.current?.dispose();
    rendererRef.current = null;
    sceneRef.current = null;
  }

  // -------------------------------------------------------------------------
  // Interaction helpers
  // -------------------------------------------------------------------------
  function highlightMesh(mesh: THREE.Mesh) {
    for (const m of meshesRef.current) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (m === mesh) {
        mat.emissive.setHex(0x444422);
      } else {
        mat.emissive.setHex(0x000000);
      }
    }
  }

  function isolateClass(className: string | null) {
    setSelectedClass(className);
    if (!summary) return;
    const targetIds = new Set<number>();
    if (className) {
      const group = summary.byClass.find((g) => g.ifcClass === className);
      if (group) for (const el of group.elements) targetIds.add(el.expressID);
    }
    for (const m of meshesRef.current) {
      m.visible = className === null;
    }
    if (className === null) return;
    for (const [eid, mesh] of elementToMeshRef.current) {
      if (targetIds.has(eid)) mesh.visible = true;
    }
  }

  function resetView() {
    fitCameraToModel();
    isolateClass(null);
  }

  // -------------------------------------------------------------------------
  // Action callbacks
  // -------------------------------------------------------------------------
  const handleGenerateBudget = useCallback(() => {
    if (!summary || !onGenerateBudget) return;
    const ctx = buildBudgetContextFromIFC(summary);
    onGenerateBudget(ctx, summary);
  }, [summary, onGenerateBudget]);

  const handleGenerateSchedule = useCallback(() => {
    if (!summary || !onGenerateSchedule) return;
    const ctx = buildScheduleContextFromIFC(summary);
    onGenerateSchedule(ctx, summary);
  }, [summary, onGenerateSchedule]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="relative h-full w-full bg-[#0a1120]">
      {/* Canvas */}
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* Top toolbar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={resetView}
          className="rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
        >
          🎯 Reset vista
        </button>
        <button
          type="button"
          onClick={() => isolateClass(null)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium backdrop-blur transition ${
            selectedClass === null
              ? "border-blue-500/40 bg-blue-500/20 text-blue-200"
              : "border-white/[0.08] bg-[#0a1120]/80 text-slate-200 hover:bg-white/[0.08]"
          }`}
        >
          Ver todo
        </button>
        {summary && (
          <>
            <button
              type="button"
              onClick={handleGenerateBudget}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur transition hover:bg-emerald-500/25"
            >
              💰 Generar Presupuesto APU
            </button>
            <button
              type="button"
              onClick={handleGenerateSchedule}
              className="rounded-lg border border-purple-500/30 bg-purple-500/15 px-3 py-1.5 text-xs font-semibold text-purple-200 backdrop-blur transition hover:bg-purple-500/25"
            >
              📅 Crear Cronograma
            </button>
          </>
        )}
      </div>

      {/* Panel toggle */}
      <button
        type="button"
        onClick={() => setShowPanel((s) => !s)}
        className="pointer-events-auto absolute right-3 top-3 z-10 rounded-lg border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-white/[0.08]"
      >
        {showPanel ? "▶ Ocultar panel" : "◀ Mostrar panel"}
      </button>

      {/* Right side panel — element tree + quantities */}
      {showPanel && state === "ready" && summary && (
        <div className="absolute right-0 top-0 z-[5] flex h-full w-80 flex-col border-l border-white/[0.06] bg-[#0a1120]/95 backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="text-sm font-semibold text-white">🏗️ Modelo BIM</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {summary.totalElements} elementos · IFC {summary.schema ?? "—"}
              {summary.totalArea != null && ` · ${summary.totalArea} m²`}
              {summary.totalVolume != null && ` · ${summary.totalVolume} m³`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {summary.byClass.map((group) => (
              <ClassRow
                key={group.ifcClass}
                group={group}
                expanded={expandedClass === group.ifcClass}
                isolated={selectedClass === group.ifcClass}
                onToggleExpand={() =>
                  setExpandedClass((c) => (c === group.ifcClass ? null : group.ifcClass))
                }
                onToggleIsolate={() =>
                  isolateClass(selectedClass === group.ifcClass ? null : group.ifcClass)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {state !== "ready" && state !== "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1120]/90 backdrop-blur">
          <div className="w-80 max-w-[90%] text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">
              🏗️
            </div>
            <p className="text-sm font-medium text-white">
              {state === "loading-wasm" && "Inicializando motor BIM…"}
              {state === "downloading" && "Descargando modelo IFC…"}
              {state === "parsing" && "Procesando geometría…"}
            </p>
            <div className="mx-auto mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{progress}%</p>
            {elementCount > 0 && state === "parsing" && (
              <p className="mt-1 text-[11px] text-slate-600">{elementCount} elementos leídos</p>
            )}
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
            <p className="text-sm font-medium text-white">No se pudo cargar el modelo IFC</p>
            <p className="mt-1 text-xs text-slate-400">{error}</p>
            <p className="mt-3 text-[11px] text-slate-600">
              Verifica que el archivo sea un IFC válido (IFC2x3 o IFC4). Si el modelo es muy grande
              (mayor a 80 MB), el navegador puede quedarse sin memoria.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class row sub-component
// ---------------------------------------------------------------------------

function ClassRow({
  group,
  expanded,
  isolated,
  onToggleExpand,
  onToggleIsolate,
}: {
  group: IfcClassGroup;
  expanded: boolean;
  isolated: boolean;
  onToggleExpand: () => void;
  onToggleIsolate: () => void;
}) {
  const qtyStr =
    group.totalArea != null
      ? `${group.totalArea} m²`
      : group.totalVolume != null
        ? `${group.totalVolume} m³`
        : group.totalLength != null
          ? `${group.totalLength} ml`
          : `${group.count} ${group.unit}`;

  return (
    <div className="mb-1 rounded-lg border border-white/[0.04] bg-white/[0.01]">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <span className={`text-[10px] text-slate-500 transition ${expanded ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: colorHexForClass(group.ifcClass) }}
          />
          <span className="flex-1 truncate text-xs font-medium text-slate-200">
            {group.ifcClass}
          </span>
          <span className="text-[10px] text-slate-500">{group.apuChapter}</span>
        </button>
        <button
          type="button"
          onClick={onToggleIsolate}
          className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold transition ${
            isolated
              ? "bg-blue-500/30 text-blue-200"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          title={isolated ? "Mostrar todo" : "Aislar este tipo"}
        >
          {isolated ? "★" : "◉"}
        </button>
      </div>
      <div className="flex items-center justify-between px-3 pb-2 pl-8">
        <span className="text-[11px] text-slate-500">{group.count} elementos</span>
        <span className="text-[11px] font-semibold text-slate-300">{qtyStr}</span>
      </div>
      {expanded && group.elements.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-white/[0.04] px-3 py-1.5">
          {group.elements.slice(0, 100).map((el) => (
            <div key={el.expressID} className="flex items-center justify-between py-0.5 text-[10px]">
              <span className="truncate text-slate-500">
                {el.name || el.guid.slice(0, 12)}
              </span>
              <span className="shrink-0 text-slate-600">
                {el.area != null
                  ? `${el.area} m²`
                  : el.volume != null
                    ? `${el.volume} m³`
                    : el.length != null
                      ? `${el.length} ml`
                      : ""}
              </span>
            </div>
          ))}
          {group.elements.length > 100 && (
            <p className="py-1 text-center text-[10px] text-slate-600">
              +{group.elements.length - 100} más…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — geometry, colors, controls
// ---------------------------------------------------------------------------

/** Converts a web-ifc IfcGeometry into a Three.js BufferGeometry. */
function ifcGeometryToThree(
  ifcApi: IfcAPI,
  geom: { GetVertexData(): number; GetVertexDataSize(): number; GetIndexData(): number; GetIndexDataSize(): number },
  transformation: number[],
): THREE.BufferGeometry {
  const vertPtr = geom.GetVertexData();
  const vertSize = geom.GetVertexDataSize();
  const idxPtr = geom.GetIndexData();
  const idxSize = geom.GetIndexDataSize();

  const verts = (ifcApi as any).GetVertexArray(vertPtr, vertSize);
  const indices = (ifcApi as any).GetIndexArray(idxPtr, idxSize);

  // Vertices are interleaved: [x, y, z, nx, ny, nz, ...]
  const positions = new Float32Array((verts.length / 6) * 3);
  const normals = new Float32Array((verts.length / 6) * 3);
  for (let i = 0, j = 0; i < verts.length; i += 6, j += 3) {
    positions[j] = verts[i];
    positions[j + 1] = verts[i + 1];
    positions[j + 2] = verts[i + 2];
    normals[j] = verts[i + 3];
    normals[j + 1] = verts[i + 4];
    normals[j + 2] = verts[i + 5];
  }

  const threeGeom = new THREE.BufferGeometry();
  threeGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  threeGeom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  threeGeom.setIndex(new THREE.BufferAttribute(indices, 1));

  // Apply the placement transformation (flat 4x4 matrix).
  const matrix = new THREE.Matrix4().fromArray(transformation);
  threeGeom.applyMatrix4(matrix);
  threeGeom.computeVertexNormals();
  return threeGeom;
}

/** Stable color per IFC class (for visual distinction in the viewer). */
const colorCache = new Map<string, THREE.Color>();
function colorForClass(className: string): THREE.Color {
  const c = colorCache.get(className);
  if (c) return c;
  // Deterministic hue based on string hash.
  let hash = 0;
  for (let i = 0; i < className.length; i++) hash = (hash * 31 + className.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const col = new THREE.Color().setHSL(hue / 360, 0.45, 0.55);
  colorCache.set(className, col);
  return col;
}
function colorHexForClass(className: string): string {
  return "#" + colorForClass(className).getHexString();
}

/** Downloads an IFC file with progress reporting. */
async function downloadIfc(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error HTTP ${res.status} al descargar el modelo`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!total || !res.body) {
    onProgress?.(1);
    return await res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received / total);
    }
  }
  const buf = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf.buffer;
}

// ---------------------------------------------------------------------------
// OrbitControls — minimal inline implementation (no extra dependency)
// ---------------------------------------------------------------------------

type OrbitControlsLike = {
  target: THREE.Vector3;
  update: () => void;
  dispose: () => void;
};

function createOrbitControls(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement): OrbitControlsLike {
  const spherical = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(new THREE.Vector3(0, 0, 0)),
  );
  const target = new THREE.Vector3(0, 0, 0);
  let isPanning = false;
  let isRotating = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 2 || e.shiftKey) {
      isPanning = true;
    } else {
      isRotating = true;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    domElement.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!isRotating && !isPanning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (isRotating) {
      spherical.theta -= dx * 0.005;
      spherical.phi -= dy * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
    } else if (isPanning) {
      const offset = camera.position.clone().sub(target);
      const panScale = offset.length() * 0.0015;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      target.addScaledVector(right, -dx * panScale);
      target.addScaledVector(up, dy * panScale);
    }
    updateCamera();
  };
  const onPointerUp = (e: PointerEvent) => {
    isRotating = false;
    isPanning = false;
    try {
      domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    spherical.radius *= e.deltaY > 0 ? 1.1 : 0.9;
    spherical.radius = Math.max(0.5, spherical.radius);
    updateCamera();
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  function updateCamera() {
    const pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    camera.position.copy(pos);
    camera.lookAt(target);
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);

  // Initial placement
  updateCamera();

  return {
    target,
    update: () => updateCamera(),
    dispose: () => {
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
