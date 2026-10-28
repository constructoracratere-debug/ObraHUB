# ROADMAP DE SKILLS DE DISEÑO — ObraHub Diseño Arquitectónico

> Cada SKILL es un caso de uso **repetible y delimitado normativa y
> técnicamente**. Una skill se declara ACTIVA cuando su flujo, sus láminas y
> sus validaciones están probadas; las demás quedan en FASE DE PROYECCIÓN —
> **se declaran, no se improvisan**. La herramienta anuncia desde el inicio
> cuál está activa (banner del Diseño IA).

---

## ✅ SKILL 1 (ACTIVA) — Casas de 1 y 2 pisos · NSR-10 TÍTULO E

**Sistemas estructurales admitidos (elegidos por el ingeniero civil):**
| Sistema | Norma | Cuándo |
|---|---|---|
| **Mampostería confinada** | NSR-10 **E.3** | Default nacional: muros 0.12–0.15 + cadenas y columnas de confinamiento cada ≤4.0 m y en extremos/encuentros |
| **Bahareque encamisado en cemento** | NSR-10 **E.7** | Zona cafetera / madera local: estructura de madera + malla + repello en cemento |

**Qué entrega hoy (verificado, producción):**
- Paquete A **puramente arquitectónico** (A-00 índice+localización · A-01.x plantas con ACCESO marcado y escalera SUBE/LLEGADA/BAJA · A-02 cortes POR la escalera · A-03 fachadas+cuadro vanos · A-05 cubiertas · A-06 acabados · A-07 detalles D1–D4).
- Paquete **S** en archivo propio (S-00 memoria gráfica con cargas/combinaciones NSR-10 → S-05 despieces) — geometría calibrada para confinada.
- Flujo de licencia: Sitio → Boceto → Desarrollo constructor → Acabados (cierra A) → **Estructura** → **Retorno arquitectónico** → Instalaciones.
- IFC4 validado (ifcopenshell), DXF ISO por capas, PDF 700×500 a escala real, sesión en la nube.
- Gates: 1–2 pisos, acceso principal, escalera en ambos niveles, retícula ≥2 ejes.

**Pendiente dentro de la skill:** Fase 3 — MEP profesional (I-01/I-02: circuitos con cuadro de tablero RETIE, tuberías AC/desagüe con pendientes, sub-capas ISO). Detalles S-04/S-05 propios de bahareque (soleras, montantes, diagonales, esterilla) → se desarrollan junto con la Skill 4.

---

## 🔭 SKILL 2 (fase de proyección) — Vivienda VIS · planta tipo modular · 5–20 pisos

- **Estructura:** Título **F** (pórticos en acero / estructuras metálicas) o Título **C** (pórticos en concreto armado); además sistemas **modulares industrializados** sugeribles.
- **Producto:** torre/planta tipo repetible (módulo de apartmento), núcleos, cálculo de áreas por módulo, cuadro de tipologías.
- **Investigación requerida antes de construir:** NSR-10 C.14/C.21 y F (preferencias de diseño sísmico), Decreto 2060 de 2007 y régimen VIS (áreas mínimas), estándares de proyectos modulares (NEOM? no — Colombianos: decreta 4575/2009 mínimo de vivienda VIS… **tarea de investigación documentada al abrir la skill**).

## 🔭 SKILL 3 (fase de proyección) — Centros educativos

- **Base:** reutilizar la skill anterior (flujo, láminas, validaciones) **adaptada a la normativa educativa**.
- **Investigación exigida:** colegios con **planos públicos y memorias técnicas públicas** (contratación pública: SECOP, alcaldías, concesiones educativas), normativa de establecimientos educativos (Ley 115, NSR-10 grupo de uso III? **A.2.5** densidad de ocupación, retiros, accesibilidad NTC 6047, RESOLUCIÓN 0910 de salud ocupacional en planteles — **tarea de investigación al abrir**).
- Salidas: aulas tipo, zonas húmedas por bloque, plantas de bloque, cuadro de áreas por estudiante.

## 🔭 SKILL 4 (fase de proyección) — Timberframe y Guadua (casas en madera)

- **Dedicada específicamente a casas con los manuales de madera y guadua**:
  NSR-10 **Título G** (G.11 madera aserrada? — G.11/G.12; **G.12 guadua-bambú**),
  *Manual de construcción con bambú-guadua* (Villegas/Vélez — línea LIM/CAF),
  manual timber frame canadiense (CMHC) adaptado.
- **Referencia de arquitectos:** línea colombiana en madera y guadua — el
  usuario cita a **Álvarez**; ampliar con **Simón Vélez** y la escuela del
  eje cafetero (**tarea de investigación al abrir**: recopilar obras,
  detalles publicados y manuales).
- Aquí llega también el **despiece propio de bahareque encamisado (E.7)** de la Skill 1.

---

## Regla de oro entre skills
Nada de una skill futura se filtra en la activa: si el usuario pide 5 pisos,
la Skill 1 lo **declara** ("3+ pisos = Skill 2 — VIS · Títulos C/F, fase de
proyección") en vez de improvisar un sistema fuera de alcance. Gate:
`niveles-skill1`.
