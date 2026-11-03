"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IfcAPI, IFCCOLUMN, IFCBEAM, IFCSLAB, IFCFOOTING, IFCWALLSTANDARDCASE, IFCWINDOW, IFCFURNISHINGELEMENT } from "web-ifc";
import type { FloorPlan } from "@/lib/design/schema";
import { planToIfc } from "@/lib/design/ifc";
import { mat3d, wallMatOf, roofMatOf, furnitureMatOf, type Mat3D } from "@/lib/design/materials3d";
import { MATERIALS } from "@/lib/design/materials";

type ViewMode = "realista" | "xray" | "bn";

/**
 * 3D VIVO — el ambiente simultáneo 2D+3D: el IFC se regenera EN MEMORIA desde
 * el plano actual en cada edición (mover puerta/ventana/muro) y se renderiza
 * con web-ifc + three. Sin descargar nada: lo que ves es el modelo real.
 *
 * REALISMO Título E: cada malla se pinta por MATERIAL (ladrillo E.3, tierra/
 * madera E.7, concreto de confinamiento, vidrio, teja, porcelana…) con la
 * MISMA paleta del archivo IFC (materials3d, fuente única) + entorno PBR
 * (RoomEnvironment), tono ACES y sombras al piso. Modos: 🎨 Realista ·
 * 🩻 Rayos X (envolvente fantasma, estructura e instalaciones sólidas) ·
 * ⬛ Plot B/N.
 */
