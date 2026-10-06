<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ObraHub — playbook para agentes (léelo TODO antes de tocar código)

Construction OS para Colombia/LATAM (Cratere S.A.S.). Next.js App Router +
React 19 + TS strict + Supabase + Vercel. **Push a `main` = deploy a
producción inmediato** (CI corre smoke post-deploy y falla visible).

## Reglas de oro (violarlas = rollback seguro)

1. **`npm run verify` antes de cada push.** Corre `tsc --noEmit` + `next
   build` + 3 suites determinísticas. El hook pre-push lo exige igual — no
   lo saltes con `--no-verify`.
2. **La IA piensa, los motores dibujan.** Los LLM proponen JSON; TODO
   cálculo, dibujo y conteo lo hacen motores TS determinísticos (`lib/design`,
   `lib/passport`, `lib/structural`, `lib/pipeline`). NUNCA pongas matemática
   del LLM en la ruta crítica ni geometría no verificada.
3. **Cero solapes en planos.** El sanitizador (`resolveOverlaps` +
   `rederiveDoors` en `lib/design/schema.ts`) es la primera línea. Cualquier
   nuevo elemento 2D/3D debe respetar `scripts/test-nooverlap.mjs`.
4. **El 3D tiene guardián.** `scripts/repro-3d.mjs` reproduce el pipeline
   exacto del navegador (web-ifc → vertices × flatTransformation) y exige
   huella = plano 2D, muros verticales, edificio sobre el suelo (y ≥ 0).
   Si tocas `lib/design/ifc.ts` o `app/_components/ifc-live.tsx`, correlo.
5. **Secretos jamás al repo.** `.env.local` está gitignored. Los tokens que
   aparecen en chat/logs se revocan, no se reutilizan.
6. **UI full-bleed:** toda herramienta de pantalla completa (diseno,
   estructural, kit, pasaporte…) necesita la rama `activeTool === ...` con
   `h-full max-w-none px-0 py-0` en `app-shell.tsx`. Sin ella la columna del
   chat la colapsa a altura 0 = "no sale nada" (bug histórico Nº1).
7. **📕 EL LIBRO OBLIGATORIO: `docs/GUIA-ESTANDARES-DIBUJO.md`.** Todo dibujo
   (DXF/SVG/IFC) se rige por la Guía CPNAA (ISO 13567 capas, ISO 128
   plumillas 0.70/0.35/0.25/0.13, formatos y rótulo). Léelo ANTES de tocar
   `lib/design/`. Lámina OBRAHUB = 700×500 mm horizontal, margen doble 5/10,
   rótulo vertical 185 mm con ID en ambos extremos. El plano SIEMPRE limpio.
   El test `scripts/test-design-dxf.mjs` exige su checklist — nómbrales como
   fuente de verdad en cualquier cambio de dibujo.

## Mapa rápido

| Ruta | Qué es |
|---|---|
| `app/_components/app-shell.tsx` | Shell raíz: sidebar, tools 1-10, navegación |
| `app/_components/design-tool.tsx` | Diseño Arquitectónico IA (2D+3D simultáneo, drag, undo) |
| `app/_components/structural-tool.tsx` | Diseño Estructural IA (NSR-10, porticos, sismo) |
| `app/_components/kit-tool.tsx` | Kit + 🚀 Cadena de Obra (plan→presupuesto→cronograma) |
| `lib/design/` | schema (sanitizador), ifc, dxf, views, sheets, symbols |
| `lib/pipeline.ts` | takeoffToBudget + budgetToSchedule (determinístico) |
| `lib/passport/` | takeoff, prices, value, desmontaje (pasaporte materiales) |
| `lib/structural/` | loads, frame, seismic, plan, license (NSR-10 citado) |
| `app/api/` | Routes: auth, design/generate, projects/[slug]/* (kit, chain, budgets, tasks…) |
| `kb/` | NSR-10/RETIE texto completo (PDFs crudos gitignored) |
| `scripts/` | Suites determinísticas + scrape-norms |

## Suites (todas deben salir ✅)

```bash
npm run verify            # tsc + build + las tres de abajo
node scripts/repro-3d.mjs             # 3D == 2D (guardián anti-regresión)
node scripts/verify-ifc-z.mjs         # Z-mundo por elemento (niveles apilados)
node scripts/test-pipeline.mjs        # presupuesto+cronograma determinísticos
```

Extras: `test-design-dxf.mjs`, `test-furniture-solver.mjs`, `test-frame.mjs`,
`test-structural.mjs`, `test-seismic.mjs`, `test-nooverlap.mjs`.

## Flujo de trabajo multi-agente

- Trabaja en `main` para cambios quirúrgicos verificados, o en rama
  `agent/<tema>` paraFeatures grandes — el hook pre-push protege igual.
- Deploys: producción = https://obrahub-cratere.vercel.app (auto en push).
- Si el smoke de CI falla: ÚLTIMA acción tuya lo rompió — reverierte o arregla
  antes de seguir. Nunca dejes main roto.

### Protocolo de entrega (agentes SIN acceso de push — ej. Codex cloud)

Si `git push` te da 403: es GitHub rechazando una identidad no invitada —
comportamiento correcto, no lo fuerces. Protocolo:

1. Trabaja en una rama local: `git checkout -b codex/<tema>`.
2. Haz commits locales normalmente (no requieren auth).
3. **No intentes push** y **no toques credenciales guardadas** de otros
   agentes (Windows Credential Manager / ~/.git-credentials): usar tokens
   ajenos está prohibido.
4. Deja la rama lista y avisa al operador humano o al agente con acceso
   (ZCode). Quien tenga acceso corre `npm run verify`, revisa el diff y
   hace el merge + push.
5. Alternativa sin git: entrega el parche (`git diff > tema.patch`) y el
   agente con acceso lo aplica y verifica.
