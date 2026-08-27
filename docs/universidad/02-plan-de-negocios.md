# PLAN DE NEGOCIOS

## OBRahUB — Construction OS para LATAM

**Cratere S.A.S.** · Bogotá D.C., Colombia · 2026

---

## 1. RESUMEN EJECUTIVO

**ObraHub** es el sistema operativo de la construcción en español: una plataforma web que integra en un solo producto lo que hoy el constructor colombiano y latinoamericano hace con Excel, WhatsApp, PDF impresos y 3 herramientas extranjeras: gestión documental BIM, presupuestación APU con IA, cronograma con ruta crítica, bitácora legal, control de obra (Curva S/SPI-CPI) e interventoría con inteligencia artificial multimodal que cita la norma vigente.

**Problema:** las herramientas líderes (Procore, PlanGrid, Autodesk Construction Cloud) cuestan desde USD 375/mes por usuario, están en inglés y no conocen la NSR-10, el APU colombiano ni la bitácora con valor legal. El 95% de las constructoras de la región son MIPYMES que no pueden pagarlas.

**Solución:** freemium en español, contextualizada al régimen normativo local, con IA generativa como diferenciador. Construida sobre arquitectura serverless de bajo costo (Next.js + Supabase + Vercel + OpenAI).

**Oportunidad:** ~12.000 constructoras formales en Colombia + ~180.000 maestros de obra e independientes + 60.000+ estudiantes de construcción al año. Mercado LATAM ampliable (México: parametrización ya implementada).

**Modelo:** Freemium → Pro (COP 149.000/mes por empresa) → Business (COP 449.000/mes) → API Enterprise. Ingresos adicionales: informes premium y futura bolsa de trabajo ObraGo.

**Finanzas (escenario base):** inversión inicial COP 18 millones; punto de equilibrio en el mes 19 con 160 suscriptores Pro; VAN positivo (COP 96 M a 5 años, tasa 18%); TIR estimada 48%.

**Equipo:** Diego Orlando Pineda Escobar (constructor y gestor en arquitectura; Tec. Constr. Arq. UGC; Ing. Constructor ITC México) con soporte de Cratere S.A.S.

---

## 2. DESCRIPCIÓN DEL NEGOCIO

### 2.1 Misión
Dar a cada constructor de habla hispana —de la gran constructora al maestro de obra— las herramientas profesionales de gestión, control y normativa que hoy solo pueden pagar las multinacionales.

### 2.2 Visión
Ser el Construction OS estándar en Latinoamérica para 2031, con presencia en Colombia, México, Perú y Chile, y la base de datos profesional que alimente la bolsa de trabajo ObraGo.

### 2.3 Productos y servicios

| Módulo | Qué hace | Estado |
|--------|----------|--------|
| 📁 Documentos | Gestor con carpetas anidadas, visor BIM (IFC 3D), planos DWG/DXF, PDF, ZIP | ✅ En producción |
| 💰 Costos | Presupuestación APU con IA paramétrica por país (COP/AIU, MXN), precios reales | ✅ En producción |
| 📊 Seguimiento | Gantt con dependencias y ruta crítica CPM | ✅ En producción |
| 📔 Bitácora | Registro diario legal: clima, personal, equipo, avance por tarea, fotos | ✅ En producción |
| 📈 Control | Curva S, SPI/CPI, alertas automáticas (6 reglas), Excel/PPTX | ✅ En producción |
| 👁️ Interventor IA | Análisis multimodal (foto/voz/texto) con citas normativas y conversación | ✅ En producción |
| ⚖️ Vigilancia normativa | Escáner de 12 fuentes oficiales; nunca cita normas derogadas | ✅ En producción |
| 🔌 API pública v1 | Integración con ERPs y contabilidad | ✅ En producción |
| 🧰 Punch List / Órdenes de cambio / RFIs | Gestión de defectos y cambios | ✅ En producción |

**Propuesta de valor única:** el circuito cerrado *modelo BIM → cantidades → APU → cronograma → bitácora diaria → curva S → alertas → informe de asamblea*, en español, con la norma colombiana viva dentro del producto.

---

## 3. ANÁLISIS DEL SECTOR