export function IfcLive({ plan, mode = "all" }: { plan: FloorPlan; mode?: "all" | "structural" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [status, setStatus] = useState<"init" | "loading" | "ok" | "error">("init");
  const [view, setView] = useState<ViewMode>(mode === "structural" ? "xray" : "realista");
  const [ready2, setReady2] = useState(false); // dispara reintento manual
  const apiRef = useRef<IfcAPI | null>(null);
  const modelRef = useRef(-1);
  const revRef = useRef("");
  const viewRef = useRef<ViewMode>(view);
  viewRef.current = view;

  // Material 3D de una malla: tipo + nombre del elemento + sistema Título E
  // del plan (mampostería E.3 → ladrillo; bahareque E.7 → tierra/madera).
  const lookOf = (tId: number, name: string): Mat3D => {
    const levels = Math.max(1, plan.levels ?? 1);
    const system = plan.structure?.system ?? "concreto";
    if (tId === IFCWALLSTANDARDCASE) return mat3d(wallMatOf(system, /interior|divisi/i.test(name) ? "int" : "ext"));
    if (tId === IFCWINDOW) return mat3d(MATERIALS.vidrio);
    if (tId === IFCFURNISHINGELEMENT) return mat3d(furnitureMatOf(name));
    if (tId === IFCSLAB && new RegExp(`Losa N${levels} `).test(name)) return mat3d(roofMatOf(system)); // cubierta
    // Aparatos MEP a la vista: porcelana y metal antes que el color de red.
    if (/Inodoro|Lavamanos|Ducha|Lavaplatos/.test(name)) return mat3d("Porcelana sanitaria");
    if (/Calentador|Lavadero/.test(name)) return mat3d("Metal electrodoméstico");
    return mat3d(name); // keywords: concreto/madera/vidrio/guadua/acero/eléctrico/hidro/porcelana…
  };

  /** Material three según MODO — realista usa la paleta completa. */
  const materialFor = (look: Mat3D, ghost: boolean, m: ViewMode): THREE.MeshStandardMaterial => {
    if (m === "xray" && ghost) {
      // Rayos X: envolvente translúcida — estructura, MEP y vidrio sólidos.
      return new THREE.MeshStandardMaterial({ color: 0x8fb7d8, transparent: true, opacity: 0.07, roughness: 1, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    }
    if (m === "bn") {
      // Plot B/N: la lámina en 3D — blancos/grises por masa, vidrio tenue.
      const v = look.opacity != null ? 200 : look.metalness > 0.5 ? 120 : 165;
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(v / 255, v / 255, v / 255), roughness: 0.9, metalness: 0, transparent: look.opacity != null, opacity: look.opacity != null ? 0.35 : 1, side: THREE.DoubleSide });
    }
    return new THREE.MeshStandardMaterial({
      color: look.hex,
      roughness: look.roughness,
      metalness: look.metalness,
      transparent: look.opacity != null,
      opacity: look.opacity ?? 1,
      emissive: look.emissive ?? 0x000000,
      side: THREE.DoubleSide,
    });
  };

  // Aplicar modo a las mallas ya generadas (sin regenerar el IFC).
  useEffect(() => {
    const store = (sceneRef as any)?.meshes as Array<{ mesh: THREE.Mesh; look: Mat3D; ghost: boolean }> | undefined;
    if (!store) return;
    for (const it of store) {
      it.mesh.material = materialFor(it.look, it.ghost, view);
      it.mesh.castShadow = view === "realista" && !it.ghost;
      it.mesh.receiveShadow = view === "realista";
    }
    const ren: THREE.WebGLRenderer | undefined = (sceneRef as any)?.ren;
    if (ren) ren.shadowMap.enabled = view === "realista";
    const ground: THREE.Mesh | undefined = (sceneRef as any)?.ground;
    if (ground) ground.visible = view === "realista";
    const sun: THREE.DirectionalLight | undefined = (sceneRef as any)?.sun;
    if (sun) sun.castShadow = view === "realista";
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!apiRef.current) {
          const api = new IfcAPI();
          await api.Init((filename: string) => `/wasm/${filename}`); // mismo localizador que el visor de Documentos
          apiRef.current = api;
        }
        const api = apiRef.current;
        // Escena única por montaje.
        if (!sceneRef.current && containerRef.current && canvasRef.current) {
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0a1120);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.5));
          const d1 = new THREE.DirectionalLight(0xffffff, 1.4); d1.position.set(50, 80, 30); scene.add(d1);
          const d2 = new THREE.DirectionalLight(0x99bbff, 0.4); d2.position.set(-40, 20, -30); scene.add(d2);
          // Entorno PBR (RoomEnvironment): los metales y el vidrio reflejan de
          // verdad — el salto de "cajas grises" a modelo con materiales.
          try {
            const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
            const ren0 = new THREE.WebGLRenderer({ canvas: canvasRef.current });
            const pmrem = new THREE.PMREMGenerator(ren0);
            scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
            pmrem.dispose();
          } catch { /* entorno opcional */ }
          // SIN rotación: web-ifc ya entrega flatTransformation normalizada a
          // Y-up (igual que el visor de Documentos). El scale.z=-1 des-espeja
          // el plano (web-ifc mapea y→-z): así el 3D se lee IGUAL que el 2D —
          // x a la derecha, y=0 arriba — y el edificio queda en z 0..D > 0.
          const root = new THREE.Group();
          root.scale.set(1, 1, -1);
          scene.add(root);
          const grid = new THREE.GridHelper(60, 60, 0x1e3a5f, 0x11203a);
          scene.add(grid);
          (sceneRef as any).grid = grid;
          scene.add(new THREE.AmbientLight(0x334455, 0.35));
          (sceneRef as any).root = root;
          sceneRef.current = scene;
          const { clientWidth: w, clientHeight: h } = containerRef.current;
          const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
          camera.position.set(18, 16, 18);
          const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(w, h);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.05;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          (sceneRef as any).cam = camera;
          (sceneRef as any).ren = renderer;
          // Sombra al piso: plano receptor bajo el edificio (sólo realista).
          const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 120),
            new THREE.ShadowMaterial({ opacity: 0.28 }),
          );
          ground.rotation.x = -Math.PI / 2;
          ground.receiveShadow = true;
          scene.add(ground);
          (sceneRef as any).ground = ground;
          (sceneRef as any).sun = d1;
          const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.maxPolarAngle = Math.PI * 0.495;
          (sceneRef as any).ctl = controls;
          const ro = new ResizeObserver(() => {
            if (!containerRef.current) return;
            camera.aspect = containerRef.current.clientWidth / Math.max(containerRef.current.clientHeight, 1);
            camera.updateProjectionMatrix();
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
          });
          ro.observe(containerRef.current);
          const tick = () => { if (cancelled) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(tick); };
          tick();
        }
        // Regenerar solo si el plano cambió (rev = JSON corto).
        const rev = JSON.stringify([plan.rooms, plan.doors, plan.windows, plan.levels, plan.outline, plan.structure]).slice(0, 4000);
        if (rev === revRef.current) return;
        revRef.current = rev;
        setStatus("loading");
        // Limpiar mallas previas.
        const scene = sceneRef.current!;
        const root: THREE.Group = (sceneRef as any).root;
        for (const c of [...root.children]) { root.remove(c); ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose?.(); ((c as THREE.Mesh).material as THREE.Material)?.dispose?.(); }
        const ifcText = planToIfc(plan, { includeFoundations: false }); // caja limpia en 000
        const bytes = new TextEncoder().encode(ifcText);
        if (modelRef.current >= 0) { try { api.CloseModel(modelRef.current); } catch { /* */ } }
        // COORDINATE_TO_ORIGIN: false — nuestro IFC vive en 0,0,0 por diseño;
        // el recenter de web-ifc nos hundía el edificio BAJO tierra (y<0).
        const mid = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
        if (mid < 0) throw new Error("IFC inválido");
        modelRef.current = mid;
        const store: Array<{ mesh: THREE.Mesh; look: Mat3D; ghost: boolean }> = [];
        (sceneRef as any).meshes = store;
        api.StreamAllMeshes(mid, (mesh: any) => {
          if (cancelled) return;
          const g0 = mesh.geometries.get(0);
          const geom = api.GetGeometry(mid, g0.geometryExpressID);
          const verts = (api as any).GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const indices = (api as any).GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
          const pos = new Float32Array((verts.length / 6) * 3);
          const nor = new Float32Array((verts.length / 6) * 3);
          for (let k = 0, j2 = 0; k < verts.length; k += 6, j2 += 3) {
            pos[j2] = verts[k]; pos[j2 + 1] = verts[k + 1]; pos[j2 + 2] = verts[k + 2];
            nor[j2] = verts[k + 3]; nor[j2 + 1] = verts[k + 4]; nor[j2 + 2] = verts[k + 5];
          }
          const bg = new THREE.BufferGeometry();
          bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          bg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
          bg.setIndex(new THREE.BufferAttribute(indices, 1));
          let tId = 0;
          try { tId = api.GetLineType(mid, mesh.expressID); } catch { tId = 0; }
          // Nombre del elemento → material Título E (misma paleta del archivo).
          let name = "";
          try { name = String((api as any).GetLine(mid, mesh.expressID)?.Name ?? ""); } catch { /* */ }
          const look = lookOf(tId, name);
          const isStruct = tId === IFCCOLUMN || tId === IFCBEAM || tId === IFCFOOTING;
          const ghost = !isStruct && tId !== IFCWINDOW; // rayos X: envolvente fantasma, estructura+MEP+vidrio sólidos
          const m3 = new THREE.Mesh(bg, materialFor(look, ghost, viewRef.current));
          m3.castShadow = viewRef.current === "realista" && !ghost;
          m3.receiveShadow = viewRef.current === "realista";
          m3.matrixAutoUpdate = false;
          m3.matrix.fromArray(g0.flatTransformation); // mundo Y-up directo (sin giro extra)
          root.add(m3);
          store.push({ mesh: m3, look, ghost });
        });
        // Encuadre automático al tamaño del modelo (el espejo z no afecta el bbox).
        // ANTI-EDIFICIO-EN EL-AIRE: las mallas usan matrixAutoUpdate=false —
        // su matrixWorld es IDENTIDAD hasta el primer render. Medir el bbox
        // sin propagar ponía la REJILLA y la cámara en coordenadas basura
        // (min.y llegó a leer −4 m con el modelo en −1.4) y el edificio
        // quedaba flotando sobre el piso, según timing del dispositivo.
        // Fuerza la propagación ANTES de medir: determinista a la primera.
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root, true);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length() || 10;
        // Rejilla y piso de sombras apoyados en la base del edificio.
        const grid: THREE.GridHelper | undefined = (sceneRef as any).grid;
        if (grid) { grid.position.set(center.x, box.min.y, center.z); }
        const ground: THREE.Mesh | undefined = (sceneRef as any).ground;
        if (ground) ground.position.set(center.x, box.min.y + 0.01, center.z);
        // Sol con sombras ajustadas al edificio (cámara de sombra del tamaño
        // del modelo — sin esto las sombras salen a parches).
        const sun: THREE.DirectionalLight | undefined = (sceneRef as any).sun;
        if (sun) {
          sun.castShadow = viewRef.current === "realista";
          const r = box.getSize(new THREE.Vector3()).length() / 2 || 12;
          sun.shadow.camera.left = -r; sun.shadow.camera.right = r;
          sun.shadow.camera.top = r; sun.shadow.camera.bottom = -r;
          sun.shadow.camera.near = 1; sun.shadow.camera.far = r * 6;
          sun.shadow.mapSize.set(2048, 2048);
          sun.shadow.bias = -0.0004;
          sun.position.set(center.x + r, box.max.y + r * 1.4, center.z + r * 0.6);
          sun.target.position.copy(center);
          scene.add(sun.target);
        }
        const cam: THREE.PerspectiveCamera = (sceneRef as any).cam;
        const ctl: any = (sceneRef as any).ctl;
        if (cam && ctl) {
          ctl.target.copy(center);
          const dir = new THREE.Vector3(0.7, 0.55, 0.7).normalize();
          cam.position.copy(center.clone().add(dir.multiplyScalar(size * 1.15)));
          cam.near = size / 200; cam.far = size * 20; cam.updateProjectionMatrix();
          ctl.update();
        }
        setStatus("ok");
      } catch { if (!cancelled) setStatus("error"); }
    })();
    return () => { cancelled = true; };
  }, [plan, mode, ready2]);

  return (
    <div ref={containerRef} className="absolute inset-0" onDoubleClick={() => { revRef.current = ""; setStatus("loading"); setTimeout(() => setReady2(r => !r), 50); }}>
      <canvas ref={canvasRef} className="h-full w-full" />
      {status !== "ok" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-[#070d1a]/85 px-3 py-2 text-[11px] text-slate-400">
            {status === "loading" ? "🔄 regenerando 3D…" : status === "error" ? "⚠️ modelo no disponible (revive con doble clic o regenera el plano)" : "inicializando motor 3D…"}
          </p>
        </div>
      )}
      {/* Modos de visión — realismo Título E · rayos X · plot B/N */}
      <div className="absolute right-2 top-2 flex gap-1 rounded-lg bg-[#070d1a]/85 p-1 backdrop-blur">
        {([["realista", "🎨 Realista"], ["xray", "🩻 Rayos X"], ["bn", "⬛ Plot B/N"]] as const).map(([m, label]) => (
          <button
            key={m} type="button" onClick={() => setView(m)}
            className={`rounded-md px-2 py-1 text-[10.5px] font-semibold transition ${view === m ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40" : "text-slate-400 hover:bg-white/5"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-[#070d1a]/85 px-2.5 py-1.5 text-[10px] text-slate-500 backdrop-blur">
        🧱 3D vivo con MATERIALES NSR-10 Título E — ladrillo · concreto · tierra · madera · vidrio · teja · rueda=zoom, arrastra=orbitar
      </p>
    </div>
  );
}
