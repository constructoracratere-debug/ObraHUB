"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IfcAPI, IFCCOLUMN, IFCBEAM, IFCSLAB, IFCFOOTING, IFCWALLSTANDARDCASE, IFCWINDOW, IFCFURNISHINGELEMENT, IFCPLATE, IFCMEMBER } from "web-ifc";
import type { FloorPlan } from "@/lib/design/schema";
import { planToIfc } from "@/lib/design/ifc";
import { mat3d, wallMatOf, roofMatOf, furnitureMatOf, type Mat3D } from "@/lib/design/materials3d";
import { MATERIALS, WALL_ASSEMBLIES } from "@/lib/design/materials";

/** Categoría de pieza para AISLAR por disciplina (como Revit Isolate):
 *  estructura · arquitectura (muros/vanos/acabados) · mep. */
export type ParteCat = "estructura" | "arquitectura" | "mep";
type ViewMode = "realista" | "xray" | "estructura" | "instalaciones" | "bn" | "capas";

/** Clasifica una pieza por nombre/tipo — nuestros nombres son deterministas,
 *  así la categoría es exacta para TODOS los sistemas (E·C·F·madera). */
const catOf = (tId: number, name: string): ParteCat => {
  const n = name.toLowerCase();
  if (/pletina|perno|anclaje|refuerzo ø|riostra|cumbrera|cercha|zapata|pedestal|excavaci/.test(n)) return "estructura";
  if (/columna i |columna madera|poste guadua|montante|viga i|viga doble|viga madera|viga cadena|solera|pedrestal/.test(n)) return "estructura";
  if (/\[eléctrico\]|\[hidrosanitario\]|retie|\(ras\)/.test(n)) return "mep";
  if (/faldón|losa|placa de|contrapiso/.test(n)) return /faldón/.test(n) ? "arquitectura" : "estructura";
  if (tId === IFCWINDOW || tId === IFCFURNISHINGELEMENT) return "arquitectura";
  return "arquitectura";
};

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
  const materialFor = (look: Mat3D, ghost: boolean, m: Exclude<ViewMode, "capas">, cat?: ParteCat): THREE.MeshStandardMaterial => {
    // AISLAR por disciplina: la que manda va a COLOR COMPLETO, el resto
    // queda en fantasma mínimo (se apaga el que no toca).
    if (m === "estructura" || m === "instalaciones") {
      const manda = m === "estructura" ? cat === "estructura" : cat === "mep";
      return manda
        ? new THREE.MeshStandardMaterial({ color: look.hex, roughness: look.roughness, metalness: look.metalness, emissive: look.emissive ?? 0x000000, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: 0x9db8cc, transparent: true, opacity: 0.06, roughness: 1, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    }
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

  // ── 🧱 MAQUETA ESTRUCTURAL POR CAPAS (modo "capas") ────────────────────
  // Muestra de muro EXPLOTADA del sistema del plan (WALL_ASSEMBLIES, fuente
  // única): cada capa con SU material y espesor real rotulado, más la pieza
  // estructural característica — mampostería E.3: columna de confinamiento
  // con ACERO (4Ø + estribos) y viga cadena · bahareque E.7: encamisado
  // cemento, embutido (esterilla+arcilla) y tabique de GUADUA. Determinista.
  const etiqueta = (texto: string): THREE.Sprite => {
    const cv = document.createElement("canvas");
    cv.width = 640; cv.height = 140;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "rgba(7,13,26,0.88)";
    ctx.fillRect(0, 0, 640, 140);
    ctx.strokeStyle = "rgba(120,180,140,0.5)"; ctx.strokeRect(2, 2, 636, 136);
    ctx.font = "bold 56px Arial";
    ctx.fillStyle = "#d7ffe4";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(texto, 320, 72, 610);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(2.6, 0.57, 1);
    return sp;
  };

  const buildCapas = (): THREE.Group => {
    const g = new THREE.Group();
    const system = plan.structure?.system ?? "concreto";
    const asm = WALL_ASSEMBLIES[system as keyof typeof WALL_ASSEMBLIES] ?? WALL_ASSEMBLIES.concreto;
    const HL = 2.6; // largo de la muestra de muro
    // Capas explotadas a lo largo de X: espesor VISUAL mínimo 0.09, real en
    // la etiqueta (cm). Orden: exterior → interior.
    const capas = [...asm.ext.layers];
    const conPintura = ["mamposteria_confinada", "bahareque_encamisado"].includes(system);
    if (conPintura) capas.unshift({ name: "Pintura exterior (vinílica)", thickness: 0.004 });
    let x = 0;
    const centros: Array<{ x: number; w: number }> = [];
    for (const l of capas) {
      const w = Math.max(l.thickness, 0.09);
      const look = mat3d(l.name) ?? mat3d("genérico");
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.15, HL),
        new THREE.MeshStandardMaterial({ color: look.hex, roughness: look.roughness, metalness: look.metalness }),
      );
      mesh.position.set(x + w / 2, 1.0, 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      const cm = Math.round(l.thickness * 100);
      const tag = etiqueta(`${l.name.replace(/ ?e=[0-9.]+ ?(cm|mm)? ?/i, "")} · ${cm === 0 ? "0.4" : cm} cm`);
      tag.position.set(x + w / 2, 0.28, HL / 2 + 0.05);
      g.add(tag);
      centros.push({ x: x + w / 2, w });
      x += w + 0.42;
    }
    if (conPintura) {
      const w = 0.06;
      const pint = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, HL),
        new THREE.MeshStandardMaterial({ color: 0xf2f4f0, roughness: 0.35 }));
      pint.position.set(x + w / 2, 1.0, 0); pint.castShadow = true;
      g.add(pint);
      const t = etiqueta("Pintura interior (vinílica) · 0.4 cm");
      t.position.set(x + w / 2, 0.28, HL / 2 + 0.05);
      g.add(t);
      x += w + 0.42;
    }
    // PIEZA ESTRUCTURAL característica, a la derecha de las capas.
    const bx = x + 0.9;
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9c3cc, roughness: 0.32, metalness: 0.85 });
    const concretoM = new THREE.MeshStandardMaterial({ color: 0xb6b3a8, roughness: 0.88 });
    const maderaM = new THREE.MeshStandardMaterial({ color: 0x9a6a3f, roughness: 0.72 });
    const guaduaM3 = new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.6, metalness: 0.05 });
    if (system === "mamposteria_confinada") {
      // COLUMNA de confinamiento 0.30×0.30 con ACERO: 4Ø verticales + estribos
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.5, 0.46), concretoM);
      col.position.set(bx, 0.95, 0.6); col.castShadow = true; g.add(col);
      const colMat = new THREE.MeshStandardMaterial({ color: 0xb6b3a8, transparent: true, opacity: 0.42, roughness: 0.88 });
      col.material = colMat;
      for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
        const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 10), steel);
        rebar.position.set(bx + dx, 0.95, 0.6 + dz);
        g.add(rebar);
      }
      for (const yE of [0.45, 0.95, 1.45]) {
        const est = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 4), steel);
        est.rotation.x = Math.PI / 2; est.rotation.z = Math.PI / 4;
        est.position.set(bx, yE, 0.6);
        g.add(est);
      }
      const tc = etiqueta("Columna confinamiento 30×30 · 4Ø3/8\" + estribos Ø1/4\"@0.15 (E.3)");
      tc.position.set(bx, 0.12, 0.6); tc.scale.set(3.4, 0.75, 1); g.add(tc);
      // VIGA CADENA con 4Ø
      const vig = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xb6b3a8, transparent: true, opacity: 0.42, roughness: 0.88 }));
      vig.position.set(bx + 0.4, 0.36, -1.0); vig.castShadow = true; g.add(vig);
      for (const dz of [-0.12, 0.12]) for (const dy of [-0.09, 0.09]) {
        const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8), steel);
        rb.rotation.z = Math.PI / 2;
        rb.position.set(bx + 0.4, 0.36 + dy, -1.0 + dz);
        g.add(rb);
      }
      const tv = etiqueta("Viga cadena (amarre) 30×25 · concreto + 4Ø — recibe CERCHA");
      tv.position.set(bx + 0.4, -0.28, -1.0); tv.scale.set(3.2, 0.7, 1); g.add(tv);
    } else {
      // BAHAREQUE / otros: TABIQUE de guadua (montantes) como pieza viva
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.6), maderaM);
      tab.position.set(bx, 0.95, 0.2); tab.castShadow = true; g.add(tab);
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 12), guaduaM3);
        m.position.set(bx, 0.95, -0.45 + i * 0.42);
        g.add(m);
      }
      const tt = etiqueta("TABIQUE: montantes de guadua G.12 + esterilla (diafragma E.7)");
      tt.position.set(bx, 0.12, 0.2); tt.scale.set(3.6, 0.75, 1); g.add(tt);
      const emb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x8d6a40, roughness: 0.95 }));
      emb.position.set(bx + 0.55, 0.9, 0.2); g.add(emb);
      const te = etiqueta("EMBUTIDO: esterilla + arcilla");
      te.position.set(bx + 0.55, 0.12, 0.2); te.scale.set(2.4, 0.55, 1); g.add(te);
    }
    return g;
  };

  // Aplicar modo a las mallas ya generadas (sin regenerar el IFC).
  useEffect(() => {
    const scene = sceneRef.current as any;
    const root: THREE.Group | undefined = scene?.root;
    // 🧱 CAPAS: maqueta explotada del sistema — el modelo se oculta.
    if (view === "capas") {
      if (!scene) return;
      const rev = JSON.stringify([plan.structure, plan.levels]).slice(0, 600);
      if (scene.capasRev !== rev || !scene.capas) {
        if (scene.capas) { scene.remove(scene.capas); }
        scene.capas = buildCapas();
        scene.capasRev = rev;
        scene.add(scene.capas);
      }
      scene.capas.visible = true;
      if (root) root.visible = false;
      const grid: THREE.GridHelper | undefined = scene.grid;
      const capas: THREE.Group = scene.capas;
      capas.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(capas, true);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length() || 8;
      if (grid) grid.position.set(center.x, box.min.y, center.z);
      const gnd: THREE.Mesh | undefined = scene.ground;
      if (gnd) gnd.position.set(center.x, box.min.y + 0.01, center.z);
      const sun: THREE.DirectionalLight | undefined = scene.sun;
      if (sun) { sun.castShadow = true; sun.position.set(center.x + size, box.max.y + size, center.z + size * 0.6); sun.target.position.copy(center); scene.add(sun.target); }
      const cam: THREE.PerspectiveCamera = scene.cam;
      const ctl = scene.ctl;
      if (cam && ctl) {
        ctl.target.copy(center);
        const dir = new THREE.Vector3(0.55, 0.5, 0.85).normalize();
        cam.position.copy(center.clone().add(dir.multiplyScalar(size * 1.25)));
        cam.near = size / 200; cam.far = size * 30; cam.updateProjectionMatrix();
        ctl.update();
      }
      const ren: THREE.WebGLRenderer | undefined = scene.ren;
      if (ren) ren.shadowMap.enabled = true;
      return;
    }
    if (scene?.capas) scene.capas.visible = false;
    if (root) root.visible = true;
    const store = (sceneRef as any)?.meshes as Array<{ mesh: THREE.Mesh; look: Mat3D; ghost: boolean; cat?: ParteCat }> | undefined;
    if (!store) return;
    for (const it of store) {
      it.mesh.material = materialFor(it.look, it.ghost, view, it.cat);
      const aislado = view === "estructura" ? it.cat === "estructura" : view === "instalaciones" ? it.cat === "mep" : true;
      it.mesh.castShadow = (view === "realista" && !it.ghost) || ((view === "estructura" || view === "instalaciones") && aislado);
      it.mesh.receiveShadow = view === "realista";
    }
    const ren: THREE.WebGLRenderer | undefined = (sceneRef as any)?.ren;
    if (ren) ren.shadowMap.enabled = view === "realista" || view === "estructura" || view === "instalaciones";
    const ground: THREE.Mesh | undefined = (sceneRef as any)?.ground;
    if (ground) ground.visible = view === "realista" || view === "estructura" || view === "instalaciones";
    const sun: THREE.DirectionalLight | undefined = (sceneRef as any)?.sun;
    if (sun) sun.castShadow = view === "realista"; // capas configura su sol y retorna antes
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
        // Con CIMENTACIÓN y EXCAVACIÓN (Df=1.50 NSR-10 E.3.3): el usuario
        // debe VER el desplante — la rejilla se apoya en el fondo de excavación.
        const ifcText = planToIfc(plan, { includeFoundations: true });
        const bytes = new TextEncoder().encode(ifcText);
        if (modelRef.current >= 0) { try { api.CloseModel(modelRef.current); } catch { /* */ } }
        // COORDINATE_TO_ORIGIN: false — nuestro IFC vive en 0,0,0 por diseño;
        // el recenter de web-ifc nos hundía el edificio BAJO tierra (y<0).
        const mid = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
        if (mid < 0) throw new Error("IFC inválido");
        modelRef.current = mid;
        const store: Array<{ mesh: THREE.Mesh; look: Mat3D; ghost: boolean; cat?: ParteCat }> = [];
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
          const isStruct = tId === IFCCOLUMN || tId === IFCBEAM || tId === IFCFOOTING || /excavaci/i.test(name);
          const ghost = !isStruct && tId !== IFCWINDOW; // rayos X: envolvente fantasma, estructura+MEP+vidrio sólidos
          const m3 = new THREE.Mesh(bg, materialFor(look, ghost, viewRef.current === "capas" ? "realista" : viewRef.current, catOf(tId, name)));
          m3.castShadow = viewRef.current === "realista" && !ghost;
          m3.receiveShadow = viewRef.current === "realista";
          m3.matrixAutoUpdate = false;
          m3.matrix.fromArray(g0.flatTransformation); // mundo Y-up directo (sin giro extra)
          root.add(m3);
          store.push({ mesh: m3, look, ghost, cat: catOf(tId, name) });
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
      {/* Modos de visión — realismo Título E · rayos X · plot B/N.
          Abajo-derecha: arriba-derecha lo ocupan los botones flotantes
          ⚙️ Estudio / 📋 Expediente (z-40) y tapaban el selector. */}
      <div className="absolute bottom-2 right-2 z-20 flex gap-1 rounded-lg bg-[#070d1a]/85 p-1 backdrop-blur">
        {([["realista", "🎨", "Realista (materiales PBR)"], ["xray", "🩻", "Rayos X — envolvente fantasma, estructura e instalaciones sólidas"], ["estructura", "🏗️", "AISLAR Estructura — solo pórticos/riostras/cerchas/zapatas (acabados en fantasma)"], ["instalaciones", "⚡", "AISLAR Instalaciones — solo puntos RETIE/RAS"], ["bn", "⬛", "Plot B/N (lámina)"], ["capas", "🧱", "Capas del sistema (Título E)"]] as const).map(([m, icon, title]) => (
          <button
            key={m} type="button" onClick={() => setView(m)} title={title}
            className={`rounded-md px-2 py-1 text-[13px] font-semibold leading-none transition ${view === m ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40" : "text-slate-400 hover:bg-white/5"}`}
          >
            {icon}
          </button>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-[#070d1a]/85 px-2.5 py-1.5 text-[10px] text-slate-500 backdrop-blur">
        🧱 3D vivo con MATERIALES NSR-10 Título E — ladrillo · concreto · tierra · madera · vidrio · teja · rueda=zoom, arrastra=orbitar
      </p>
    </div>
  );
}
