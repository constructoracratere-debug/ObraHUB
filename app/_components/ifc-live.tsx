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
        for (const c of [...scene.children]) if ((c as THREE.Mesh).isMesh) { scene.remove(c); ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose?.(); }
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
          const vertPtr = geom.GetVertexData(), vertSize = geom.GetVertexDataSize();
          const idxPtr = geom.GetIndexData(), idxSize = geom.GetIndexDataSize();
          const verts = (api as any).GetVertexArray(vertPtr, vertSize);
          const indices = (api as any).GetIndexArray(idxPtr, idxSize);
          const pos = new Float32Array((verts.length / 6) * 3);
          const nor = new Float32Array((verts.length / 6) * 3);
          for (let i = 0, j = 0; i < verts.length; i += 6, j += 3) {
            pos[j] = verts[i]; pos[j + 1] = verts[i + 2]; pos[j + 2] = -verts[i + 1];
            nor[j] = verts[i + 3]; nor[j + 1] = verts[i + 5]; nor[j + 2] = -verts[i + 4];
          }
          const bg = new THREE.BufferGeometry();
          bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          bg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
          bg.setIndex(new THREE.BufferAttribute(indices, 1));
          const t = g0.flatTransformation;
          const m = new THREE.Matrix4().set(t[0], t[1], t[3], t[0] * 0, t[3 + 0], t[4], t[5], 0, t[6], t[7], t[8], 0, 0, 0, 0, 1);
          void m;
          const mesh3 = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x9fb4c9, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }));
          mesh3.applyMatrix4(new THREE.Matrix4().fromArray(t));
          scene.add(mesh3);
          count++;
        });
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
