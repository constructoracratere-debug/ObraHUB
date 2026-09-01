"use client";

/**
 * IFC 3D viewer using web-ifc (WASM) + Three.js.
 *
 * Loaded dynamically with ssr:false from app-shell — the WASM/Three bundle is
 * heavy (~1.5 MB) and must never block login or the tool launcher.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { IfcAPI } from "web-ifc";
import {
  extractQuantities,
  enrichWithGeometryFallback,
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
  progress?: number;
};

type IfcLinkLite = {
  id: string;
  taskId: string;
  ifcGlobalIds: string[];
  label: string | null;
};

/** Status of an element relative to the simulation date. */
type SimStatus = "completed" | "active" | "pending" | "unlinked";

type IfcViewerProps = {
  /** Signed URL to the .ifc file in Supabase Storage. */
  url: string;
  /** Project slug — needed to load/save 4D links. */
  projectSlug?: string;
  /** File ID of the IFC file in the files table (for link persistence). */
  fileId?: string;
  /** Gantt tasks for 4D linking. If omitted and projectSlug is set, they are auto-loaded. */
  tasks?: GanttTaskLite[];
  /** IFC GlobalIDs to highlight after the model loads (4D navigation from Gantt). */
  highlightGlobalIds?: string[];
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
  highlightGlobalIds,
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
  // Modo de visualización: sólido / alambre (frame) / rayos X
  const [viewMode, setViewMode] = useState<"solido" | "alambre" | "rayosx">("solido");

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

  // 4D simulation state
  const [links, setLinks] = useState<IfcLinkLite[]>([]);
  const [simEnabled, setSimEnabled] = useState(false);
  const [simDate, setSimDate] = useState<number>(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simStats, setSimStats] = useState<{ completed: number; active: number; pending: number }>({ completed: 0, active: 0, pending: 0 });
  // Original material per mesh — captured before the simulation first paints,
  // so leaving the simulation (or "unlinked" elements) restores the model.
  const originalMaterialsRef = useRef<Map<THREE.Mesh, {
    color: THREE.Color;
    opacity: number;
    transparent: boolean;
  }>>(new Map());

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

  // Saved 4D links — loaded once the model is ready (simulation needs the
  // meshes to exist to be meaningful, and this avoids a flash of empty sim).
  useEffect(() => {
    if (!projectSlug || state !== "ready") return;
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectSlug)}/ifc-links`)
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: IfcLinkLite[] = (data.links ?? []).map((l: any) => ({
          id: l.id,
          taskId: l.taskId,
          ifcGlobalIds: Array.isArray(l.ifcGlobalIds) ? l.ifcGlobalIds : [],
          label: l.label ?? null,
        }));
        setLinks(list);
      })
      .catch(() => { /* links are optional */ });
    return () => { cancelled = true; };
  }, [projectSlug, state]);

  // Simulation window: min task start → max task end.
  const [simStart, simEnd] = useMemo(() => {
    if (tasks.length === 0) return [0, 0];
    let min = Infinity;
    let max = -Infinity;
    for (const t of tasks) {
      const s = new Date(t.startDate).getTime();
      const e = new Date(t.endDate).getTime();
      if (Number.isFinite(s) && s < min) min = s;
      if (Number.isFinite(e) && e > max) max = e;
    }
    return [min, max] as const;
  }, [tasks]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Element inspection (normal mode click → properties panel)
  const [elementProps, setElementProps] = useState<{
    expressID: number;
    guid: string;
    ifcClass: string;
    name: string;
    rows: Array<{ key: string; value: string }>;
    linkedTask: GanttTaskLite | null;
  } | null>(null);
  // Bridge so the stable click handler defined in initScene() can call the
  // latest inspector without re-subscribing listeners.
  const inspectElementRef = useRef<((eid: number) => void) | null>(null);

  const inspectElement = useCallback((eid: number) => {
    const api = ifcApiForClickRef.current;
    const mid = modelIdForClickRef.current;
    let guid = "";
    let ifcClass = "Element";
    let name = `Element ${eid}`;
    const rows: Array<{ key: string; value: string }> = [];

    if (api && mid >= 0) {
      try {
        const line = api.GetLine(mid, eid, false);
        guid = typeof line?.GlobalId?.value === "string" ? line.GlobalId.value : "";
        name = typeof line?.Name?.value === "string" && line.Name.value ? line.Name.value : name;
        ifcClass = classNameForTypeId(api.GetLineType(mid, eid)) ?? "Element";
      } catch { /* ignore */ }

      try {
        // flatten=true resolves relations: property sets appear as nested
        // objects with {value}-wrapped typed values.
        const props = api.GetLine(mid, eid, true) as Record<string, unknown>;
        for (const [k, v] of Object.entries(props)) {
          if (Array.isArray(v)) continue; // relation lists — not for display
          const direct = flattenIfcValue(v);
          if (direct != null) {
            rows.push({ key: k, value: direct });
          } else if (v && typeof v === "object") {
            // Nested property set: prefix with the pset name.
            for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
              if (Array.isArray(v2)) continue;
              const nested = flattenIfcValue(v2);
              if (nested != null) rows.push({ key: `${k} · ${k2}`, value: nested });
            }
          }
        }
      } catch { /* properties are optional */ }
    }

    // Which Gantt task is this element linked to (4D)?
    let linkedTask: GanttTaskLite | null = null;
    if (guid) {
      for (const l of links) {
        if (l.ifcGlobalIds.includes(guid)) {
          linkedTask = taskById.get(l.taskId) ?? null;
          break;
        }
      }
    }

    setElementProps({
      expressID: eid,
      guid,
      ifcClass,
      name,
      rows: rows.slice(0, 80),
      linkedTask,
    });
  }, [links, taskById]);

  useEffect(() => { inspectElementRef.current = inspectElement; }, [inspectElement]);

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
        // Collect raw geometry per element for fallback quantity estimation.
        const geometryMap = new Map<number, { positions: Float32Array }>();
        ifcApi.StreamAllMeshesWithTypes(modelID, trackedIds, (mesh: any) => {
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

          // Save positions for fallback quantity calculation.
          const posAttr = threeGeom.getAttribute("position");
          if (posAttr) {
            geometryMap.set(mesh.expressID, {
              positions: posAttr.array as Float32Array,
            });
          }

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
        let quantSummary = await extractQuantities(ifcApi, modelID);
        if (cancelled) return;

        // Fallback: if many elements lack Qto sets, estimate from geometry.
        const totalEls = quantSummary.totalElements;
        const withQuant = quantSummary.byClass.reduce(
          (sum, g) => sum + g.elements.filter((e) => e.area != null || e.volume != null || e.length != null).length,
          0,
        );
        if (totalEls > 0 && withQuant < totalEls * 0.5) {
          quantSummary = enrichWithGeometryFallback(quantSummary, geometryMap);
        }
        setSummary(quantSummary);
        setProgress(100);
        setState("ready");

        // 4D navigation: if highlightGlobalIds was passed (from Gantt),
        // isolate + highlight those elements now that the model is loaded.
        if (highlightGlobalIds && highlightGlobalIds.length > 0) {
          const targetExpressIds = new Set<number>();
          for (const guid of highlightGlobalIds) {
            try {
              const eid = ifcApi.GetExpressIdFromGuid(modelID, guid);
              if (typeof eid === "number") targetExpressIds.add(eid);
            } catch {
              /* guid not found in this model */
            }
          }
          if (targetExpressIds.size > 0) {
            // Isolate: hide everything, show only targets
            for (const m of meshesRef.current) m.visible = false;
            const highlightIds = new Set<number>();
            for (const [eid, mesh] of elementToMeshRef.current) {
              if (targetExpressIds.has(eid)) {
                mesh.visible = true;
                (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x004422);
                highlightIds.add(eid);
              }
            }
            // Fit camera to the highlighted elements only
            const box = new THREE.Box3();
            for (const id of highlightIds) {
              const m = elementToMeshRef.current.get(id);
              if (m) box.expandByObject(m);
            }
            if (!box.isEmpty()) {
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z, 1);
              const cam = cameraRef.current;
              const ctrl = controlsRef.current;
              if (cam && ctrl) {
                const dist = maxDim * 2.5;
                cam.position.set(center.x + dist, center.y + dist * 0.7, center.z + dist);
                cam.near = maxDim / 100;
                cam.far = maxDim * 100;
                cam.updateProjectionMatrix();
                ctrl.target.copy(center);
                ctrl.syncFromCamera();
                ctrl.update();
              }
            }
          }
        }
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

    // OrbitControls — loaded lazily to avoid SSR issues. El tercer parámetro
    // recibe los TAPS del táctil (el click no llega en móvil) y se resuelve
    // tarde porque pickAt se define más abajo.
    const pickAtRef: { current: ((x: number, y: number) => void) | null } = { current: null };
    const controls = createOrbitControls(camera, renderer.domElement, (x, y) => pickAtRef.current?.(x, y));
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

    // Click/tap → highlight element (or select for 4D linking). En móvil el
    // click no llega (preventDefault del touchstart lo suprime), así que la
    // selección también se dispara desde el tap de los controles orbitales.
    const pickAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
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
        // Normal mode — single highlight + open the properties inspector
        highlightMesh(hit);
        inspectElementRef.current?.(hitExpressId);
      }
    };
    const handleClick = (e: MouseEvent) => pickAt(e.clientX, e.clientY);
    pickAtRef.current = pickAt;
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
    // Adopta la nueva pose para que el damping no la revierta al frame siguiente.
    controls.syncFromCamera();
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

  /** Aplica el modo de visualización a todos los materiales del modelo. */
  function applyViewMode(mode: "solido" | "alambre" | "rayosx") {
    setViewMode(mode);
    for (const mesh of meshesRef.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) continue;
      if (mode === "alambre") {
        mat.wireframe = true;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      } else if (mode === "rayosx") {
        mat.wireframe = false;
        mat.transparent = true;
        mat.opacity = 0.3;
        mat.depthWrite = false;
      } else {
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      mat.needsUpdate = true;
    }
  }

  /** Enfoca la cámara en un elemento concreto (desde el panel del árbol). */
  function focusElement(expressID: number) {
    const mesh = elementToMeshRef.current.get(expressID);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!mesh || !cam || !ctrl) return;
    clearHighlight();
    // Resalta y muestra solo el elemento (y reubica la cámara sobre él).
    for (const m of meshesRef.current) m.visible = false;
    mesh.visible = true;
    (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x005530);
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.5);
      const dist = maxDim * 3;
      cam.position.set(center.x + dist, center.y + dist * 0.75, center.z + dist);
      cam.near = Math.max(0.01, maxDim / 100);
      cam.far = maxDim * 200;
      cam.updateProjectionMatrix();
      ctrl.target.copy(center);
      ctrl.syncFromCamera();
      ctrl.update();
    }
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

  /** Restores every mesh to its original (pre-simulation) material. */
  function restoreSimulation() {
    for (const [mesh, orig] of originalMaterialsRef.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(orig.color);
      mat.opacity = orig.opacity;
      mat.transparent = orig.transparent;
      mat.emissive.setHex(0x000000);
    }
    originalMaterialsRef.current.clear();
    setSimStats({ completed: 0, active: 0, pending: 0 });
  }

  /**
   * 4D simulation paint: colors each linked element by its task's status at
   * `dateMs` — completed (green), in progress (amber), not started (ghost
   * gray, ~12% opacity so the building "grows" as the date advances).
   * Unlinked elements keep their original material.
   */
  const applySimulation = useCallback((dateMs: number) => {
    const api = ifcApiRef.current;
    const mid = modelIdRef.current;
    const statusByExpress = new Map<number, SimStatus>();

    if (api && mid >= 0) {
      for (const link of links) {
        const task = taskById.get(link.taskId);
        if (!task) continue;
        const s = new Date(task.startDate).getTime();
        const e = new Date(task.endDate).getTime();
        const st: SimStatus = !Number.isFinite(s) || !Number.isFinite(e)
          ? "pending"
          : dateMs >= e ? "completed"
          : dateMs >= s ? "active"
          : "pending";
        for (const guid of link.ifcGlobalIds) {
          try {
            // Links may store real GlobalIds or (fallback) raw expressIDs as
            // strings when the model lacks GlobalId attributes.
            const eid = /^\d+$/.test(guid)
              ? Number(guid)
              : api.GetExpressIdFromGuid(mid, guid);
            if (typeof eid === "number") statusByExpress.set(eid, st);
          } catch {
            /* guid not present in this model */
          }
        }
      }
    }

    const counts = { completed: 0, active: 0, pending: 0 };
    for (const [eid, mesh] of elementToMeshRef.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, {
          color: mat.color.clone(),
          opacity: mat.opacity,
          transparent: mat.transparent,
        });
      }
      const st = statusByExpress.get(eid) ?? "unlinked";
      if (st === "unlinked") continue; // keeps its original look untouched
      if (st === "completed") {
        mat.color.setHex(0x22c55e);
        mat.opacity = 1;
        mat.transparent = false;
        mat.emissive.setHex(0x04310f);
        counts.completed++;
      } else if (st === "active") {
        mat.color.setHex(0xf59e0b);
        mat.opacity = 1;
        mat.transparent = false;
        mat.emissive.setHex(0x4a2a03);
        counts.active++;
      } else {
        mat.color.setHex(0x64748b);
        mat.opacity = 0.12;
        mat.transparent = true;
        mat.emissive.setHex(0x000000);
        counts.pending++;
      }
    }
    setSimStats(counts);
  }, [links, taskById]);

  // Enable/disable simulation: enter paints at the current date (defaults to
  // the project start); leaving restores the original materials.
  useEffect(() => {
    if (!simEnabled) {
      restoreSimulation();
      setSimPlaying(false);
      return;
    }
    const start = simStart;
    setSimDate((d) => (d >= start ? d : start));
    applySimulation(Math.max(simDate, start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simEnabled, simStart]);

  // Repaint whenever the simulated date or the links change while active.
  useEffect(() => {
    if (simEnabled) applySimulation(simDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simDate, applySimulation]);

  // Playback loop: advance ~1 day per tick. 1× ≈ one day every 250 ms.
  useEffect(() => {
    if (!simEnabled || !simPlaying) return;
    const DAY = 24 * 60 * 60 * 1000;
    const step = DAY;
    const id = window.setInterval(() => {
      setSimDate((d) => {
        const next = d + step;
        if (next >= simEnd) {
          setSimPlaying(false);
          return simEnd;
        }
        return next;
      });
    }, Math.max(60, Math.round(250 / simSpeed)));
    return () => window.clearInterval(id);
  }, [simEnabled, simPlaying, simSpeed, simEnd]);

  function toggleSimulation() {
    setSimEnabled((on) => {
      if (!on && tasks.length === 0) return false;
      return !on;
    });
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
      const created = await res.json().catch(() => null) as { link?: {
        id: string; taskId: string; ifcGlobalIds?: string[]; label?: string | null;
      } } | null;
      if (created?.link) {
        setLinks((prev) => [
          ...prev,
          {
            id: created.link!.id,
            taskId: created.link!.taskId,
            ifcGlobalIds: Array.isArray(created.link!.ifcGlobalIds) ? created.link!.ifcGlobalIds : [],
            label: created.link!.label ?? null,
          },
        ]);
      }
      setLinkedCount((c) => c + 1);
      // Clear selection after saving — pero PERMANECE en modo vinculación con
      // la misma tarea: así se encadenan lotes (muros → columnas → vigas)
      // sin repetir el paso 1 ni reabrir el modo cada vez.
      clearHighlight();
      setSelectedElements([]);
      selectedElementsRef.current = [];
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setIsSavingLink(false);
    }
  }

  /** Color determinista por tarea — pinta los vínculos en el visor y el panel. */
  function taskColorFor(taskId: string): number {
    const palette = [0x8b5cf6, 0xf59e0b, 0x10b981, 0x3b82f6, 0xef4444, 0x14b8a6, 0xf97316, 0xec4899];
    let h = 0;
    for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
  }

  /** Selecciona/deselecciona de un toque TODOS los elementos de una clase IFC
   *  (p.ej. "todos los muros") — la vía rápida que faltaba en el 4D. */
  function toggleSelectClass(cls: string) {
    const group = summary?.byClass.find((g) => g.ifcClass === cls);
    if (!group) return;
    const selectedIds = new Set(selectedElements.map((e) => e.expressID));
    const groupIds = new Set(group.elements.map((e) => e.expressID));
    const allSelected = group.elements.every((e) => selectedIds.has(e.expressID));
    let newList = selectedElements.filter((e) => !groupIds.has(e.expressID));
    if (!allSelected) {
      for (const el of group.elements) {
        newList.push({ expressID: el.expressID, guid: el.guid, ifcClass: cls, name: el.name ?? `Element ${el.expressID}` });
        const mesh = elementToMeshRef.current.get(el.expressID);
        if (mesh) (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x004422);
      }
    } else {
      for (const eid of groupIds) {
        const mesh = elementToMeshRef.current.get(eid);
        if (mesh) (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
    }
    setSelectedElements(newList);
    selectedElementsRef.current = newList;
  }

  /** Elimina un lote de vínculos guardado. */
  async function handleDeleteLink(linkId: string) {
    if (!projectSlug) return;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/ifc-links?id=${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      setLinkError("No se pudo eliminar el vínculo");
    }
  }

  // En modo vinculación, cada elemento YA vinculado se pinta con el color de
  // su tarea: se ve al instante qué falta por asignar y qué tiene cada tarea.
  useEffect(() => {
    if (state !== "ready" || !summary) return;
    const byGuid = new Map<string, string>();
    for (const l of links) for (const g of l.ifcGlobalIds) byGuid.set(g, l.taskId);
    const selectedIds = new Set(selectedElements.map((e) => e.expressID));
    for (const group of summary.byClass) {
      for (const el of group.elements) {
        const mesh = elementToMeshRef.current.get(el.expressID);
        if (!mesh) continue;
        if (selectedIds.has(el.expressID)) continue; // no pisar la selección activa
        const taskId = byGuid.get(el.guid);
        (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(
          linkMode && taskId ? taskColorFor(taskId) : 0x000000,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkMode, links, state, summary]);

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
        {/* Selector de modo de vista */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0a1120]/80 p-0.5 backdrop-blur">
          {([
            { id: "solido", label: "🧱 Sólido", title: "Render sólido con materiales" },
            { id: "alambre", label: "🔲 Alambre", title: "Vista en alambre (frame) — estructura y aristas" },
            { id: "rayosx", label: "🔦 Rayos X", title: "Translúcido — ver elementos internos y superpuestos" },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.title}
              onClick={() => applyViewMode(m.id)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                viewMode === m.id
                  ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
            {tasks.length > 0 && (
              <button
                type="button"
                onClick={toggleSimulation}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
                  simEnabled
                    ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                }`}
                title={links.length === 0 ? "Primero vincula elementos con tareas (Vincular 4D)" : "Reproduce la construcción en el tiempo"}
              >
                {simEnabled ? "⏸ Cerrar simulación" : "▶ Simulación 4D"}
              </button>
            )}
          </>
        )}
      </div>

      {/* 4D Linking — panel guiado por pasos (derecha). El flujo anterior era
          una barra con un <select> plano y selección 1-a-1: ahora es wizard
          tarea → elementos (por tipo o al tacto) → vincular, y se encadena. */}
      {linkMode && (
        <div className="pointer-events-auto absolute right-0 top-0 z-10 flex h-full w-[min(360px,92%)] flex-col border-l border-cyan-500/25 bg-[#0a1120]/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Encabezado */}
          <div className="flex shrink-0 items-center justify-between border-b border-cyan-500/20 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-cyan-100">🔗 Vincular 4D</p>
              <p className="text-[10px] text-slate-400">Elementos del modelo → tareas del cronograma</p>
            </div>
            <button
              type="button"
              onClick={toggleLinkMode}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Cerrar modo vinculación"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {/* PASO 1 — tarea */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Paso 1 · Elige la tarea
            </p>
            <div className="mt-2 space-y-1.5">
              {tasks.map((t) => {
                const linkedTo = links
                  .filter((l) => l.taskId === t.id)
                  .reduce((n, l) => n + l.ifcGlobalIds.length, 0);
                const active = linkTaskId === t.id;
                const color = `#${taskColorFor(t.id).toString(16).padStart(6, "0")}`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLinkTaskId(active ? null : t.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-cyan-400/60 bg-cyan-500/15 ring-1 ring-cyan-400/30"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/30 hover:bg-cyan-500/[0.07]"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-100">{t.name}</span>
                      <span className="block text-[10px] text-slate-500">
                        {new Date(t.startDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                        {" → "}
                        {new Date(t.endDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                        {typeof t.progress === "number" ? ` · ${t.progress}%` : ""}
                      </span>
                    </span>
                    {linkedTo > 0 && (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                        {linkedTo} elem.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* PASO 2 — elementos */}
            <div className={`mt-4 ${linkTaskId ? "" : "pointer-events-none opacity-40"}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Paso 2 · Elige los elementos
              </p>
              {/* Selección rápida por tipo — un toque = toda la clase */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {summary?.byClass.map((g) => {
                  const selectedIds = new Set(selectedElements.map((e) => e.expressID));
                  const groupIds = g.elements.map((e) => e.expressID);
                  const allSel = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
                  const someSel = groupIds.some((id) => selectedIds.has(id));
                  return (
                    <button
                      key={g.ifcClass}
                      type="button"
                      onClick={() => toggleSelectClass(g.ifcClass)}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
                        allSel
                          ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                          : someSel
                            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                            : "border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-cyan-500/30 hover:bg-cyan-500/[0.07]"
                      }`}
                      title={`Seleccionar todos los ${g.ifcClass}`}
                    >
                      {allSel ? "✓ " : ""}{g.ifcClass} · {g.count}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                …o toca elementos directamente en el modelo {selectedElements.length > 0 && (
                  <span className="text-cyan-300">({selectedElements.length} seleccionado(s))</span>
                )}
              </p>

              {/* Lista de seleccionados */}
              {selectedElements.length > 0 && (
                <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
                  {selectedElements.map((el) => (
                    <div key={el.expressID} className="flex items-center justify-between py-0.5 text-[10px]">
                      <span className="truncate text-slate-400">
                        <span className="text-cyan-400">{el.ifcClass}</span>
                        {el.name && el.name !== `Element ${el.expressID}` && ` · ${el.name}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const mesh = elementToMeshRef.current.get(el.expressID);
                          if (mesh) (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
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

            {/* Vínculos existentes */}
            <div className="mt-5 border-t border-white/[0.06] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Vínculos existentes ({links.length})
              </p>
              {links.length === 0 ? (
                <p className="mt-2 text-[10px] text-slate-600">
                  Ninguno todavía — cada vínculo pinta sus elementos con el color de su tarea.
                </p>
              ) : (
                <div className="mt-2 space-y-1">
                  {links.map((l) => {
                    const task = tasks.find((t) => t.id === l.taskId);
                    const color = `#${taskColorFor(l.taskId).toString(16).padStart(6, "0")}`;
                    return (
                      <div
                        key={l.id}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">
                          {task?.name ?? "Tarea"}
                          <span className="ml-1.5 text-slate-500">· {l.ifcGlobalIds.length} elem.</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(l.id)}
                          className="shrink-0 text-[10px] text-slate-500 transition hover:text-red-400"
                          title="Eliminar vínculo"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* CTA fija */}
          <div className="shrink-0 border-t border-cyan-500/20 px-4 py-3">
            {linkError && <p className="mb-2 text-[10px] text-red-400">{linkError}</p>}
            {linkedCount > 0 && !linkError && (
              <p className="mb-2 text-[10px] text-emerald-400">✓ {linkedCount} lote(s) vinculado(s) — puedes seguir con otro</p>
            )}
            <button
              type="button"
              onClick={handleSaveLink}
              disabled={!linkTaskId || selectedElements.length === 0 || isSavingLink}
              className="w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-900/40 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSavingLink
                ? "Guardando…"
                : !linkTaskId
                  ? "1️⃣ Elige una tarea arriba"
                  : selectedElements.length === 0
                    ? "2️⃣ Selecciona elementos (tipo o al tacto)"
                    : `✓ Vincular ${selectedElements.length} elemento(s) → ${tasks.find((t) => t.id === linkTaskId)?.name ?? ""}`}
            </button>
          </div>
        </div>
      )}

      {/* 4D Simulation bar — shows when simulation is on */}
      {simEnabled && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[min(760px,94%)] -translate-x-1/2 rounded-xl border border-amber-500/30 bg-[#0a1120]/95 p-4 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (simDate >= simEnd) setSimDate(simStart);
                setSimPlaying((p) => !p);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm text-black transition hover:bg-amber-400"
              title={simPlaying ? "Pausar" : "Reproducir"}
            >
              {simPlaying ? "⏸" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={simStart}
                max={simEnd}
                step={24 * 60 * 60 * 1000}
                value={simDate}
                onChange={(e) => {
                  setSimPlaying(false);
                  setSimDate(Number(e.target.value));
                }}
                className="w-full accent-amber-400"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>{formatSimDate(simStart)}</span>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-200">
                  📅 {formatSimDate(simDate)}
                </span>
                <span>{formatSimDate(simEnd)}</span>
              </div>
            </div>
            <select
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="shrink-0 rounded-lg border border-white/[0.1] bg-[#050b14] px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500/40 focus:outline-none"
              title="Velocidad de reproducción"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={5}>5×</option>
            </select>
          </div>

          {links.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Sin vínculos todavía — usa <span className="text-cyan-300">🔗 Vincular 4D</span> para
              conectar elementos del modelo con tareas del cronograma y poder simularlos.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                {simStats.completed} ejecutado
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
                {simStats.active} en curso
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-500/60" />
                {simStats.pending} por construir
              </span>
              <span className="text-slate-600">
                {links.length} vínculo(s) · {tasks.length} tarea(s)
              </span>
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
                onFocusElement={focusElement}
              />
            ))}
          </div>
        </div>
      )}

      {/* Element properties inspector — opened by clicking an element */}
      {elementProps && (
        <div className="pointer-events-auto absolute bottom-4 left-3 z-10 flex max-h-[52%] w-80 flex-col overflow-hidden rounded-xl border border-blue-500/25 bg-[#0a1120]/95 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-blue-200">
                <span className="text-blue-400">{elementProps.ifcClass}</span>
                {elementProps.name !== `Element ${elementProps.expressID}` && ` · ${elementProps.name}`}
              </p>
              <p className="mt-0.5 truncate font-mono text-[9px] text-slate-600">
                ID {elementProps.expressID}
                {elementProps.guid && ` · ${elementProps.guid}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setElementProps(null)}
              className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* Linked task (4D) */}
          {elementProps.linkedTask ? (
            (() => {
              const t = elementProps.linkedTask!;
              const now = Date.now();
              const s = new Date(t.startDate).getTime();
              const e = new Date(t.endDate).getTime();
              const st = now >= e ? "completed" : now >= s ? "active" : "pending";
              const label = st === "completed" ? "Ejecutada" : st === "active" ? "En curso" : "Programada";
              const cls = st === "completed"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : st === "active"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-slate-500/30 bg-slate-500/10 text-slate-300";
              return (
                <div className={`m-2 rounded-lg border px-2.5 py-2 ${cls}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    🔗 Tarea vinculada · {label}
                  </p>
                  <p className="truncate text-xs font-medium">{t.name}</p>
                  <p className="text-[10px] opacity-70">
                    {formatSimDate(s)} → {formatSimDate(e)}
                  </p>
                </div>
              );
            })()
          ) : (
            <p className="mx-2 mt-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-slate-500">
              Sin tarea vinculada — usa 🔗 Vincular 4D para conectar este elemento al cronograma.
            </p>
          )}

          {/* IFC property sets */}
          {elementProps.rows.length > 0 && (
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {elementProps.rows.map((r, i) => (
                <div
                  key={`${r.key}-${i}`}
                  className="flex items-baseline justify-between gap-2 border-b border-white/[0.03] py-1 last:border-0"
                >
                  <span className="shrink-0 max-w-[45%] truncate text-[10px] text-slate-500">{r.key}</span>
                  <span className="min-w-0 break-words text-right font-mono text-[10px] text-slate-300">{r.value}</span>
                </div>
              ))}
            </div>
          )}
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
  onFocusElement,
}: {
  group: IfcClassGroup;
  expanded: boolean;
  isolated: boolean;
  onToggleExpand: () => void;
  onToggleIsolate: () => void;
  onFocusElement?: (expressID: number) => void;
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
            <button
              key={el.expressID}
              type="button"
              onClick={() => onFocusElement?.(el.expressID)}
              title="Ver en el modelo 3D"
              className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] transition hover:bg-cyan-500/10"
            >
              <span className="truncate text-left text-slate-400 group-hover:text-cyan-200">
                🎯 {el.name || el.guid.slice(0, 12)}
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
            </button>
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
/** es-CO short date for the 4D simulation timeline. */
function formatSimDate(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

/**
 * Normalizes an IFC property value for display: unwraps `{ value: X }`
 * wrappers (web-ifc typed values) into plain strings; returns null for
 * anything not displayable (nested objects are handled one level up).
 */
function flattenIfcValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (typeof v === "object") {
    const wrapped = (v as { value?: unknown }).value;
    if (wrapped != null && typeof wrapped !== "object") return String(wrapped);
  }
  return null;
}

function colorForClass(className: string): THREE.Color {
  const c = colorCache.get(className);
  if (c) return c;
  // Paleta BIM profesional (convención tipo Revit/navisworks).
  const PALETTE: Record<string, number> = {
    IFCWALL: 0xd9c8a9, IFCWALLSTANDARDCASE: 0xd9c8a9,       // muros: beige
    IFCSLAB: 0x8fa8bd,                                        // losas: azul grisáceo
    IFCCOLUMN: 0xd98b6f,                                      // columnas: terracota
    IFCBEAM: 0xe3c46a,                                        // vigas: ocre
    IFCFOOTING: 0xb08d57, IFCPILE: 0xb08d57,                  // cimentación: bronce
    IFCROOF: 0x9c6b6b,                                        // cubiertas: teja
    IFCSTAIR: 0xc4a35a, IFCRAMP: 0xc4a35a,                    // escaleras
    IFCCURTAINWALL: 0x7fc8d8, IFCWINDOW: 0x9fd4e8,            // vidrios: celeste
    IFCDOOR: 0xa8825a,                                        // puertas: madera
    IFCMEMBER: 0x9aa5b1, IFcPLATE: 0x9aa5b1, IFCPLATE: 0x9aa5b1,
    IFCSPACE: 0x7ea86b, IFCBUILDINGELEMENTPROXY: 0xb3b3cc,    // genérico: lavanda
    IFCCOVERING: 0xc0b28f, IFCRAILING: 0x8f8f8f,
    IFCFURNISHINGELEMENT: 0xa8a293, IFCFLOWTERMINAL: 0x6fb3c7,
    IFCFLOWSEGMENT: 0x7ba7c9, IFCDISTRIBUTIONELEMENT: 0x8fd0b0,
  };
  const base = className.toUpperCase();
  let hex: number | undefined;
  for (const [key, val] of Object.entries(PALETTE)) {
    if (base.startsWith(key)) { hex = val; break; }
  }
  const col = hex !== undefined ? new THREE.Color(hex) : (() => {
    // Fallback: hash estable pero con tonos apagados agradables.
    let hash = 0;
    for (let i = 0; i < className.length; i++) hash = (hash * 31 + className.charCodeAt(i)) | 0;
    return new THREE.Color().setHSL((Math.abs(hash) % 360) / 360, 0.32, 0.58);
  })();
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
  /** Adopta la pose actual de la cámara (tras moverla directo con fit/focus). */
  syncFromCamera: () => void;
  target: THREE.Vector3;
  update: () => void;
  dispose: () => void;
};

function createOrbitControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLCanvasElement,
  onTap?: (clientX: number, clientY: number) => void,
): OrbitControlsLike {
  const spherical = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(new THREE.Vector3(0, 0, 0)),
  );
  const target = new THREE.Vector3(0, 0, 0);
  // Estado suavizado (damping): valores actuales persiguen a los objetivos.
  const cur = { theta: spherical.theta, phi: spherical.phi, radius: spherical.radius };
  const goal = { ...cur };
  const goalTarget = target.clone();
  const minRadius = 0.3;
  let maxRadius = Math.max(spherical.radius * 8, 5);

  // 📱 CLAVE MÓVIL: sin touch-action none el navegador se queda el gesto
  // (scroll/pinch de página), dispara pointercancel y el pinch muere a
  // mitad. También quitamos selección/brillo de tap para que se sienta nativo.
  domElement.style.touchAction = "none";
  domElement.style.userSelect = "none";
  (domElement.style as unknown as Record<string, string>).webkitUserSelect = "none";
  (domElement.style as unknown as Record<string, string>).webkitTapHighlightColor = "transparent";

  // Multi-touch: mapa de punteros activos para pinch-zoom y pan a 2 dedos.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let pinchAngle = 0;

  // Doble tap = acercarse (como cualquier app móvil).
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const tapStart = new Map<number, { x: number; y: number; t: number }>();

  function touchAction(e: Event) {
    // Evita que el navegador haga scroll/zoom de la página sobre el canvas.
    (e as TouchEvent).preventDefault?.();
  }

  // iOS Safari: el pinch de página se bloquea con gesturestart, no con
  // touchmove. Sin esto, el zoom con 2 dedos sobre el canvas escala la página.
  const onGestureStart = (e: Event) => e.preventDefault();

  const onPointerDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    try {
      domElement.setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      // Dos dedos: pinch = zoom, rotación del pinch = orbita, movimiento medio = pan.
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (pinchDist > 0) {
        // Ratio por evento con rango amplio: el 0.9-1.11 anterior hacía el
        // zoom lento/artificial; así responde 1:1 al gesto como una app nativa.
        goal.radius *= Math.max(0.7, Math.min(1.4, pinchDist / Math.max(1, dist)));
        goal.radius = Math.max(minRadius, Math.min(maxRadius, goal.radius));
        let dTheta = angle - pinchAngle;
        if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
        if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
        goal.theta -= dTheta;
      }
      pinchDist = dist;
      pinchAngle = angle;
      const panScale = cur.radius * 0.0012;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      goalTarget.addScaledVector(right, -(dx / 2) * panScale);
      goalTarget.addScaledVector(up, (dy / 2) * panScale);
      return;
    }

    if (e.pointerType === "touch") {
      // Un dedo en móvil: orbita (movimiento horizontal) + inclina (vertical),
      // con sensibilidad suave.
      goal.theta -= dx * 0.004;
      goal.phi -= dy * 0.004;
    } else if (e.button === 2 || e.shiftKey) {
      const panScale = cur.radius * 0.0015;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      goalTarget.addScaledVector(right, -dx * panScale);
      goalTarget.addScaledVector(up, dy * panScale);
    } else {
      goal.theta -= dx * 0.005;
      goal.phi -= dy * 0.005;
    }
    goal.phi = Math.max(0.05, Math.min(Math.PI - 0.05, goal.phi));
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;

    // Taps táctiles: selección de elementos (el click no llega en móvil) y
    // doble tap para acercarse.
    const start = tapStart.get(e.pointerId);
    tapStart.delete(e.pointerId);
    if (e.pointerType === "touch" && start) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const elapsed = performance.now() - start.t;
      if (moved < 12 && elapsed < 250 && pointers.size === 0) {
        const now = performance.now();
        const isDoubleTap =
          now - lastTapTime < 350 &&
          Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 48;
        lastTapTime = now;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
        if (isDoubleTap) {
          goal.radius = Math.max(minRadius, goal.radius * 0.6);
          lastTapTime = 0; // exige dos toques nuevos para repetir
        } else {
          // Tap simple → seleccionar/inspeccionar el elemento bajo el dedo.
          onTap?.(e.clientX, e.clientY);
        }
      }
    }

    try {
      domElement.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    goal.radius *= factor;
    goal.radius = Math.max(minRadius, Math.min(maxRadius, goal.radius));
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  function updateCamera() {
    // Damping: acerca el estado actual al objetivo (suaviza en móvil).
    const k = 0.18;
    cur.theta += (goal.theta - cur.theta) * k;
    cur.phi += (goal.phi - cur.phi) * k;
    cur.radius += (goal.radius - cur.radius) * k;
    target.lerp(goalTarget, k);
    spherical.set(cur.radius, cur.phi, cur.theta);
    const pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    camera.position.copy(pos);
    camera.lookAt(target);
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);
  domElement.addEventListener("touchstart", touchAction, { passive: false });
  domElement.addEventListener("touchmove", touchAction, { passive: false });
  // iOS Safari: bloquea el zoom de página con 2 dedos sobre el visor.
  domElement.addEventListener("gesturestart", onGestureStart, { passive: false });

  // Initial placement
  updateCamera();

  return {
    target,
    update: () => updateCamera(),
    /** Tras mover la cámara directamente (fit/focus), adopta esa pose como
     *  objetivo del damping — si no, el siguiente frame la devolvía atrás. */
    syncFromCamera: () => {
      goalTarget.copy(target);
      spherical.setFromVector3(camera.position.clone().sub(target));
      cur.theta = goal.theta = spherical.theta;
      cur.phi = goal.phi = spherical.phi;
      cur.radius = goal.radius = spherical.radius;
      maxRadius = Math.max(maxRadius, spherical.radius * 2);
    },
    dispose: () => {
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("pointercancel", onPointerUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
      domElement.removeEventListener("touchstart", touchAction);
      domElement.removeEventListener("touchmove", touchAction);
      domElement.removeEventListener("gesturestart", onGestureStart);
    },
  };
}

