"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IfcAPI } from "web-ifc";
import type { FloorPlan } from "@/lib/design/schema";
import { planToIfc } from "@/lib/design/ifc";

/**
 * 3D VIVO — el ambiente simultáneo 2D+3D: el IFC se regenera EN MEMORIA desde
 * el plano actual en cada edición (mover puerta/ventana/muro) y se renderiza
 * con web-ifc + three. Sin descargar nada: lo que ves es el modelo real.
 */
export function IfcLive({ plan }: { plan: FloorPlan }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [status, setStatus] = useState<"init" | "loading" | "ok" | "error">("init");
  const apiRef = useRef<IfcAPI | null>(null);
  const modelRef = useRef(-1);
  const revRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!apiRef.current) {
          const api = new IfcAPI();
          await api.Init();
          apiRef.current = api;
        }
        const api = apiRef.current;
        // Escena única por montaje.
        if (!sceneRef.current && containerRef.current && canvasRef.current) {
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0a1120);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.7));
          const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(50, 80, 30); scene.add(d1);
          const d2 = new THREE.DirectionalLight(0x99bbff, 0.4); d2.position.set(-40, 20, -30); scene.add(d2);
          const root = new THREE.Group();
          root.rotation.x = -Math.PI / 2; // IFC Z-up → three Y-up
          scene.add(root);
          const grid = new THREE.GridHelper(60, 60, 0x1e3a5f, 0x11203a);
          grid.position.y = -0.01;
          scene.add(grid);
          scene.add(new THREE.AmbientLight(0x334455, 0.5));
          (sceneRef as any).root = root;
          sceneRef.current = scene;
          const { clientWidth: w, clientHeight: h } = containerRef.current;
          const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
          camera.position.set(18, 16, 18);
          const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(w, h);
          (sceneRef as any).cam = camera;
          (sceneRef as any).ren = renderer;
          const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
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
        const ifcText = planToIfc(plan);
        const bytes = new TextEncoder().encode(ifcText);
        if (modelRef.current >= 0) { try { api.CloseModel(modelRef.current); } catch { /* */ } }
        const mid = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
        if (mid < 0) throw new Error("IFC inválido");
        modelRef.current = mid;
        let count = 0;
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
          const m3 = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0xc3d2e0, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, flatShading: false }));
          m3.matrixAutoUpdate = false;
          m3.matrix.fromArray(g0.flatTransformation); // transformación IFC cruda (el root la gira a Y-up)
          root.add(m3);
          count++;
        });
        // Encuadre automático al tamaño del modelo.
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length() || 10;
        const cam: THREE.PerspectiveCamera = (sceneRef as any).cam;
        const ctl: any = (sceneRef as any).ctl;
        if (cam && ctl) {
          ctl.target.copy(center);
          const dir = new THREE.Vector3(0.7, 0.55, 0.7).normalize();
          cam.position.copy(center.clone().add(dir.multiplyScalar(size * 1.15)));
          cam.near = size / 200; cam.far = size * 20; cam.updateProjectionMatrix();
          ctl.update();
        }
        void count;
        setStatus("ok");
      } catch { if (!cancelled) setStatus("error"); }
    })();
    return () => { cancelled = true; };
  }, [plan]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
      {status !== "ok" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-[#070d1a]/85 px-3 py-2 text-[11px] text-slate-400">
            {status === "loading" ? "🔄 regenerando 3D…" : status === "error" ? "⚠️ modelo no disponible" : "inizializando motor 3D…"}
          </p>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-[#070d1a]/85 px-2.5 py-1.5 text-[10px] text-slate-500 backdrop-blur">
        🧱 3D vivo desde el plano — arrastra en 2D y mira aquí · rueda=zoom, arrastra=orbitar
      </p>
    </div>
  );
}
