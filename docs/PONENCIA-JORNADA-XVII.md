# XVII Jornada Tecnológica — Análisis competitivo para la ponencia

**Evento:** XVII Jornada Tecnológica · XVII Encuentro Internacional en Nuevas Tecnologías — "Herramientas de la IA para la industria de la construcción"
**Fecha:** miércoles 28 de octubre de 2026, 6:00–9:50 p. m. (Colombia) · Virtual (Google Meet)
**Host:** Universidad Colegio Mayor de Cundinamarca — Tecnología en Gestión y Ejecución de Construcciones (CYGA)

---

## 1. Los co-ponentes (investigación verificada)

### Arq. Mg. Víctor Mayorga (México) — 7:00–7:40
*"Inteligencia Artificial en la gestión de la construcción: Nuevos modelos de trabajo y toma de decisiones"*

- Arquitecto CDMX (cédula 7590092, 2012). Docente UNITEC Campus Cuitláhuac ("Diseño Arquitectónico Digital Avanzado"). Fundador/director de **BIM GEAR Architecture & Design** (2017, 2–10 personas).
- Trayectoria REAL y verificable en **BIM para patrimonio**: congresos INAH 2017/2018; caso Antiguo Abasto de Pozos (Guanajuato) en Revit → **−50% del tiempo de documentación 2D/3D** (ese es su dato estrella, pre-IA). Propuesta institucional: que INAH/INBA exijan modelos BIM en licencias.
- Su frente AI 2025–26: **workshops "Revit + IA"** ($1.000 MXN, ~4 h) con el pitch *"¿Sigues modelando en Revit como en 2015? Mientras tú tardas 3 días, otros ya entregan en 3 horas con IA"* → AUTOMATIZAR (planos/tablas), VISUALIZAR (render en minutos), RESOLVER (optimizar). Frase de cierre: *"El arquitecto que no use IA, será reemplazado por el que sí."*
- **Sin publicaciones sobre IA** (su academia es pre-IA: UAM-X 2009/2014, INAH). Stack: Revit, AutoCAD, Photoshop, Plannerly. Su "Mg." no es verificable públicamente (probable UAM-X).

### PhD. Cynthia Ivonne Castro Cuadros (México) — 8:20–9:00
*"Estadística de la Industria de la construcción y cómo mejorar con Inteligencia Artificial" — Instituto Tecnológico de la Construcción*

- Doctora **recién graduada** (ago/2025) en "Innovación en Ambientes Locales", CIECAS–IPN. Día de hoy: **Senior PMO / Transformación Estratégica en FEMSA**. Credencial BIM (CENTRO). Sin publicaciones indexadas en construcción/IA (1 capítulo de libro Porrúa 2024).
- El **ITC es el instituto educativo de la CMIC** (Cámara Mexicana de la Construcción, fundado ~1983) — rol de ella en el ITC no verificado públicamente.
- Narrativa probable (de sus fuentes): **INEGI** — valor de producción constructora sube mientras empleo/horas están planas = **productividad por hora estancada**; la IA como palanca (planeación, estimación, menos reprocesos); IA **sobre** BIM (Estrategia BIM México 2021–2028); transferir el playbook PMO corporativo a la obra; advertencia de la brecha grande vs PyME.

### Dr. Rubén Darío Ochoa Arbeláez (Colombia) — 9:00–9:40 (cierre)
*Director General COPNIA*

- Director General COPNIA (firma desde ~2019), representante legal; decano de Ingenierías Uniagraria desde 2006; **Orden al Mérito Julio Garavito** (Oficial). Campaña institucional **"Transformando con ética"** + Cátedra Virtual de Ética.
- Posición COPNIA frente a IA (2026): **no hay directriz regulatoria única aún**, pero: **IV Foro Regional Antioquia 2026 — "Los desafíos y la ética de la inteligencia artificial en la ingeniería"** (Politécnico JIC, sep/2026); **Directriz 1 de 2026** (la ingeniería, por su incidencia en infraestructura/ambiente/salud/seguridad, está sometida a **control especial**); plan "Ingeniería con ética para la transformación social". Dogmática: la responsabilidad ética es **personal del profesional inscrito** — la herramienta no la traslada.

---

## 2. Lo que ellos PROPONEN vs lo que ObraHub TIENE (hoy, en producción)

| Dimensión | Mayorga (BIM GEAR) | Castro (ITC/CMIC) | **ObraHub (nosotros)** |
|---|---|---|---|
| Planos con IA | Enseña a AUTOMATIZAR en Revit (requiere licencia + expertise) | — | **Genera el set completo A-00…A-07 desde lenguaje natural**, DXF por capas ISO 13567 + PDF 700×500 mm a escala real, en minutos. Cero licencias CAD |
| Estructura | — | — | **Paquete S completo** (memoria gráfica NSR-10, cimentación, estructura por nivel, corte, detalles, despieces) + RETORNO del arquitecto — flujo de licencia real |
| BIM/3D | Revit (modelado manual+IA) | Habla de "IA sobre BIM" | **IFC4 generado y validado con ifcopenshell** (0 errores schema, GUIDs interoperables, cantidades 5D) + visor 3D vivo en el navegador |
| Certeza | "3 días → 3 horas" (taller) | Estadística INEGI | **Determinismo demostrable**: misma entrada → mismo byte; 93/93 checks; validadores INDEPENDIENTES (ezdxf, ifcopenshell, pypdf) |
| Contexto | México (INAH, CMIC) | México (INEGI, CMIC) | **Colombia**: NSR-10, CPNAA, RETIE/RAS, curaduría (D.1077), POT — el terreno de la audiencia y de COPNIA |
| Ética/responsabilidad | — | — | **Alineado con COPNIA por diseño**: "la IA piensa, los motores dibujan"; cada lámina declara *debe ser firmado por profesionales matriculados*; REVISÓ = *PENDIENTE DE REVISIÓN*; flujo con retorno profesional explícito |
| Productividad PyME | Talleres $1.000 MXN | Diagnóstico de brecha PyME | **Ataca la brecha**: el constructor pequeño pasa de 0 a expediente radicable desde el celular, sin Revit |

