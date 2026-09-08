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

### 4.1 Segmentación y tamaño (Colombia) — 4 segmentos objetivo

**Contexto del mercado:** las constructoras colombianas facturaron **$91,78 billones en 2025** y las 10 más grandes concentraron $16,61 billones (margen 13,47%); solo vivienda (Camacol) sumó $14,68 billones entre las 20 líderes. El Estado ejecuta planes de infraestructura de $7,1+ billones (ANI/INVÍAS) y $8,42 billones en infraestructura educativa. El mercado paga — el problema es a quién, cómo y con qué discurso.

#### Segmento 1 · Constructoras (grandes y medianas)

Top-10 Colombia (ranking Supersociedades/Portafolio 2025 + líderes históricos Camacol):

| # | Empresa | Ingresos/nota | Por qué compra ObraHub |
|---|---------|---------------|------------------------|
| 1 | Metro Línea 1 (concesión Metro Bogotá) | $1,47 billones | Control de obra multi-contratista, evidencia para interventoría |
| 2 | Marval | $1,21 billones (vivienda) | Estandarización de proyectos + bitácora legal |
| 3 | Amarilo | $2,3 billones (vivienda) | Presupuesto APU vivo + control de desviaciones |
| 4 | Constructora Capital | podio vivienda 2025 | Licencias + paquete arquitectónico IA |
| 5 | Jaramillo Mora (Cali) | $1,02 billones | Supervisión regional de obras |
| 6 | Conconcreto | líder histórico EPC | Interventoría NSR-10, RAG |
| 7 | Constructora Bolívar | líder histórico vivienda | Gestión de portafolio de obras |
| 8 | Ospinas & Cía | 70+ años proyectos | Digitalización del ciclo A-Z |
| 9 | Prodesa ( Grupo Provivienda) | urbanizador VIP/VIS | Costeo VIS + cronogramas 4D |
| 10 | MIPYME Camacol (5-50 empleados) | ~12.000 empresas | TODO: es el ICP natural |

**Cómo se ofrece:** venta directa B2B a dirección de operaciones/PMO (demos con NDA y piloto de 1 obra). A las grandes: módulo de interventoría + evidencia multimodal; a las MIPYME: el circuito completo.
**Cómo se gana dinero:** SaaS por obra activa (no por asiento — las obras rotan): Plan Obra COP 400-800k/mes para grandes; COP 150-300k/mes MIPYME. Piloto pago de 2-3 meses con métrica contractual: −10% horas de reporte, −5% desviación de presupuesto. **Un cliente grande ≈ 20 MIPYME en ingreso.**

#### Segmento 2 · Instituciones gubernamentales

Top-10 entidades con presupuesto de obra/tecnología:

| # | Entidad | Palanca de venta |
|---|---------|------------------|
| 1 | MinTIC | Compra de tecnología TIC (SECOP II, licitación pública) — ObraHub como plataforma de gestión de proyectos de conectividad |
| 2 | MinVivienda | VIP/VIS y reasentamientos — trazabilidad de subsidios y obras |
| 3 | ANI | Concesiones 4G/5G — control de avance multi-concesionario |
| 4 | INVÍAS | Obras viales — bitácora electrónica + evidencia fotográfica con IA |
| 5 | Findeter | Banca de desarrollo — condición de desembolso ligada a avance verificado |
| 6 | MinEducación | 218 proyectos de infraestructura universitaria ($8,42 B) |
| 7 | Alcaldía de Bogotá / Medellín | Obras locales — transparencia y curva S para control político |
| 8 | Curadurías urbanas | Digitalización del expediente de licencias (nuestro paquete A-A'/B-B'/fachadas) |
| 9 | Fondo Adaptación / FGPI | Reconstrucción post-desastre — evidencia y control |
| 10 | Gobernaciones (Antioquia, Valle, Atlántico) | Programas regionales de infraestructura |

**Cómo se ofrece:** NO venta fría — se gana por **licitación en SECOP II** (minimisumiento/acuerdo marco) o **convenios interadministrativos**; también como subcontratista tecnológico de las firmas de interventoría que ya contrata el Estado.
**Cómo se gana dinero:** contratos anuales por entidad (COP 50-200M/año) con licencia ilimitada de obras + soporte; el verdadero multiply: cada licitación ganada exige que los CONTRATISTAS usen la plataforma (modelo "proyecto obliga"). Ciclos 6-18 meses — sembrar temprano con pilotos gratuitos de 1 obra pública emblemática.

