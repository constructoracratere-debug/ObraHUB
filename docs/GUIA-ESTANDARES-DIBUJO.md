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
| `A-MUROS`, `A-CORTE` | A | **0.70** | CONTINUOUS | 7 | Elementos cortados a 1.20 m — línea más gruesa del plano. El ACHURADO del poché vive EN A-MUROS (370 propio de la fila achu): apagar muros apaga su hatch |
| `A-PUERTAS`, `A-VENTANAS`, `A-MOBILIARIO`, `A-SANITARIOS`, `A-FACHADA`, `A-ROTULO` | A | 0.35 | CONTINUOUS | variable | Perfiles visos no cortados |
| `I-ELECTRICO` | I | 0.25 | DASHED | 2 | MEP eléctrico (RETIE) |
| `I-HIDRAULICO` | I | 0.25 | DASHED | 4 | MEP hidrosanitario (RAS) |
| `S-COLUMNAS`, `S-VIGAS`, `S-LOSAS`, `S-CIMENTACION` | S | 0.70 | CONTINUOUS | 8 | Estructura POR TIPO (control fino en CAD) |
| `A-EJES` | A | 0.13 | **CENTER** (punto-raya) | 1 | Retícula de ejes: centros de columnas, vigas, muros |
| `A-COTAS` | A | 0.13 | CONTINUOUS | 3 | Cotas y líneas de extensión |
| `A-TEXTOS` | A | 0.13 | CONTINUOUS | 7 | Nombres de espacio, notas, áreas |