- La construcción aporta ~7% del PIB colombiano (~COP 90 billones/año).
- Participación formal (Camacol, ANDI): ~3.000 afiliados; constructoras formales registradas ~12.000; MIPYMES = 95% del tejido.
- Vivienda: déficit habitacional acumulado ~3,8 millones de unidades (MinVivienda, DANE); programas VIS/VIP mantienen demanda estructural.
- Plan Nacional de Desarrollo 2022-2026 y planes de vivienda impulsan ejecución pública.
- Digitalización del sector: acelerada por pandemia y por exigencias de control de recursos públicos (SECOP II obligatorio).
- Tras el terremoto de agosto 2026, la revisión estructural y la rehabilitación de edificaciones existentes (Decreto 1711/2021 - AIS) entrarán en demanda alta: mercado directo para ObraHub.

**Tendencias clave:** BIM obligatorio gradual en licitaciones públicas; IA generativa adoptada primero por MIPYMES por costo-accesibilidad; trabajo móvil (PWA) preferido en obra.

---

## 4. ESTUDIO DE MERCADO

### 4.1 Segmentación y tamaño (Colombia)

| Segmento | Tamaño | Dolor principal | Disposición de pago |
|----------|--------|-----------------|---------------------|
| Constructoras pequeñas y medianas (5-50 empleados) | ~12.000 empresas | Desviaciones de presupuesto/plazo, papeleo | Media-alta (COP 100-300k/mes) |
| Interventorías y firmas de supervisión | ~2.500 firmas | Evidencia, informes, RAG normativo | Alta (COP 300-500k/mes) |
| Constructoras/independientes (1-4 personas) | ~180.000 | Todo: presupuesto, norma, control | Baja (freemium → complementos) |
| Estudiantes y docentes (arquitectura, ingeniería, construcción) | ~60.000 activos | Aprender con herramientas reales | Muy baja (futuros clientes) |
| Entidades públicas (oficinas de control, alcaldías) | ~1.100 municipios | Trazabilidad de recursos | Media (convenios) |

**SAM conservador (Colombia):** 12.000 × penetración 2% a 5 años = 240 empresas de pago + ecosistema freemium.

### 4.2 Competencia

| Competidor | Precio | Debilidad frente a ObraHub |
|------------|--------|----------------------------|
| Procore (EE. UU.) | Desde USD 375/usuario/mes | Precio, inglés, sin NSR-10/APU local |
| Autodesk Construction Cloud | USD 410+/mes | Precio, complejidad, sin bitácora legal local |
| PlanGrid / Buildertrend | USD 100-350/mes | Sin norma colombiana, sin IA visual |
| Aplazados locales (Excel, hojas propias) | $0 | Sin integración, sin evidencia, sin control |
| Bulldozer/Obra 24 (apps locales puntuales) | USD 30-90 | Puntuales (una sola función), sin circuito completo |

**Ventaja competitiva sostenible:** (1) barrera normativa — la base de vigilancia legal colombiana es difícil de replicar por extranjeros; (2) datos de precios APU locales vivos; (3) IA multimodal en español con protocolo de interventoría; (4) costo serverless 10x menor que arquitectura tradicional.

### 4.3 Cliente objetivo inicial (ICP)
Constructora/interventoría bogotana o medellinense de 5-30 personas, con 2-6 obras simultáneas, que hoy pierde 10+ horas semanales en Excel y reportes.

---

## 5. MODELO DE NEGOCIO (Canvas)

| Bloque | Contenido |
|--------|-----------|
| **Segmentos** | Constructoras MIPYME; interventorías; independientes; academia; entidades públicas |
| **Propuesta de valor** | Construction OS en español: BIM+APU+Gantt+Bitácora+Control+Interventor IA con NSR-10 viva; freemium real |
| **Canales** | Web/PWA directa; alianzas Camacol/COINSAP; universidades; contenido (noticias del sector integradas); referidos |
| **Relación** | Autoservicio con onboarding guiado; soporte humano en planes pagos; comunidad |
| **Ingresos** | Suscripción Pro 149k/mes · Business 449k/mes · API enterprise · informes premium · (futuro) ObraGo |
| **Recursos clave** | Plataforma (activos intangibles: código, base normativa, base de precios); marca; datos de uso |
| **Actividades clave** | Desarrollo de producto; vigilancia normativa continua; venta y alianzas; soporte |
| **Alianzas clave** | Cratere S.A.S. (respaldo); proveedores cloud (Vercel/Supabase/OpenAI); gremios; universidades |
| **Costos** | Infraestructura variable (serverless); IA por uso; personas; marketing digital |
| **Estructura de costos** | ~70% variable por usuario → escalamiento con margen |