#### Segmento 3 · Instituciones privadas

Top-10 (educación + salud + corporativo — todos construyen constantemente):

| # | Institución | Proyecto reciente/nota |
|---|-------------|------------------------|
| 1 | Universidad de los Andes | Centro Cívico Universitario ~25.000 m² |
| 2 | Pontificia Universidad Javeriana | Edificio Félix Restrepo (19.900 m², 11 pisos) |
| 3 | EAFIT (Medellín) | Nuevo Edificio de Ciencias |
| 4 | Universidad CES | expansión salud |
| 5 | Universidad Icesi (Cali) | campus growth |
| 6 | Fundación Santa Fe de Bogotá | expansión hospitalaria |
| 7 | Clínica Imbanaco (Cali) | torres de salud |
| 8 | San Vicente Fundación (MDE/BOG) | ampliaciones |
| 9 | Clínica del Country | renovación consultant rooms |
| 10 | Bancolombia / Éxito (real estate corporativo) | sedes, campus, tiendas |

**Cómo se ofrece:** a la dirección de infraestructura/física (no a TI): discurso de **curva S + evidencia auditable para juntas directivas**; el paquete de licencia IA acorta la fase de diseño de sus expansiones. Alianzas con facultades de ingeniería (licencia académica gratis → los egresados llegan conociendo la herramienta).
**Cómo se gana dinero:** licencia por proyecto de expansión (COP 20-60M por obra de 1-3 años) + licencia académica institucional (COP 15-30M/año por facultad). Margen alto: son pocos, grandes y estables — 3 clientes de este segmento pagan el runway.

#### Segmento 4 · Profesionales independientes (constructores/ingenieros/arquitectos multi-proyecto)

No es un ranking de nombres sino de **10 nichos con perfil "varios proyectos simultáneos"** (los mejores clientes independientes):

1. Constructores de obra gris en Bogotá con 3-8 edificios simultáneos (Usaquén/Chapinero)
2. Arquitectos remodeladores de alto estándar (Bogotá/Medellín — proyectos de $200M-2.000M)
3. Ingenieros civiles de interventoría freelance (contratistas de alcaldías)
4. Constructores de vivienda en parcelaciones (Savanna, alrededores Bogotá)
5. Gestores inmobiliarios small-scale (buy-fix-sell, 4-12 unidades/año)
6. Diseñadores/especialistas estructurales con licitación de planos (nuestro paquete DXF/IFC)
7. Constructores de locales comerciales para franquicias (retail fit-out)
8. Peritos avalúadores (evidencia documental de inmuebles)
9. Administradores de propiedad horizontal con obras de mejora
10. Ingenieros de obra pública que facturan como persona natural (miles en SECOP)

**Cómo se ofrece:** product-led growth — freemium real (1 proyecto gratis para siempre, sin tarjeta), YouTube/TikTok mostrando el estudio multi-agente generando planos + licencia en minutos, comunidades (COPCIC, SOC, grupos de WhatsApp de ingeniería), programa de afiliados con interventores.
**Cómo se gana dinero:** freemium → **COP 49-99k/mes Pro** (proyectos ilimitados, expedientes de licencia, exportación DXF/IFC). Volumen: capturar 1% de 180.000 = 1.800 pago ≈ COP 90-180M MRR — este segmento es el motor de ARR y la base de datos de precios APU vivos que alimenta a los otros tres.

#### Priorización go-to-market (a 24 meses)

| Fase | Foco | Objetivo de ingreso |
|------|------|---------------------|
| 0-6 m | Segmento 4 (freemium) + 3-5 MIPYME del seg. 1 | Primeros COP 5-10M MRR + casos de uso |
| 6-12 m | MIPYME Camacol (seg. 1) + 2 instituciones privadas (seg. 3) | COP 30-50M MRR |
| 12-24 m | Licitación estatal (seg. 2) + constructora grande (seg. 1) | Contratos anuales COP 200M+ |

**SAM conservador (Colombia):** 12.000 MIPYME × penetración 2% a 5 años = 240 empresas de pago + ecosistema freemium de independientes + 2-4 contratos estatales anuales.

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
