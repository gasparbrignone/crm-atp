# Visión y Alcance del Proyecto

[← Índice general](./00-README.md)

## Índice

1. [Propósito de este documento](#1-propósito-de-este-documento)
2. [Visión del producto](#2-visión-del-producto)
3. [Contexto organizacional](#3-contexto-organizacional)
4. [Objetivos del sistema](#4-objetivos-del-sistema)
5. [Alcance funcional](#5-alcance-funcional)
6. [Fuera de alcance (v1)](#6-fuera-de-alcance-v1)
7. [Usuarios objetivo](#7-usuarios-objetivo)
8. [Principios de diseño rectores](#8-principios-de-diseño-rectores)
9. [Supuestos y decisiones abiertas](#9-supuestos-y-decisiones-abiertas)
10. [Criterios de éxito del proyecto](#10-criterios-de-éxito-del-proyecto)

---

## 1. Propósito de este documento

Este documento es la puerta de entrada conceptual a todo el proyecto. Antes de que exista una sola tabla, componente o endpoint, este archivo responde tres preguntas: **para quién** se construye el sistema, **por qué** se construye, y **qué** entra y qué no entra en el alcance de la primera versión productiva.

Todo el resto de la documentación (`/docs/03` en adelante) asume como válidas las decisiones tomadas acá. Si en algún momento del desarrollo surge una duda de producto que no está resuelta en ningún documento, la respuesta por defecto debe ser consistente con la visión y los principios descritos en este archivo, no con lo que parezca "más simple de implementar".

## 2. Visión del producto

Un **CRM inteligente** construido a medida para una agrupación estudiantil universitaria: un sistema único que reemplaza planillas de cálculo dispersas, contactos sueltos en el celular de cada militante y conocimiento no documentado que hoy vive únicamente en la cabeza de una persona.

El sistema debe convertirse en la **fuente de verdad operativa** de la organización sobre:

- quiénes son las personas con las que la agrupación tiene o tuvo contacto,
- qué actividades organizó y quién participó en cada una,
- cuál es el estado electoral y de afinidad de cada persona,
- qué hizo cada militante y qué le falta hacer,
- y qué tendencias e insights emergen de todo lo anterior.

No es una base de datos pasiva. Es una herramienta de trabajo diario, tan usable desde un escritorio en una reunión de mesa como desde un teléfono en un pasillo de la facultad, entre clase y clase, haciendo punteo.

## 3. Contexto organizacional

El sistema se construye para una **agrupación estudiantil** que funciona en una facultad de ciencias de la salud de una universidad pública argentina, y que se organiza en torno a un núcleo de liderazgo y una base creciente de militantes que hacen trabajo territorial (difusión, punteo, organización de actividades académicas y gremiales).

Tres características del contexto real de la organización condicionan decisiones de diseño a lo largo de todo este proyecto y se repiten como justificación en varios documentos:

1. **La organización está creciendo y se está profesionalizando.** Pasa de operar con conocimiento centralizado en una persona a distribuir responsabilidades entre varios militantes. El sistema debe *habilitar* esa distribución, no frenarla: cada militante necesita sus propias herramientas (su punteo, sus actividades a cargo) sin perder trazabilidad ni control desde la conducción.
2. **El punteo territorial ya es una práctica real de la organización**, no una funcionalidad especulativa. Ya existe entrenamiento interno sobre cómo hacer trabajo de punteo. El sistema no está inventando un proceso: está **formalizando y potenciando con IA un proceso que ya se ejecuta manualmente**. Esto tiene una consecuencia directa de diseño: la herramienta debe adaptarse al proceso real de punteo (rápido, incremental, muchas veces hecho desde el celular), no forzar al militante a adaptarse a un formulario administrativo pesado.
3. **La organización gestiona información sensible por naturaleza** (afinidad política de terceros, datos de un padrón electoral). Esto no es un detalle secundario de seguridad: condiciona el modelo de datos (privacidad por usuario en el punteo), el modelo legal (ver [`16-seguridad.md`](./16-seguridad.md)) y el tono general del sistema (una herramienta seria, no un juguete).

La documentación funcional evita deliberadamente hardcodear información táctica de la coyuntura política de la organización (nombres de otras agrupaciones, resultados electorales puntuales, correlación de fuerzas). Esas cosas cambian con cada elección; el sistema debe soportarlas como **datos**, no como supuestos fijos en el código o en el modelo.

## 4. Objetivos del sistema

| # | Objetivo | Cómo se mide |
|---|----------|---------------|
| O1 | Unificar en una única ficha por persona toda la información dispersa que hoy existe en planillas y contactos sueltos | Cero fichas duplicadas intencionales; herramienta de detección de duplicados activa desde la Fase 1 |
| O2 | Permitir que cada militante haga y gestione su propio punteo sin fricción, incluso desde el celular | Alta de un comentario de punteo en ≤ 3 taps desde un celular, sin recargar la página |
| O3 | Dar a la conducción visibilidad agregada sin necesidad de pedir reportes manuales a cada militante | Dashboard administrativo con datos en tiempo real, cero planillas de "reporte semanal" |
| O4 | Digitalizar y cruzar automáticamente los padrones electorales oficiales contra la base de personas | Importación de un padrón en PDF y matching automático en minutos, no en días |
| O5 | Reducir el trabajo manual repetitivo de carga de datos mediante IA (normalización, detección de duplicados, lectura de PDFs) | Tiempo de carga de un padrón nuevo reducido en al menos un orden de magnitud respecto de la carga manual |
| O6 | Sostener el crecimiento de la organización sin degradación de performance | Sistema usable con miles de personas y actividades cargadas, sin cambios de arquitectura |
| O7 | Dejar un registro auditable de cada cambio relevante | 100% de las modificaciones sobre entidades críticas (Persona, Actividad, Participación, Punteo) quedan en el historial |

## 5. Alcance funcional

La primera versión completa del sistema (entendida como la suma de todas las fases del [roadmap](./20-roadmap.md), no como un único lanzamiento) incluye los siguientes módulos. Cada uno tiene su propio documento de detalle:

| Módulo | Resumen de una línea | Documento |
|---|---|---|
| CRM de Personas | Ficha única por estudiante, con historial, etiquetas y estado electoral | [`05-modulo-personas.md`](./05-modulo-personas.md) |
| CRM de Actividades | Repasos, simulacros, congresos, capacitaciones, jornadas, totalmente editables | [`06-modulo-actividades.md`](./06-modulo-actividades.md) |
| Participaciones | Relación N a N entre personas y actividades, con estado propio | [`07-modulo-participaciones.md`](./07-modulo-participaciones.md) |
| Punteo electoral y comentarios privados | Seguimiento privado por militante, con clasificación y comentarios | [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) |
| Gestión de padrones electorales | Carga, versionado y cruce de padrones oficiales contra personas | [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) |
| Usuarios, roles y permisos | Sistema de acceso granular por rol y por permiso | [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) |
| Dashboards | Panel administrativo y panel personal por militante | [`11-dashboards.md`](./11-dashboards.md) |
| Buscador global | Búsqueda unificada por cualquier campo relevante | [`12-buscador-global.md`](./12-buscador-global.md) |
| Notificaciones | Alertas y sugerencias proactivas | [`13-notificaciones.md`](./13-notificaciones.md) |
| Importaciones y exportaciones | Google Sheets, CSV, Excel, PDF, en ambos sentidos | [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md) |
| Inteligencia artificial | Duplicados, normalización, lectura de padrones, chatbot, insights | [`15-ia.md`](./15-ia.md) |
| Seguridad y privacidad | Autenticación, autorización, cumplimiento normativo, backups | [`16-seguridad.md`](./16-seguridad.md) |
| Auditoría e historial | Registro de cambios de todo el sistema | [`17-auditoria-historial.md`](./17-auditoria-historial.md) |
| Configuración del sistema | Catálogos y parámetros administrables sin tocar código | [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) |
| UX/UI | Navegación, sistema visual, accesibilidad, responsive, modo oscuro | [`19-ux-ui.md`](./19-ux-ui.md) |

## 6. Fuera de alcance (v1)

Definir qué **no** se construye es tan importante como definir qué sí, para evitar que el alcance crezca de forma descontrolada durante el desarrollo. Quedan explícitamente fuera de la primera versión completa:

- **Reemplazo de sistemas académicos oficiales.** El sistema no gestiona notas, correlatividades ni inscripciones a materias. Es información de referencia (carrera, año), no un sistema académico.
- **Gestión de pagos, cuotas o facturación.** No hay ningún módulo financiero en el alcance actual.
- **Aplicación móvil nativa (iOS/Android).** El sistema es web responsive. Una app nativa queda como posible evolución futura, no como requisito.
- **Multi-tenant para otras agrupaciones o facultades.** El sistema se diseña pensando en una sola organización operando en una sola facultad. La arquitectura no debe *impedir* una futura multi-tenencia (ver decisiones en [`03-arquitectura.md`](./03-arquitectura.md)), pero construirla no es un objetivo de esta etapa.
- **Integración bidireccional con redes sociales.** Se almacena el usuario de Instagram como dato de contacto; el sistema no publica, no lee interacciones ni analiza contenido de redes sociales.
- **Firma electrónica o gestión documental legal.** Los documentos que se importan (padrones en PDF, por ejemplo) se leen y procesan, pero el sistema no es un gestor documental ni un repositorio legal de archivos originales más allá de lo necesario para trazabilidad.
- **Chatbot con capacidad de modificar datos.** Como se detalla en [`15-ia.md`](./15-ia.md), el chatbot conversacional es de solo lectura sobre la base de datos en la v1. No ejecuta altas, bajas ni modificaciones por lenguaje natural.

## 7. Usuarios objetivo

El sistema tiene dos tipos de "persona" que conviene no confundir nunca en ninguna conversación de producto:

- **Personas (estudiantes):** el objeto de gestión del CRM. No inician sesión en el sistema ni tienen acceso a él. Son gestionadas por los usuarios.
- **Usuarios (miembros de la organización):** quienes inician sesión y operan el sistema. Se describen en detalle en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md), pero a fines de esta visión general:
  - **Conducción / Administración:** necesita visibilidad total, reportes agregados, configuración del sistema y capacidad de gestionar usuarios y permisos.
  - **Coordinadores de actividad o de área:** gestionan actividades específicas y necesitan ver participación y estadísticas de su área, sin necesariamente ver el punteo privado de otros militantes.
  - **Militantes de base:** el perfil más numeroso. Usan el sistema sobre todo para su propio punteo, para anotarse como responsables o colaboradores de actividades y para consultar información de personas. Es el perfil que más va a usar el sistema **desde el celular** y en sesiones cortas.

## 8. Principios de diseño rectores

Estos principios se aplican de forma transversal en toda la documentación posterior y deben usarse como criterio de desempate cuando dos decisiones de diseño parezcan igualmente válidas.

1. **Privacidad por diseño en el punteo.** El dato de afinidad política de una persona es, por naturaleza, sensible. El acceso a esa información es privado por defecto y se amplía solo por rol explícito, nunca al revés. Ver justificación legal completa en [`16-seguridad.md`](./16-seguridad.md).
2. **La IA asiste, la persona decide.** Ninguna funcionalidad de inteligencia artificial toma una decisión irreversible de forma autónoma (fusionar dos fichas, clasificar políticamente a una persona, eliminar un registro). La IA siempre sugiere; un humano siempre confirma. Este principio se desarrolla en detalle en [`15-ia.md`](./15-ia.md).
3. **Cero pérdida de datos.** No existen eliminaciones físicas de información relevante. Todo lo que se "elimina" desde la UI se marca como archivado/fusionado y permanece disponible en el historial. Ver [`17-auditoria-historial.md`](./17-auditoria-historial.md).
4. **Escala desde el día uno.** Las decisiones de índices, paginación y consultas se toman pensando en miles de registros, no en las decenas de registros con las que arranca el sistema en producción. No se posponen estas decisiones para "cuando haga falta".
5. **Mobile-first para las tareas de campo, desktop-first para las tareas analíticas.** Cargar un comentario de punteo es una tarea de campo. Analizar el dashboard administrativo es una tarea de escritorio. El sistema optimiza cada flujo para el dispositivo en el que realmente se va a usar (ver [`19-ux-ui.md`](./19-ux-ui.md)).
6. **Catálogos configurables, no hardcodeados.** Carreras, tipos de actividad, etiquetas, roles y clasificaciones de punteo son datos administrables desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md), no valores fijos en el código. La organización cambia (nuevas carreras, nuevas categorías) y el sistema debe poder cambiar con ella sin un nuevo despliegue.
7. **Todo cambio relevante es trazable a un usuario y a un momento.** Ninguna acción administrativa relevante es anónima dentro del sistema.

## 9. Supuestos y decisiones abiertas

Estos supuestos fueron adoptados para poder avanzar con el diseño sin bloquear el proyecto. Quedan documentados explícitamente para que el equipo de la organización pueda confirmarlos o corregirlos antes de o durante el desarrollo; si se corrige alguno, el cambio debe propagarse a los documentos que lo referencian.

| # | Supuesto adoptado | Impacto si cambia | Documento afectado |
|---|---|---|---|
| S1 | La oferta académica de referencia inicial de la facultad incluye Medicina, Enfermería, Fonoaudiología y Terapia Ocupacional, cargada como catálogo editable (no fija) | Bajo: es catálogo, se edita desde Configuración sin tocar código | [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) |
| S2 | Existe un único padrón electoral "activo" por vez, aunque el sistema conserva el historial de padrones anteriores | Medio: si en algún momento conviven dos padrones activos (ej. elecciones de dos claustros distintos en simultáneo), el modelo de datos ya lo soporta, pero la UI de "padrón activo único" en el dashboard debería ajustarse | [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) |
| S3 | Un usuario del sistema tiene un único rol principal (no múltiples roles simultáneos) | Medio: pasar a roles múltiples por usuario es una migración de modelo de datos, no solo de UI | [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) |
| S4 | El volumen esperado de Personas es del orden de miles (no de decenas de miles) en el horizonte de varios años | Bajo/medio: afecta decisiones de indexación y particionado, revisar si la facultad tiene una matrícula sensiblemente mayor a la esperada | [`04-modelo-datos.md`](./04-modelo-datos.md) |
| S5 | Cada Actividad puede opcionalmente pertenecer a una Actividad "padre", para modelar eventos grandes compuestos por sub-actividades (por ejemplo, una jornada con múltiples talleres, con seguimiento de asistencia por taller) | Bajo: es un campo opcional, no rompe el modelo si no se usa | [`06-modulo-actividades.md`](./06-modulo-actividades.md) |
| S6 | El proveedor de IA para todas las funcionalidades (normalización, detección de duplicados, lectura de padrones, chatbot) es la API de Anthropic (Claude), aprovechando su capacidad nativa de lectura de documentos e imágenes | Alto: cambiar de proveedor implica revisar todo [`15-ia.md`](./15-ia.md) | [`15-ia.md`](./15-ia.md) |

## 10. Criterios de éxito del proyecto

El proyecto se considera exitoso cuando, más allá de estar "funcionalmente completo" según el roadmap, se cumplen estas condiciones:

- Un militante nuevo puede empezar a usar el sistema para su propio punteo sin necesitar una capacitación individual: la UI se explica sola (ver principios de UX en [`19-ux-ui.md`](./19-ux-ui.md)).
- La conducción deja de pedir "el archivo actualizado" a cada militante, porque el dashboard administrativo ya tiene esa información en tiempo real.
- La carga de un padrón oficial nuevo pasa de ser una tarea manual de horas a una tarea asistida de minutos.
- Ningún dato de punteo se filtra a un usuario sin permiso explícito para verlo — esto se valida con pruebas de autorización específicas, no solo con revisión de código.
- El sistema sigue respondiendo con fluidez cuando la base de Personas crece diez veces respecto del volumen inicial de carga.

---

### Documentos relacionados

- [`00-README.md`](./00-README.md) — índice general de la documentación
- [`02-glosario.md`](./02-glosario.md) — vocabulario común usado en el resto de los documentos
- [`20-roadmap.md`](./20-roadmap.md) — cómo se traduce esta visión en fases de desarrollo concretas