**Capas GLOBALES por categoría — regla de uso real (review #11)**: el nivel
NO crea capas (`A-MUROS-N2` PROHIBIDO). Apagar `A-MUROS` debe apagar TODOS
los muros de TODOS los niveles y SU achurado; cada primitiva vive en la capa
de su categoría, sin huérfanas ni genéricas. La separación por nivel es por
LÁMINA (A-01, A-01.2…), no por capa. Texto con STYLE explícito portable
(`OBRAHUB` · txt.shx) y el DXF se exporta también **por lámina**
(`planToDxfSheets`: un archivo 700×500 en origen cada uno — imprimir una
lámina nunca reduce el set completo).

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

**Mapa de estilos explícito (los TRES salidores)**: `CONTINUA` ·
`DISCONTINUA` (proyecciones, cuerdas de puertas) · `PUNTO-RAYA` (ejes —
siempre con el punto, jamás guion simple). DXF: linetype de entidad
DASHED/CENTER; pantalla y PDF: `dashOf()` con el mismo mapa semántico por
capa. La lámina A-00 muestra muestras REALES de cada estilo (con sus
flags) — sin pesos hardcodeados que varían por escala.

**Jerarquía implementada** (manual de dibujo arquitectónico profesional +
ejemplos de la guía): lo cortado/cercano = grueso.

> Nota de la guía (§2.6): hoy se recomienda **no abusar** del cambio de
> espesor y diferenciar con **gamas de grises/opacidad** cuando el medio lo
> permita (SVG/render). En DXF mantenemos plumillas físicas porque la
> impresión láser/ploter las exige.
>
> **Plumilla por CAPA (código 370), no por CTB**: el DXF declara el grosor
> en cada LAYER (centésimas de mm) y, desde la tabla de impresión, en cada
> ENTIDAD — independiente de la tabla de estilos de trazado del usuario.
> Con "print lineweights by layer" activado (default en
> AutoCAD/BricsCAD/LibreCAD) la salida es consistente sin archivo CTB.

### Tabla de impresión CPNAA §4.3 (págs. 100-101) — OBLIGATORIA

El libro publica una tabla de **mm de papel por capa y por escala de
impresión** (estándar para **blanco y negro, solo líneas**). Es la fuente
única de grosor en ObraHub (`GUIDE_PRINT_TABLE` + `plotMm()` en
`lib/design/knowledge.ts`), interpolando la escala normalizada más cercana:

| Clase (filas guía) | 1:20 | 1:50 | 1:100 | 1:200 | 1:500 | Nuestras capas |
|---|---|---|---|---|---|---|
| cut (A-MURO/-EXT/-DINT, A-COLS) | 0.70 | 0.60 | 0.50 | 0.25 | 0.15 | A-MUROS, A-CORTE, S-ELEMENTOS |
| achu (A-MURO-ACHU) | 0.40 | 0.30 | 0.20 | 0.25 | 0.15 | rayado del poché — SOBRE A-MUROS, con 370 propio por entidad |
| cubt (A-CUBT) | 0.50 | 0.40 | 0.40 | 0.30 | 0.20 | A-FACHADA-* |
| profile (A-CARP, A-MUEB, A-PUER, A-VENT) | 0.25 | 0.18 | 0.18 | 0.15 | 0.13 | A-PUERTAS/VENTANAS/MOBILIARIO/SANITARIOS |
| elec (A-ELEC) | 0.18 | 0.18 | 0.10 | 0.10 | 0.10 | I-ELECTRICO |
| hid (A-HID) | 0.15 | 0.13 | 0.10 | 0.10 | 0.10 | I-HIDRAULICO |
| ejes (A-EJES) | 0.18 | 0.18 | 0.18 | 0.13 | 0.13 | A-EJES |
| text (A-TEXT* — constante) | 0.20 | 0.20 | 0.20 | 0.20 | 0.20 | A-TEXTOS, A-COTAS, A-ROTULO* |

Reglas de la guía sobre la tabla:
- El grosor **depende de la escala**: el mismo dibujo impreso a dos escalas
  pide espesores distintos o pierde resolución.
- Recomendado verificar capas con **plantillas prediseñadas** (nuestro
  equivalente: la tabla en código + tests que la testifican).
- Aplica a **CAD**; en BIM las variables vienen preconfiguradas.
- La tabla gobierna los DOS salidores físicos con el MISMO VALOR de
  tabla: PDF de impresión (mm reales a 1:den) y DXF (código 370 por
  entidad a la escala de su lámina). El DXF redondea a 0.01 mm —
  diferencias ≤0.01 mm entre formatos, aceptadas. La PANTALLA comparte
  las CLASES y el factor thin (jerarquía de la misma tabla) pero dibuja
  en píxeles constantes (`PEN_PX`): es un medio zoomable, no papel — no
  persigas la igualdad numérica pantalla↔impresión.

**Política 370 — decidida y testificada**: la ENTIDAD lleva el plot real
(mm de la tabla a la escala de SU lámina); la TABLA de capa conserva el
default de plantilla ISO (0.70/0.35/0.25/0.13). Así el archivo imprime
correcto tal cual se genera y, si alguien edita en CAD, la plantilla lo
devuelve a una jerarquía sana. Los flags de primitiva (`thin`, `dash`)
pasan a los tres salidores por igual: `thin` = un paso abajo (×0.72),
`dash` = DASHED (los ejes conservan CENTER, punto-raya de la guía).

**Poché vs símbolo — dos semánticas de F**: el rect relleno `F` sobre
**MUROS** es POCHÉ: contorno + rayado 45° a espaciado de PAPEL constante
(1.4 mm, fila achu) idéntico en PDF y DXF; la decisión hatch/sólido usa
el GROSOR REAL de la banda (el menor de w/h — una banda vertical mide su
espesor en w) — bajo 1.6 mm impresos va SÓLIDA. Un `F` pequeño en OTRA
capa (manija de puerta, marca de corte, zapata) es un SÍMBOLO: relleno
MACIZO — `SOLID` en DXF, fill en PDF — jamás achurado. La pantalla puede
usar tono (medio interactivo); la impresión no miente.

**`thin` unificado**: ×0.72 en los TRES salidores (PDF, DXF, pantalla) —
un paso abajo de la serie, la MISMA proporción en px y en mm. El DXF
redondea a centésimas de mm (código 370 entero): 0.20 × 0.72 = 0.144 →
0.14; diferencia ≤0.01 mm con el PDF, aceptada y documentada en el
protocolo de calibración.

**Calibración permanente** (cautela de la guía §2.6): la tabla es el punto
de partida, no el veredicto — con cada formato nuevo se compara UNA lámina
impresa contra su DXF a la misma escala, midiendo con regla el `1:den` y
la barra gráfica, y revisando legibilidad de cortes, ejes, cotas, textos y
proyecciones en zonas densas. La guía recomienda moderación con los
cambios de grosor; ajustar con evidencia de impresión, no de pantalla.

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
- **La anotación responde a la escala** (§2.5): textos, cotas y achurados
  viven a TAMAÑO DE PAPEL constante — piso de texto 2.5 mm impresos
  (`ANNOT.minTextMm`; exentos documentados: numerales de barra de escala,
  letras en símbolos MEP y tagline del cajetín, a 2.2), y el rayado del
  poché usa espaciado de PAPEL constante 1.4 mm (`HATCH.spacingMm`) —
  banda cuyo grosor real imprime <1.6 mm va SÓLIDA. El ajuste de escala
  de lámina se mide con los TAMAÑOS FINALES del texto (`fitSheetScale`,
  rotación-aware) — 1:50, 1:100 y 1:200 salen igual de legibles y SIN
  desbordes: el texto agrandado ya estaba dentro del fit.
- Motor: escala de texto/cotas **no cambia** con la escala del dibujo (la
  anotación es a tamaño papel constante); solo cambia la geometría. Serie
  auto-fit de lámina: `50, 75, 100, 125, 150, 200`.
- **Garantía de escala en impresión**: las láminas viven en espacio modelo
  a **1:1 en mm** (INSUNITS 4, marco 700×500 real). Plotear "extents" al
  100% (1:1) reproduce EXACTAMENTE la escala declarada — no hay que
  configurar viewport de paper space. La escala del rótulo es la real del
  contenido geométrico.

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
| 0 | **Índice del set + simbología** (§2.8) | A-00 — abre el paquete: índice, líneas, convenciones, MEP |
| 1 | Plantas | A-01 planta arquitectónica + cuadro de áreas (A-01.2… por nivel) |
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
  El PDF de impresión ofrece **ISO A1/A2 como opción de export** (§4.1);
  OBRAHUB 700×500 es el default de oficina.
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
- Fecha ISO; DIBUJÓ = `OBRAHUB DISEÑO IA`; **REVISÓ = "PENDIENTE DE
  REVISIÓN" hasta que un profesional matriculado revise y firme de verdad**
  (§4.2: la autoría/revisión del documento es información, no decoración —
  la responsabilidad profesional no la tiene la IA).
- **Fecha de producción la pasa quien llama** (`planToDxf(plan, { fecha })`):
  el motor es determinista puro (misma entrada → mismo byte, cualquier día);
  la UI registra la fecha al momento de generar el archivo.

## 9. Checklist de cumplimiento (todo PR que dibuje)

- [ ] Capas con disciplina + grosor + linetype de la tabla §1; cero entidades
      en capa `0` o fantasma (lo exige `scripts/test-design-dxf.mjs`).
- [ ] Ejes CENTER, proyecciones/MEP DASHED, cortes 0.70 (§2).
- [ ] Escala numérica + gráfica en cada lámina; serie normativa (§3).
- [ ] **Escala VERDADERA en impresión**: la lámina PDF se compone a mm de
      papel (700×500, marco 5/10) y el contenido mide exactamente sx·k mm —
      el `1:den` del cajetín se puede comprobar con regla (§3, §4.3).
- [ ] Grosor de línea por tabla CPNAA §4.3 a la escala de la lámina
      (SVG, PDF y DXF resuelven de la MISMA `plotMm`).
- [ ] **Anotación a tamaño papel**: texto ≥2.5 mm impresos, achurado a
      espaciado papel constante, banda <1.6 mm → poché sólido (§2.5).
- [ ] **A-00 abre el set**: índice + simbología de líneas + convenciones
      (§2.8); numerales de cota sin traslape en su renglón (§2.7).
- [ ] **REVISÓ veraz**: "PENDIENTE DE REVISIÓN" hasta firma profesional.
- [ ] **Vanos reales**: puertas y ventanas son HUECOS en el muro con
      jambas — jamás símbolos sobre banda continua (§2.3).
- [ ] Cotas jerárquicas afuera, numerales al punto medio, sin traslape (§4).
- [ ] Flecha norte en toda planta (§5).
- [ ] Símbolos MEP explicados: leyenda SIMBOLOGÍA MEP en la lámina de
      planta, con los tipos realmente presentes (§Símbolos).
- [ ] Lámina 700×500, margen doble 5/10, rótulo 185 mm con ID en ambos
      extremos (§7-8).
- [ ] El plano está LIMPIO: la mínima cantidad de líneas suficiente — sin
      reiteraciones ni información no requerida (§2.4 "los dibujos son
      representaciones abstractas").
- [ ] `npm run verify` + `node scripts/test-design-dxf.mjs` verdes.
