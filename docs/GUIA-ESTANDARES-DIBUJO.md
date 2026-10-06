# 📕 EL LIBRO OBLIGATORIO — Guía y Estándares Gráficos del Proyecto Arquitectónico

> **MANDATORIO.** Todo dibujo que produzca ObraHub (DXF, SVG, IFC/3D, PDF) se
> rige por ESTE documento. Fuente: *Guía y Estándares Gráficos del Proyecto
> Arquitectónico* — CPNAA (Consejo Profesional Nacional de Arquitectura y sus
> Auxiliares), que adopta **ISO 13567** (capas), **ISO 216** (formatos) e
> **ICONTEC** como marco nacional. Original del usuario:
> `GuiaEstandaresDigital.pdf` (106 págs). Texto íntegro extraído en
> `docs/guia-cpnaa-texto.txt`.
>
> Si un cambio de motor contradice este libro, el cambio está mal. Si el libro
> y la realidad normativa chocan, el humano (Diego / ing. matriculado) decide.

---

## 1. Sistema de capas — ISO 13567 (guía §2.2)

Nombre de capa = **Disciplina − Grupo Principal − Grupo Secundario (opcional)**.
Disciplina es un código de un carácter. Tabla canónica de ObraHub
(`lib/design/dxf.ts → cad()/layerOf()`):

| Capa | Disciplina | Grosor (mm) | Linetype | Color ACAD | Uso |
|---|---|---|---|---|---|
| `A-MUROS`, `A-CORTE` | A | **0.70** | CONTINUOUS | 7 | Elementos cortados a 1.20 m — línea más gruesa del plano |
| `A-PUERTAS`, `A-VENTANAS`, `A-MOBILIARIO`, `A-SANITARIOS`, `A-FACHADA`, `A-ROTULO` | A | 0.35 | CONTINUOUS | variable | Perfiles visos no cortados |
| `I-ELECTRICO` | I | 0.25 | DASHED | 2 | MEP eléctrico (RETIE) |
| `I-HIDRAULICO` | I | 0.25 | DASHED | 4 | MEP hidrosanitario (RAS) |
| `S-ELEMENTOS` | S | 0.70 | CONTINUOUS | 8 | Estructura cortada (concreto/acero) |
| `A-EJES` | A | 0.13 | **CENTER** (punto-raya) | 1 | Retícula de ejes: centros de columnas, vigas, muros |
| `A-COTAS` | A | 0.13 | CONTINUOUS | 3 | Cotas y líneas de extensión |
| `A-TEXTOS` | A | 0.13 | CONTINUOUS | 7 | Nombres de espacio, notas, áreas |

Reglas de la guía:
- Cualquier combinación razonable de grupos es posible **siempre que la
  identificación sea rápida y sostenida**. Nunca capas sueltas sin disciplina.
- En BIM las capas vienen preconfiguradas: mapear IFC→capas por
  `IfcTypeObject`, no por nombre libre.

## 2. Tipos de línea (guía §2.6) y jerarquía de plumillas

Definiciones normativas (texto CPNAA):
- **Flechas de indicación**: continuas, terminadas en punta; nunca se cruzan
  entre sí ni (de ser posible) con líneas de cota.
- **Línea de corte**: indica el corte entre componentes o niveles; exige
  esquema de posición de corte en un plano general.
- **Línea de ejes**: *delgada, interrumpida por un espacio con un punto* →
  **CENTER** (patrón 12−3−2−3 en nuestro DXF).
- **Línea de cotas**: dos extensiones perpendiculares + línea con numeral al
  punto medio; intersección marcada con tick oblicuo 45° o círculo.
- **Línea de proyección**: *delgada intermitente* → DASHED (dintel de puerta,
  alero proyectado).
- **Línea de límite de construcción / línea de empate**: delimitan
  intervención y fragmentos entre planchas (con plano clave).

**Jerarquía ISO 128 que implementamos** (manual de dibujo arquitectónico
profesional + ejemplos de la guía): lo cortado/cercano = grueso.

| Nivel | Plumilla | Uso |
|---|---|---|
| 1 | 0.70 mm | Cortes en planta (muros, estructura) |
| 2 | 0.35 mm | Perfiles y contornos visos, rótulo |
| 3 | 0.25 mm | MEP, mobiliario, sanitarios |
| 4 | 0.13 mm | Ejes, cotas, textos, achurados |

> Nota de la guía (§2.6): hoy se recomienda **no abusar** del cambio de
> espesor y diferenciar con **gamas de grises/opacidad** cuando el medio lo
> permita (SVG/render). En DXF mantenemos las 4 plumillas físicas porque la
> impresión láser/ploter las exige.

## 3. Escalas (guía §2.5)

Serie métrica normativa y su uso (tabla literal de la guía):

| Escala | Uso |
|---|---|
| 1:5000 / 1:2000 / 1:1000 | Lote: urbano, localización, proyecto |
| 1:500 | Planos generales |
| 1:250–200 / 1:100 | Plantas, alzados exteriores, cortes |
| **1:50** | Plantas de piso, alzados y cortes ← escala base ObraHub |
| 1:20 | Plantas ampliadas, secciones de muro, cimientos, cortes de fachada |
| 1:10 / 1:5 / 1:2 | Detalles de mampostería, puertas/ventanas, gabinetes |

- La escala se expresa **numérica** (p.ej. `1:50`) y se **complementa con
  escala gráfica** (nuestro `scaleBar` 1+1+3 m).
- Motor: escala de texto/cotas **no cambia** con la escala del dibujo (la
  anotación es a tamaño papel constante); solo cambia la geometría. Serie
  auto-fit de lámina: `50, 75, 100, 125, 150, 200`.

