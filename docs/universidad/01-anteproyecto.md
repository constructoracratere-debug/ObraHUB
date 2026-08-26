# ANTEPROYECTO DE GRADO

## OBRahUB — Construction Operating System para Colombia y Latinoamérica

**Programa:** Constructor y Gestor en Arquitectura
**Institución:** Corporación Universitaria Unicolmayor
**Proponente:** Diego Orlando Pineda Escobar
**Empresa respaldo:** Cratere S.A.S.
**Fecha:** Agosto de 2026

---

## 1. PLANTEAMIENTO DEL PROBLEMA

La gestión de obras de construcción en Colombia y Latinoamérica sigue siendo fragmentaria, análoga y costosa. Un constructor en Bogotá, Medellín o Cartagena necesita hoy entre 5 y 10 herramientas desconectadas para administrar una sola obra: Excel para presupuestos APU, WhatsApp para la bitácora diaria, PDF impresos de la NSR-10 para consultas normativas, correos para RFIs, carpetas físicas para planos y fotografías.

Las consecuencias son medibles:

- **Sobrecostos generalizados:** estudios de Camacol y del BID estiman sobrecostos promedio del 20-40% en proyectos de construcción en la región, atribuidos en gran parte a mala planificación, control inadecuado y retrabajos.
- **Pérdida de memoria institucional:** la bitácora de obra —documento con valor legal— se lleva en cuadernos o mensajes que se pierden, generando litigios sin evidencia.
- **Barrera normativa:** la NSR-10, RETIE, RAS y decenas de normas modificatorias (Ley 1796 de 2016, Decreto 1711 de 2021, Decreto 1401 de 2023, entre otras) exigen conocimiento experto que el constructor promedio no tiene a mano. Tras el terremoto del 10 de agosto de 2026 existe además un proyecto de ley que obligará a actualizar la norma cada 5 años.
- **Herramientas globales inaccesibles:** Procore (EE. UU.) cobra desde USD 375/mes por usuario, está en inglés, no conoce la normativa colombiana y no incluye presupuestación APU local.

No existe en el mercado una herramienta que integre en un solo lugar, en español y contextualizada para el régimen normativo colombiano: modelado BIM, presupuestación APU con inteligencia artificial, cronograma con ruta crítica, bitácora con valor legal, control de avance (Curva S, SPI/CPI), interventoría con visión artificial y vigilancia normativa automática.

## 2. PREGUNTA PROBLEMA

¿Cómo mejorar la gestión administrativa, técnica y normativa de las obras de construcción en Colombia mediante una plataforma digital integral que consolide BIM, costos, cronograma, bitácora, control e interventoría con inteligencia artificial?

## 3. OBJETIVOS

### 3.1 Objetivo general

Desarrollar ObraHub, un sistema operativo de construcción (Construction OS) basado en la nube e inteligencia artificial, que integre la gestión documental BIM, presupuestación APU, programación y control de obra, bitácora legal e interventoría técnica normativa, para optimizar la administración de proyectos de construcción en Colombia y Latinoamérica.

### 3.2 Objetivos específicos

1. **Diagnosticar** los flujos de trabajo administrativos reales del constructor colombiano (presupuesto → cronograma → bitácora → control) e identificar sus puntos de falla.
2. **Diseñar y construir** la plataforma: gestión documental con visor BIM (IFC/DWG/DXF), motor de presupuestación APU paramétrico por país (COP/AIU, MXN/Financiamiento), cronograma Gantt con ruta crítica (CPM), bitácora diaria con anexos fotográficos, control con valor ganado (PV/EV/AC, SPI/CPI) y alertas automáticas.
3. **Implementar un agente de interventoría multimodal** (foto + voz + texto) que analice elementos de obra con visión artificial, cite la normativa vigente (con vigilancia automática de derogatorias) y permita conversación de seguimiento.
4. **Validar** el sistema en proyectos piloto reales midiendo tiempo de presupuestación, trazabilidad de bitácora y detección temprana de desviaciones.
5. **Formular el plan de negocio** para su explotación comercial por Cratere S.A.S. en el mercado LATAM.

## 4. JUSTIFICACIÓN

