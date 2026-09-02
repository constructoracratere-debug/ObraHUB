# ✏️ Diseño IA — Base de conocimiento y memoria del proyecto

> **Propósito**: que el estudio multi-agente dibuje con las convenciones y
> dimensiones de la literatura canónica de arquitectura — no con gusto
> genérico de LLM. Este documento es la **memoria** de dónde vive cada cosa.

## Bibliografía cableada (fuente → dónde se usa)

| Obra | Aporta | Código |
|---|---|---|
| **Francis D. K. Ching — Manual de dibujo arquitectónico** (*Architectural Graphics*) | Jerarquía de líneas, poché 45° de muros cortados, arcos de giro de puertas, ventana de triple línea, ticks oblicuos de cota, flecha de norte, escala gráfica, cajetín de lámina | `lib/design/knowledge.ts` → `LINE_HIERARCHY`, `POCHÉ`, `NORTH_ARROW`, `SCALE_BAR`, `TITLE_BLOCK_FIELDS` → motor `lib/design/dxf.ts` |
| **Ernst Neufert — El arte de proyectar en arquitectura** | Dimensiones funcionales AU: triángulo de trabajo (3.6–6.6 m), claros ante aparatos (sanitario ≥0.5 m), ducha 0.9×0.9, escalera Blondel (2h+p≈63 cm), puestos de parqueo 2.4×4.8 | `DIMENSIONAL_STANDARDS` + `CLEARANCES` → prompt del arquitecto (`agents.ts`) y gates (`validate.ts`) |
| **Plazola — Arquitectura Habitacional** (vols. 1/2) | El estándar habitacional Colombia/LATAM: mínimos por espacio, muros 0.15/0.10, alturas libres | `DIMENSIONAL_STANDARDS` + memo del constructor |
| **Panero & Zelnik — Human Dimension & Interior Space** | Antropometría: circulación 55–60 cm/persona, laterales de cama 60 cm | `DIMENSIONAL_STANDARDS.notes` → prompt arquitecto |
| **De Chiara — Time-Saver Standards** / **AIA Graphic Standards** | Estándares por tipo de edificación y simbología normalizada eléctrica/hidrosanitaria | `ELEC_SYMBOLS` / `HYDRO_SYMBOLS` en `dxf.ts` |
| **NTC 4595 · NSR-10 (A.1/A.3/A.6/C.11/E.*) · RETIE · RAS** | Normativa colombiana: accesibilidad (puertas ≥0.9), iluminación natural ≥1/10, sismo, viento | Gates en `validate.ts` + memos (civil/eléctrico/hidro) |

## Cómo fluye el conocimiento

```
knowledge.ts (DIMENSIONAL_STANDARDS, CLEARANCES)      ← EDITA AQUÍ (Diego = AEC expert)
   ├── agents.ts    → dimensionalTableForPrompt() inyecta la tabla al ARQUITECTO
   ├── validate.ts  → ROOM_MINIMUMS y MIN_DOOR_WIDTH (fuente única de los gates)
   └── dxf.ts       → POCHÉ / NORTH_ARROW / SCALE_BAR / TITLE_BLOCK (Ching)
```

## Convenciones gráficas ya implementadas en el DXF (Ching)

1. **Poché**: rayado 45° en el anillo del muro exterior (bandas S/N/O/E).
2. **Flecha de norte** en esquina superior derecha, fuera del dibujo.
3. **Escala gráfica** 0–1–2–5 m con barras alternadas (legible a cualquier zoom).
4. **Cajetín** de lámina: PROYECTO · PLANO · ESCALA · FECHA · DIBUJÓ · LÁMINA (A-1).
5. **Cotas** con líneas de extensión + ticks oblicuos 45°.
6. **Puertas**: hoja + arco de giro 90°. **Ventanas**: triple línea.
7. **Jerarquía por capas**: MUROS (corte, grueso) > PUERTAS/VENTANAS (medio) > COTAS/TEXTOS (fino); ejes trazo-punto extendidos más allá del edificio con etiquetas A-B-C / 1-2-3.
8. **Textos**: espacios en MAYÚSCULAS + área; alturas escaladas al plano.

## Reglas de la casa (filosofía del roadmap)

- **La IA piensa, el motor dibuja**: el LLM nunca produce geometría — emite JSON
  (`FloorPlan` v2); el sanitizador dispone y el motor TS dibuja determinista.
- **Toda cifra dimensional llega citada**: la tabla del prompt indica
  Neufert/Plazola/Panero; los gates citan NTC/NSR/RETIE/RAS como guía (no
  certificación).
- **Nada de texto protegido**: solo datos factuales y convenciones estándar de
  la industria, citando la obra.

## Próximas incorporaciones (backlog de KB)

- [ ] Módulo de escaleras (Blondel completo: tramos, descansos, huella real) — genera geometría `escalera`.
- [ ] Mobiliario mínimo por espacio (cama/mesa/sofá como bloques) — verificación de claros reales.
- [ ] Simbología eléctrica normalizada RETIE (no solo iniciales) y aparatos RAS como bloques 2D.
- [ ] Cortes/fachadas (Ching §secciones) cuando el motor tenga 3D/IFC.
