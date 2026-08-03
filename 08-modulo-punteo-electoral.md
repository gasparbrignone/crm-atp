# Módulo: Punteo Electoral y Comentarios Privados

[← Índice general](./00-README.md)

## Índice

1. [Distinción clave: etiqueta vs. clasificación de punteo](#1-distinción-clave-etiqueta-vs-clasificación-de-punteo)
2. [Objetivo del módulo](#2-objetivo-del-módulo)
3. [Modelo de privacidad](#3-modelo-de-privacidad)
4. [Componentes del punteo](#4-componentes-del-punteo)
5. [Vista de trabajo de punteo](#5-vista-de-trabajo-de-punteo)
6. [Clasificación](#6-clasificación)
7. [Comentarios y seguimiento](#7-comentarios-y-seguimiento)
8. [Visibilidad para la conducción](#8-visibilidad-para-la-conducción)
9. [Principio de diseño: la IA no clasifica personas](#9-principio-de-diseño-la-ia-no-clasifica-personas)
10. [Consideraciones legales](#10-consideraciones-legales)
11. [Reglas de negocio del módulo](#11-reglas-de-negocio-del-módulo)
12. [Permisos relevantes](#12-permisos-relevantes)

---

## 1. Distinción clave: etiqueta vs. clasificación de punteo

Antes de cualquier otra cosa, este documento establece una distinción que se usa de forma consistente en el resto del sistema y que **no debe confundirse en ningún punto del desarrollo**:

| | Etiqueta | Clasificación de punteo |
|---|---|---|
| ¿Quién la ve? | Cualquier usuario con acceso a la ficha | Únicamente quien la cargó (y el Administrador) |
| ¿Es compartida? | Sí, una única etiqueta vista por toda la organización | No, cada usuario tiene su propia clasificación sobre la misma persona, independiente de la de otros usuarios |
| ¿Qué describe? | Un atributo objetivo o funcional ("delegado de curso") | Una percepción subjetiva de afinidad política de un usuario puntual |
| ¿Dónde vive? | `Etiqueta` / `PersonaEtiqueta` | `PunteoPersona` / `PunteoComentario` |
| Documento | [`05-modulo-personas.md`](./05-modulo-personas.md#7-etiquetado) | Este documento |

Confundir ambos conceptos en la implementación sería un error grave de privacidad: expondría la percepción política privada de un militante como si fuera un dato compartido.

## 2. Objetivo del módulo

Formalizar en el sistema una práctica que la organización **ya ejecuta hoy de forma manual**: el seguimiento territorial de personas por parte de cada militante, con el objetivo de organizar el trabajo de campo (a quién contactar, a quién reforzar, a quién ya se llegó) sin depender de agendas personales, planillas sueltas o memoria individual.

Cada `Usuario` mantiene su propio punteo: un conjunto de registros `PunteoPersona`, uno por cada persona con la que tiene o tuvo algún tipo de seguimiento, cada uno con su clasificación actual, su estado de seguimiento y una bitácora de comentarios.

## 3. Modelo de privacidad

Este es, por lejos, el módulo con el requisito de privacidad más estricto de todo el sistema. La regla es simple de enunciar y no admite excepciones implícitas:

> **Un registro de `PunteoPersona` (y sus `PunteoComentario` asociados) solo puede ser leído por el `Usuario` que lo creó, o por un usuario con el permiso explícito `punteo.ver_todos`.**

Esto se implementa en **dos capas independientes**, no una sola (ver justificación de defensa en profundidad en [`16-seguridad.md`](./16-seguridad.md)):

1. **Capa de aplicación**: todo servicio que consulta `PunteoPersona` filtra explícitamente por `usuario_id = usuario_actual` salvo que el usuario tenga el permiso `punteo.ver_todos`.
2. **Capa de base de datos (RLS)**: una política de Row Level Security en Postgres impone la misma restricción de forma independiente, de modo que un error en la capa de aplicación no alcance para filtrar datos de punteo ajenos.

## 4. Componentes del punteo

Según la estructura definida en [`04-modelo-datos.md`](./04-modelo-datos.md#9-punteo), el punteo de una persona (desde la perspectiva de un usuario puntual) se compone de:

- **Clasificación** (`PunteoPersona.clasificacion_id`): un valor único y actual, del catálogo `ClasificacionPunteo` (sección 6).
- **Estado de seguimiento** (`PunteoPersona.estado_seguimiento`): en qué etapa del proceso de contacto está esa persona (sección 7).
- **Comentarios** (`PunteoComentario`, 1—N): la bitácora cronológica de notas de seguimiento (sección 7).

## 5. Vista de trabajo de punteo

La pantalla de punteo (`/punteo` en la estructura de rutas de [`03-arquitectura.md`](./03-arquitectura.md)) es, junto con el registro de asistencia de actividades, la vista más optimizada para uso desde celular de todo el sistema. Diseño funcional:

- **Lista de "mi punteo"**: todas las personas sobre las que el usuario actual tiene un registro de `PunteoPersona`, ordenables por estado de seguimiento y por fecha de última actualización.
- **Acceso rápido a una persona nueva**: buscador integrado (reutiliza el [buscador global](./12-buscador-global.md) acotado a Personas) para empezar a puntear a alguien que todavía no tiene registro propio — la primera interacción crea el `PunteoPersona` automáticamente.
- **Carga de un comentario en el mínimo de pasos posible**: desde la ficha de punteo de una persona, un campo de texto siempre visible (no detrás de un botón "agregar comentario") con envío en un tap, pensado explícitamente para cargarse parado en un pasillo entre clase y clase.
- **Cambio de clasificación y de estado de seguimiento** disponibles como controles directos en la misma pantalla, sin navegación adicional.

## 6. Clasificación

El catálogo `ClasificacionPunteo` (ver [`04-modelo-datos.md`](./04-modelo-datos.md#91-clasificacionpunteo-catálogo)) se carga inicialmente con los valores **Sin contactar, Favorable, Indeciso, Desfavorable, No ubicable**, pero es completamente administrable desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) — la taxonomía exacta de clasificación es una decisión política de la organización, no una decisión técnica, y por eso el sistema la trata como dato y no como código.

Un usuario solo puede tener **una clasificación vigente a la vez** por persona (no un historial de clasificaciones distintas en paralelo); el historial de cómo cambió esa clasificación en el tiempo queda de todas formas disponible vía `HistorialCambio` (ver [`17-auditoria-historial.md`](./17-auditoria-historial.md)), de forma que no se pierde información aunque la vista principal solo muestre el valor actual.

## 7. Comentarios y seguimiento

- Los `PunteoComentario` son de **solo alta**: no se editan ni se borran desde la UI estándar una vez creados (`RN-5` en [`04-modelo-datos.md`](./04-modelo-datos.md)). Esto es deliberado: preserva la integridad de una bitácora de seguimiento, que pierde su valor si se puede reescribir retroactivamente.
- El `estado_seguimiento` (`sin_iniciar`, `en_seguimiento`, `contactado`, `requiere_reintento`, `cerrado`) es lo que permite a un militante armar su propia lista de tareas pendientes ("a quién me falta contactar esta semana") sin necesidad de releer todos los comentarios de cada persona.

## 8. Visibilidad para la conducción

El permiso `punteo.ver_todos` (típicamente asignado al rol Administrador, ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md)) habilita:

- Ver el punteo de cualquier usuario sobre cualquier persona, incluyendo sus comentarios.
- Ver una **vista agregada** en el dashboard administrativo (ver [`11-dashboards.md`](./11-dashboards.md)) con estadísticas de punteo por militante y por clasificación — sin necesariamente exponer el detalle de cada comentario en esa vista agregada, que se reserva para cuando la conducción entra puntualmente a revisar el punteo de una persona o un usuario específico.

Este permiso debe asignarse con criterio restrictivo: es, por diseño, la única puerta que existe para que una persona vea el punteo ajeno, y su uso queda igualmente registrado en `HistorialCambio` cada vez que se ejerce sobre un punteo que no es propio (acceso auditado, no solo edición auditada — ver [`17-auditoria-historial.md`](./17-auditoria-historial.md)).

## 9. Principio de diseño: la IA no clasifica personas

Este es un principio de diseño explícito y deliberado, no una limitación técnica: **ninguna funcionalidad de inteligencia artificial asigna, sugiere o infiere automáticamente una clasificación de afinidad política para una persona.** La clasificación es, siempre, un juicio exclusivamente humano de quien conoce el contexto real de esa relación.

Lo que la IA sí puede hacer, dentro de este módulo, es estrictamente informativo y nunca interpretativo de opiniones:

- Señalar personas con `PunteoPersona.estado_seguimiento = sin_iniciar` hace mucho tiempo, como recordatorio operativo (ver [`13-notificaciones.md`](./13-notificaciones.md)).
- Agregar estadísticas sobre volumen de punteo (cuántas personas puntea cada usuario, cuántas están en cada estado de seguimiento) sin tocar el contenido cualitativo de ninguna clasificación individual.

Este principio se reitera en [`15-ia.md`](./15-ia.md#9-principio-transversal-la-ia-nunca-infiere-opiniones-políticas) y debe respetarse en cualquier funcionalidad nueva de IA que se agregue a futuro, aunque no esté descripta explícitamente en esta documentación.

## 10. Consideraciones legales

La clasificación de afinidad política de una persona constituye, bajo el artículo 2° de la Ley 25.326 de Protección de Datos Personales de Argentina, un **dato sensible** ("datos personales que revelan [...] opiniones políticas [...]"). El artículo 7° de la misma ley prohíbe, como regla general, formar bases de datos que revelen datos sensibles, pero contempla una excepción explícita: **las organizaciones políticas y sindicales pueden llevar un registro de sus propios miembros.**

Dos consecuencias prácticas de este marco para el diseño del sistema:

1. **Refuerza, no debilita, la necesidad del modelo de privacidad estricto de la sección 3.** El estricto aislamiento del punteo por usuario acerca el tratamiento de este dato a un uso defendible dentro del marco legal. **Actualización 2026-08-03**: esto ya no incluye una ausencia total de cesión a terceros — Gaspar decidió explícitamente que el chatbot de IA (Fase 9, [`15-ia.md`](./15-ia.md#7-chatbot-conectado-a-la-base-de-datos)) puede enviar el contenido de `PunteoComentario` a la API de Gemini al responder preguntas puntuales, dentro del mismo alcance de permisos que la UI (propio siempre; ajeno solo con `punteo.ver_todos`, auditado). Ver el detalle y la justificación de esta excepción en [`16-seguridad.md`](./16-seguridad.md#6-el-punteo-como-dato-sensible-implicancias-de-diseño) secciones 6 y 9 — queda documentado acá porque es información relevante para cualquier revisión legal futura de este módulo, no como asesoramiento legal en sí.
2. **La excepción legal habla de "miembros" de la organización política.** El punteo, tal como está diseñado, releva afinidad de personas que en su gran mayoría **no son miembros de la agrupación** sino potenciales votantes de una elección estudiantil. Esta es una zona de interpretación legal que excede el alcance de esta documentación técnica — se recomienda una revisión puntual con asesoría legal antes de operar el módulo con datos reales de producción, en particular respecto del alcance exacto de "miembros" y de las obligaciones de información hacia los titulares de los datos.

Esta sección es informativa, no asesoramiento legal. El detalle ampliado de seguridad y cumplimiento normativo está en [`16-seguridad.md`](./16-seguridad.md).

## 11. Reglas de negocio del módulo

- El primer comentario o clasificación que un usuario carga sobre una persona crea automáticamente su `PunteoPersona` si todavía no existía (no hay un paso de "alta de punteo" separado).
- Dar de baja a un usuario (`Usuario.estado = inactivo`) no elimina su punteo: pasa a ser visible por el Administrador para asegurar continuidad del trabajo territorial ya realizado, evitando que el conocimiento acumulado se pierda cuando un militante deja de participar activamente.
- No existe operación de "transferir punteo de un usuario a otro" en la v1: si es necesario reasignar seguimiento, se hace manualmente (el nuevo usuario empieza su propio registro, pudiendo consultar el anterior si tiene permiso `punteo.ver_todos`).

## 12. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `punteo.ver_propio` | Ver y editar el propio punteo (permiso base, otorgado a todos los roles operativos) |
| `punteo.ver_todos` | Ver el punteo de cualquier usuario |
| `punteo.exportar_propio` | Exportar el propio punteo (ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)) |
| `punteo.exportar_todos` | Exportar punteo agregado de toda la organización |

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — estructura de datos de `PunteoPersona` y `PunteoComentario`
- [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) — el padrón que define quién puede votar (distinto del punteo, que mide afinidad)
- [`16-seguridad.md`](./16-seguridad.md) — marco legal completo y políticas de RLS
- [`15-ia.md`](./15-ia.md) — límites explícitos de la IA respecto de este módulo
