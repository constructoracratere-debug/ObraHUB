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

type GanttTaskLite = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type IfcViewerProps = {
  /** Signed URL to the .ifc file in Supabase Storage. */
  url: string;
  /** Project slug — needed to load/save 4D links. */
  projectSlug?: string;
  /** File ID of the IFC file in the files table (for link persistence). */
  fileId?: string;
  /** Gantt tasks for 4D linking. If omitted and projectSlug is set, they are auto-loaded. */
  tasks?: GanttTaskLite[];
  /** Called when the user wants to generate an APU budget from the model. */
  onGenerateBudget?: (contextPrompt: string, summary: IfcQuantitySummary) => void;
  /** Called when the user wants to generate a Gantt schedule from the model. */
  onGenerateSchedule?: (contextPrompt: string, summary: IfcQuantitySummary) => void;
};

type LoadState = "loading-wasm" | "downloading" | "parsing" | "ready" | "error";

export function IfcViewer({
  url,
  projectSlug,
  fileId,
  tasks: tasksProp,
  onGenerateBudget,
  onGenerateSchedule,
}: IfcViewerProps) {
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
  // Refs that mirror state for use inside the stable click handler.
  const linkModeRef = useRef(false);
  const ifcApiForClickRef = useRef<IfcAPI | null>(null);
  const modelIdForClickRef = useRef<number>(-1);
  const selectedElementsRef = useRef<Array<{
    expressID: number;
    guid: string;
    ifcClass: string;
    name: string;
  }>>([]);

  // React state for UI
  const [state, setState] = useState<LoadState>("loading-wasm");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<IfcQuantitySummary | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [elementCount, setElementCount] = useState(0);

  // 4D linking state
  const [linkMode, setLinkMode] = useState(false);
  const [selectedElements, setSelectedElements] = useState<Array<{
    expressID: number;
    guid: string;
    ifcClass: string;
    name: string;
  }>>([]);
  const [linkTaskId, setLinkTaskId] = useState<string | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Keep refs in sync with state — these are read by the stable click handler
  // defined inside initScene(), which can't close over the state directly.
  useEffect(() => { linkModeRef.current = linkMode; }, [linkMode]);
  useEffect(() => { selectedElementsRef.current = selectedElements; }, [selectedElements]);

  // Tasks available for 4D linking — auto-loaded from the API if not passed as prop.
  const [loadedTasks, setLoadedTasks] = useState<GanttTaskLite[]>([]);
  const tasks = tasksProp ?? loadedTasks;

  useEffect(() => {
    if (!projectSlug || tasksProp) return;
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectSlug)}/tasks`)
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: GanttTaskLite[] = (data.tasks ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
        }));
        setLoadedTasks(list);
      })
      .catch(() => { /* tasks are optional */ });
    return () => { cancelled = true; };
  }, [projectSlug, tasksProp]);

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
        modelIdForClickRef.current = modelID;
        ifcApiForClickRef.current = ifcApi;

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

    // Click → highlight element (or select for 4D linking)
    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycasterRef.current.intersectObjects(meshesRef.current, false);
      if (hits.length === 0) {
        // Clicked empty space — clear selection in link mode
        if (linkModeRef.current) {
          clearHighlight();
          setSelectedElements([]);
        }
        return;
      }

      const hit = hits[0].object as THREE.Mesh;
      // Find the expressID for this mesh
      let hitExpressId: number | null = null;
      for (const [eid, m] of elementToMeshRef.current) {
        if (m === hit) { hitExpressId = eid; break; }
      }
      if (hitExpressId == null) return;

      if (linkModeRef.current) {
        // 4D link mode — toggle element in selection
        const existing = selectedElementsRef.current.find((el) => el.expressID === hitExpressId);
        let newList: typeof selectedElementsRef.current;
        if (existing) {
          // Deselect
          newList = selectedElementsRef.current.filter((el) => el.expressID !== hitExpressId);
          (hit.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        } else {
          // Select — read element info from IFC
          const api = ifcApiForClickRef.current;
          const mid = modelIdForClickRef.current;
          let guid = "";
          let ifcClass = "Element";
          let name = `Element ${hitExpressId}`;
          if (api && mid >= 0) {
            try {
              const line = api.GetLine(mid, hitExpressId, false);
              guid = typeof line?.GlobalId?.value === "string" ? line.GlobalId.value : "";
              name = typeof line?.Name?.value === "string" && line.Name.value ? line.Name.value : name;
              const typeId = api.GetLineType(mid, hitExpressId);
              ifcClass = classNameForTypeId(typeId) ?? "Element";
            } catch { /* ignore */ }
          }
          newList = [...selectedElementsRef.current, { expressID: hitExpressId, guid, ifcClass, name }];
          (hit.material as THREE.MeshStandardMaterial).emissive.setHex(0x004422);
        }
        selectedElementsRef.current = newList;
        setSelectedElements(newList);
      } else {
        // Normal mode — single highlight
        highlightMesh(hit);
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

  /** Clears all emissive highlights. */
  function clearHighlight() {
    for (const m of meshesRef.current) {
      (m.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
    }
  }

  /** Toggles 4D link mode — clears selection on exit. */
  function toggleLinkMode() {
    if (!linkMode) {
      setLinkMode(true);
    } else {
      setLinkMode(false);
      clearHighlight();
      setSelectedElements([]);
      selectedElementsRef.current = [];
    }
  }

  /** Saves a 4D link: connects selected elements to a Gantt task. */
  async function handleSaveLink() {
    if (!projectSlug || !linkTaskId || selectedElements.length === 0) return;
    setIsSavingLink(true);
    setLinkError(null);
    try {
      const guids = selectedElements
        .map((el) => el.guid)
        .filter((g): g is string => !!g);
      const ifcClass = selectedElements[0]?.ifcClass ?? null;
      const label = `${selectedElements.length} elemento(s) · ${ifcClass ?? "IFC"}`;
      const res = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/ifc-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: linkTaskId,
          ifcFileId: fileId ?? null,
          ifcGlobalIds: guids.length > 0 ? guids : selectedElements.map((e) => String(e.expressID)),
          ifcClass,
          label,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar vínculo");
      }
      setLinkedCount((c) => c + 1);
      // Clear selection after saving
      clearHighlight();
      setSelectedElements([]);
      selectedElementsRef.current = [];
      setLinkTaskId(null);
      setLinkMode(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setIsSavingLink(false);
    }
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
            {tasks.length > 0 && projectSlug && (
              <button
                type="button"
                onClick={toggleLinkMode}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
                  linkMode
                    ? "border-cyan-400/50 bg-cyan-500/25 text-cyan-100"
                    : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                }`}
              >
                {linkMode ? "🔗 Vinculando (Cancelar)" : "🔗 Vincular 4D"}
              </button>
            )}
          </>
        )}
      </div>

      {/* 4D Linking bar — shows when in link mode */}
      {linkMode && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-10 w-[min(640px,90%)] -translate-x-1/2 rounded-xl border border-cyan-500/30 bg-[#0a1120]/95 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-cyan-200">
                🔗 Modo vinculación BIM 4D
              </p>
              <p className="text-[11px] text-slate-400">
                {selectedElements.length === 0
                  ? "Haz clic en elementos del modelo para seleccionarlos"
                  : `${selectedElements.length} elemento(s) seleccionado(s) — clic de nuevo para deseleccionar`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
              {selectedElements.length} sel.
            </span>
          </div>

          {selectedElements.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={linkTaskId ?? ""}
                onChange={(e) => setLinkTaskId(e.target.value || null)}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#050b14] px-3 py-2 text-xs text-slate-200 focus:border-cyan-500/40 focus:outline-none"
              >
                <option value="">Selecciona una tarea del cronograma…</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveLink}
                disabled={!linkTaskId || isSavingLink}
                className="shrink-0 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingLink ? "Guardando…" : "✓ Vincular"}
              </button>
            </div>
          )}

          {linkError && (
            <p className="mt-2 text-[11px] text-red-400">{linkError}</p>
          )}

          {linkedCount > 0 && (
            <p className="mt-2 text-[11px] text-emerald-400">
              ✓ {linkedCount} vínculo(s) creado(s)
            </p>
          )}

          {/* Selected elements list */}
          {selectedElements.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
              {selectedElements.map((el) => (
                <div
                  key={el.expressID}
                  className="flex items-center justify-between py-0.5 text-[10px]"
                >
                  <span className="truncate text-slate-400">
                    <span className="text-cyan-400">{el.ifcClass}</span>
                    {el.name && el.name !== `Element ${el.expressID}` && ` · ${el.name}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const mesh = elementToMeshRef.current.get(el.expressID);
                      if (mesh) {
                        (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
                      }
                      const newList = selectedElements.filter((e) => e.expressID !== el.expressID);
                      setSelectedElements(newList);
                      selectedElementsRef.current = newList;
                    }}
                    className="shrink-0 text-slate-600 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