**Técnica:** Integra disciplinas que hoy viven separadas (BIM, EVM, normativa) en un flujo cerrado: modelo → cantidades → APU → cronograma → bitácora → curva S → alertas → informe.

**Económica:** Democratiza herramientas que hoy cuestan USD 375/mes por usuario; con modelo freemium el constructor pequeño accede por primera vez a control profesional de obra.

**Social:** El 70% de la vivienda en Colombia se autoconstruye o construye sin supervisión técnica profesional (DANE, MinVivienda). Un interventor IA gratuito reduce el riesgo sísmico de miles de familias, tema crítico tras el sismo de agosto de 2026.

**Académica:** Aplica el perfil integral del Constructor y Gestor en Arquitectura: conocimiento constructivo + gestión administrativa + innovación tecnológica.

**Normativa:** La vigilancia normativa automática responde a un problema real: la NSR-10 tiene 6 decretos modificatorios desde 2010 y un proyecto de ley de actualización quinquenal en trámite; ningún profesional puede hoy mantenerse al día manualmente.

## 5. MARCO TEÓRICO (síntesis)

- **BIM (Building Information Modeling):** flujo IFC (ISO 16739), cantidades 4D/5D.
- **Gestión del valor ganado (EVM):** PV/EV/AC, índices SPI/CPI, curva S (PMI, PMBOK).
- **Método de la ruta crítica (CPM):** holguras, cadena crítica.
- **Presupuestación APU:** análisis de precios unitarios, AIU colombiano (Ley 80/1993 art. 25, y régimen privado), precios de referencia SIC/Camacol.
- **Régimen normativo colombiano:** Ley 400/1997 y sus leyes modificatorias (1229/2008, 1796/2016), NSR-10 (Decreto 926/2010) y sus 6 decretos modificatorios, Decreto 1077/2015 (licencias), RAS (Res. 330/2017), RETIE, SG-SST (Decreto 1072/2015, Res. 312/2019).
- **Sistemas multiagente y LLMs:** GPT-4o multimodal, RAG (retrieval-augmented generation), transcripción Whisper.
- **Arquitectura cloud serverless:** Next.js, Supabase (Postgres + RLS + Storage), Vercel.

## 6. METODOLOGÍA

**Enfoque:** investigación aplicada con desarrollo de software iterativo (Scrum simplificado, sprints de 1 semana) y validación en campo.

**Fases:**

| Fase | Actividad | Producto |
|------|-----------|----------|
| 1. Diagnóstico | Entrevistas a constructores, análisis de competencia | Mapa de problemas, benchmark |
| 2. Núcleo documental | Gestión de archivos, visores IFC/DWG/DXF, carpetas anidadas | Módulo Documentos |
| 3. Motor económico | Generación APU con IA, parametrización por país | Módulo Costos |
| 4. Programación y control | Gantt CPM, bitácora, valor ganado, alertas | Módulos Seguimiento/Bitácora/Control |
| 5. Inteligencia artificial | Interventor multimodal, RAG normativo, vigilancia legal | Interventor IA |
| 6. Escala y negocio | Rendimiento, API pública, plan de negocios | ObraHub comercial |
| 7. Validación | Pilotos reales, E2E automatizado (17 pruebas) | Resultados y ajustes |

## 7. ALCANCE Y LIMITACIONES

**Incluye:** plataforma web+PWA completa (módulos listados), base normativa colombiana verificada, configuración paramétrica Colombia/México, API pública v1, plan de negocio.

**No incluye (trabajo futuro):** cálculo estructural automático, apps nativas iOS/Android (la PWA cubre móvil), marketplace ObraGo (fase 2 comercial), firmas digitales ante notario.

## 8. RESULTADOS ESPERADOS

1. Plataforma funcional desplegada en producción con 6 módulos integrados.
2. Reducción ≥70% del tiempo de elaboración de un presupuesto APU vs. manual.
3. Bitácora con evidencia fotográfica y trazabilidad por usuario (valor probatorio).
4. Interventor IA con acierto ≥80% en identificación de elementos y normativa aplicable (validación contra criterio de experto).
5. Plan de negocio viable con punto de equilibrio proyectado a 24 meses.