---

## 6. ESTRATEGIA DE MARKETING

**Posicionamiento:** *"La obra bajo control — en español, con la norma viva."*

**Lanzamiento (meses 1-6):** producto gratuito abierto; 3 pilotos con constructoras aliadas (casos de estudio medibles); demo para docentes en Unicolmayor y facultades aliadas; publicación del pitch.

**Crecimiento (meses 6-18):** SEO técnico ("presupuesto APU con IA", "bitácora de obra digital", "NSR-10 online"); webinar mensual; programa de referidos (1 mes gratis); contenido de vigilancia normativa como imán (informe quincenal gratuito); alianza con Camacol regional.

**Consolidación (meses 18-36):** marketplace de plantillas APU; convenios con universidades (licencia académica); entrada a México con distribuidor local; ObraGo (bolsa de trabajo) como motor de red.

**Métricas clave:** activación (1er presupuesto creado), conversión free→pago (meta 4%), churn mensual (<3,5%), CAC (meta < COP 180.000), LTV (> COP 1.400.000).

---

## 7. PLAN DE OPERACIONES

- **Producción de software:** desarrollo continuo (1 desarrollador principal + IA copilotos); releases semanales; suite E2E automatizada de 17 pruebas antes de cada deploy.
- **Vigilancia normativa:** crons diarios/semanales sobre 12 fuentes oficiales (MinVivienda, SGC, ICONTEC, Camacol, Congreso...) con clasificación por IA.
- **Soporte:** tickets por correo + chat; SLA 48h (Pro) / 12h (Business).
- **Infraestructura:** Vercel (frontend/API), Supabase (Postgres+RLS+Storage+Auth), OpenAI (IA), Resend (email). Costo 100% variable y monitoreado (alertas de presupuesto).

---

## 8. ESTRUCTURA ORGANIZACIONAL Y LEGAL

**Empresa:** Cratere S.A.S. (constituida; NIT activo) — objeto: tecnología para construcción.

| Rol (inicio) | Responsabilidad |
|--------------|-----------------|
| Diego O. Pineda E. — Gerente/CTO | Producto, tecnología, estrategia |
| Apoyo contable (outsourcing) | Contabilidad, impuestos |
| Apoyo comercial (desde mes 9) | Ventas y alianzas |

**Cumplimiento:** Habeas Data (Ley 1581/2012) — política de privacidad y tratamiento de datos; términos de servicio; respaldo diario de base de datos; contratos de orden de compra para planes anuales.

---

## 9. ESTUDIO FINANCIERO (resumen — detalle en documento 03)

| Concepto | Valor |
|----------|-------|
| Inversión inicial | COP 18.000.000 |
| **Valor comercial del producto** | **COP 25.000.000** |
| Costos fijos mensuales (año 1) | COP 2.100.000 |
| Precio Pro / Business | COP 149.000 / 449.000 por mes |
| Punto de equilibrio | Mes 19 (~160 suscriptores Pro equivalentes) |
| Proyección ingresos año 3 | COP 540 millones |
| VAN (5 años, 18%) | COP +96 millones |
| TIR estimada | ~48% |

---

## 10. ANÁLISIS DE RIESGOS Y MITIGACIÓN

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Costos de IA crecen más rápido que ingresos | Media | Alto | Caché de respuestas, modelos por lotes, límites por plan |
| Entrada de competidor extranjero localizado | Media | Alto | Barrera normativa + velocidad + precio |
| Adopción lenta (resistencia al cambio) | Media | Medio | Freemium, capacitación, pilotos medibles |
| Dependencia de terceros cloud | Baja | Medio | Arquitectura portable (Postgres estándar) |
| Cambio regulatorio de IA/datos | Baja | Medio | Cumplimiento desde el diseño, datos en región |
| Concen­tración de ventas en pocos clientes | Media | Medio | Estrategia long-tail de MIPYMES |

---

## 11. IMPACTO

**Social:** profesionalización del constructor pequeño; reducción de riesgo sísmico en autoconstrucción (interventor IA gratuito); formalización laboral de maestros.

**Tecnológico:** primer Construction OS LATAM con vigilancia normativa automática y evidencia contra normas derogadas.

**Académico:** material vivo de enseñanza para programas de construcción y arquitectura.