## 4. Acotación (guía §2.7)

1. **Jerarquía: de lo general a lo específico, de afuera hacia adentro.**
   Primero distancias totales, luego retícula de ejes (o piso a piso en
   cortes), luego elementos.
2. Cotas **por fuera** de la ilustración; minimizar cruces y traslapes.
3. Hileras paralelas y continuas; separación suficiente para que el numeral
   nunca choque con la siguiente hilera.
4. Numeral al **punto medio, sobre la línea** de dimensión; tamaño ligado al
   texto del dibujo.
5. Cada elemento se relaciona al **sistema de ejes** (plantas) o a la
   **nivelación general** (cortes/fachadas). Incluir siempre la dimensión
   entre borde del edificio y el eje más cercano.
6. Pórticos/marcos de acero: dimensionar entre ejes de columnas. Concreto
   multi-piso: perimetrales a cara de columna.
7. Restauración/remodelación: cotas solo de obra nueva, referidas a punto
   fijo; lo no determinable → **VEC** (Verificar En Campo).

## 5. Orientación (guía §2.4)

- **Flecha Norte en TODAS las plantas**, consistente en todo el conjunto de
  planos (dentro de la diagramación o del rótulo).
- Norte hacia la parte alta de la plancha (criterio cartográfico); retícula
  de ejes paralela al formato; orientación en el primer cuadrante.
- La planta general del piso principal fija la orientación de todas las
  demás. Planta entera en una sola plancha; si se fragmenta → planta clave +
  líneas de empate.

## 6. Tipos de plancha (guía §2.8–2.15)

| Tipo | Contenido | Código ObraHub |
|---|---|---|
| 1 | Plantas | A-01 planta arquitectónica + cuadro de áreas |
| 2 | Alzados/fachadas | A-03 (4 fachadas) |
| 3 | Cortes | A-02 (cortes A-A′/B-B′ con niveles) |
| 4 | Vistas escala ampliada | — (futuro) |
| 5 | Detalles | — (futuro) |
| 6 | Cuadros y diagramas | cuadro de áreas en A-01, cuadros puertas/ventanas (backlog) |
| 7-8 | Definido por el usuario | — |
| 9 | Representaciones 3D | visor IFC del kit |
| — | Estructura | A-04 · Cubiertas | A-05 |

## 7. Presentación de documentos (guía §4.1)

- Formatos ISO 216 (A0…A7) para uso general. **Formato adoptado por ObraHub:
  700×500 mm horizontal** (rótulo estándar del usuario, rebranded OBRAHUB en
  vez de universidad). Láminas espaciadas 50 mm en el modelo (750 de pitch).
- La plancha se divide en **tres áreas**: bloques de dibujo, **rótulo** y
  bloque de notas (opcional, junto al rótulo).
- Retícula de diagramación: **15 cm entre ejes virtuales**, etiquetada con
  letras (verticales) y números (horizontales), **fuera del área de trabajo**.
- Margen doble: 5 mm exterior fino + 10 mm interior grueso.

## 8. El rótulo (guía §4.2)

Anatomía normativa (franja vertical en el borde derecho, a toda altura):

1. **Identificación de plancha en AMBOS extremos** (arriba y abajo del
   rótulo): disciplina + tipo + número frente al total (`A-01 1/5`).
2. **Título de plancha**: contenido, escala de los dibujos, fecha de
   producción, identificación del archivo digital.
3. Zonas complementarias según pertinencia: logo/diseñador, proyecto,
   convenciones, materiales, modificaciones (revisión), colaboradores,
   planos de referencia, contenido, escala/fecha, firma.

Implementación OBRAHUB (`rotulo()` en `lib/design/dxf.ts`, franja 185 mm):

```
┌────────────────────────────┐  alto de arriba abajo:
│ OBRAHUB (h10) + tagline+fecha│ 30 mm  banda marca
│ PROYECTO (2 líneas)          │ 26 mm
│ UBICACIÓN                    │ 16 mm
│ CONTENIDO (código lámina)    │ 34 mm
│ ESCALA | UNIDADES            │ grid
│ DIBUJÓ | REVISÓ              │ grid
│ LÁMINA n/total               │
│ norte + escala gráfica       │ 40 mm
└────────────────────────────┘
```

- Textos del rótulo SIEMPRE legibles a escala papel (h≥2.5 mm), códigos h≥4.
- Fecha ISO; DIBUJÓ = `OBRAHUB DISEÑO IA`; REVISÓ = `ING. MATRICULADO`
  (espacio para firma — la responsabilidad profesional no la tiene la IA).

## 9. Checklist de cumplimiento (todo PR que dibuje)

- [ ] Capas con disciplina + grosor + linetype de la tabla §1; cero entidades
      en capa `0` o fantasma (lo exige `scripts/test-design-dxf.mjs`).
- [ ] Ejes CENTER, proyecciones/MEP DASHED, cortes 0.70 (§2).
- [ ] Escala numérica + gráfica en cada lámina; serie normativa (§3).
- [ ] Cotas jerárquicas afuera, numerales al punto medio, sin traslape (§4).
- [ ] Flecha norte en toda planta (§5).
- [ ] Lámina 700×500, margen doble 5/10, rótulo 185 mm con ID en ambos
      extremos (§7-8).
- [ ] El plano está LIMPIO: la mínima cantidad de líneas suficiente — sin
      reiteraciones ni información no requerida (§2.4 "los dibujos son
      representaciones abstractas").
- [ ] `npm run verify` + `node scripts/test-design-dxf.mjs` verdes.