**Lectura honesta:** en trayectoria académica e institucional ellos pesan más (publicaciones UAM-X/INAH, doctorado IPN, dirección de COPNIA). En **producto tecnológico funcionando**, ObraHub está por delante de lo que cualquiera de los dos ponentes ha demostrado públicamente: ninguno muestra un sistema que emita el paquete A + paquete S + IFC validado desde lenguaje natural. No competir de tú a tú en títulos — **competir en demostración y evidencia**.

---

## 3. Guión de la ponencia (sugerido, 20–40 min)

1. **El problema (3 min)** — la estadística de Cynthia es TU apertura: en Colombia y México la producción crece con empleo plano (DANE/Camacol e INEGI); el cuello de botella de la PyME es la DOCUMENTACIÓN (planos, licencias, reprocesos). El constructor pequeño no tiene Revit, ni BIM, ni 3 días por lámina.
2. **Demo en vivo (10–15 min)** — el corazón. De la palabra al expediente:
   - Prompt: "Casa unifamiliar 1 piso, 3 habitaciones, Pereira" → plano con sanitizador visible (la IA propone, el motor geométrico decide — **cero alucinación**).
   - Mostrar el 3D vivo (arrastrar en 2D → se mueve el 3D) — es el momento "wow".
   - Bajar el **paquete arquitectónico PURO** (A-00 índice+localización, plantas, cortes POR LA ESCALERA, fachadas, cubiertas, acabados+detalles) y el **paquete estructural** (S-00 memoria con cargas NSR-10 → S-05 despieces) — explicar la secuencia de licencia: primero A puro, luego estructura, RETORNO del arquitecto, luego instalaciones.
   - Abrir el PDF a escala real y el IFC — "esto lo valida ifcopenshell/ezdxf/pypdf, no yo".
   - Sesión en la nube: cerrar el navegador, abrir "en otro dispositivo", el dibujo vuelve.
   - **Tener demo grabada de respaldo por si falla la conexión.**
3. **Los tres principios (5 min)** — el marco que nadie más trae:
   - **La IA piensa, los motores dibujan** (determinismo geométrico; misma entrada → mismo byte).
   - **Evidencia verificable** (validadores independientes, QA de plot por lámina: sin solapes, escalas reales, texto ≥2,5 mm).
   - **El profesional firma** (alineado con el discurso de COPNIA que cerrará la jornada: la responsabilidad es del matriculado; la herramienta la amplifica, no la reemplaza).
4. **Qué NO es (2 min)** — credibilidad: no reemplaza el cálculo estructural firmado ni el estudio de suelos; los despieces son esquemas que el ingeniero completa y firma; es RADICABLE como esquema/diseño preliminar que acelera la licencia.
5. **Cierre (2 min)** — la meta: que cada constructor de barrio acceda al estándar del grande. Invitar a los docentes a usarlo con estudiantes (flujo completo de licencia como cátedra).

### Preguntas duras esperadas (y respuesta)
- **"¿Y quién responde por un error?"** → El matriculado que firma — igual que hoy; nuestra lámina lo DICE. Además: sanitizador + puertas de verificación + validación independiente reducen el error de la herramienta al mínimo demostrable.
- **"¿La IA no alucina geometría?"** → Aquí no: la IA solo propone parámetros; motores deterministas construyen TODA la geometría (muestra: misma entrada → mismo byte).
- **"¿Esto quita empleo?"** → Democratiza: sube el piso de la PyME; el trabajo del delineante sube de dibujar a dirigir/revisar.
- **"¿Los datos salen del proyecto?"** → La sesión es del proyecto; sin permiso no se publica nada (kit explícito).

---

## 4. Números que puedes citar (todos verificables en repo/producción)
- 93/93 checks del motor DXF/PDF; QA geométrico de plot OK en **todas** las láminas (A + S) de 3 fixtures distintos.
- 48 entregables por QA (lámina a lámina, paquete A, paquete S, IFC, PDF) validados con **ezdxf / ifcopenshell / pypdf** (herramientas independientes, no nuestras).
- E2E en producción: **22/22** (login→proyecto→presupuesto→bitácora→RFI→sesión-nube→export ZIP/PPTX).
- PDF a **escala real 1:1** (700×500 mm exactos — se puede medir con regla).
- IFC4: 0 errores de schema, 13/13 vanos alojados y llenados, GUIDs interoperables con buildingSMART.

## 5. Después de la ponencia (roadmap)
1. **Fase 3 — MEP profesional** (I-01/I-02): circuitos C1..Cn con cuadro de tablero RETIE, tuberías AC/desagüe con pendientes, sub-capas ISO (cada línea ordenada y clasificada).
2. Checklist de licencia digital (F.U.N., CTL, suelos — ya es lista en el expediente).
3. Presupuesto/gantt alimentados por el MISMO modelo (5D) — cerrar el círculo con la estadística que presentará Cynthia: productividad medida, no prometida.
