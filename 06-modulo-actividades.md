# Módulo: CRM de Actividades

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Tipos de actividad](#2-tipos-de-actividad)
3. [Ciclo de vida de una actividad](#3-ciclo-de-vida-de-una-actividad)
4. [Alta y edición de una actividad](#4-alta-y-edición-de-una-actividad)
5. [Actividades compuestas (actividad padre / sub-actividades)](#5-actividades-compuestas-actividad-padre--sub-actividades)
6. [Vista de detalle de una actividad](#6-vista-de-detalle-de-una-actividad)
7. [Listado de actividades](#7-listado-de-actividades)
8. [Reglas de negocio del módulo](#8-reglas-de-negocio-del-módulo)
9. [Permisos relevantes](#9-permisos-relevantes)

---

## 1. Objetivo del módulo

Gestionar el ciclo de vida completo de cualquier evento que organice la agrupación — desde un repaso de una hora hasta un congreso de un día completo — y servir como ancla para medir participación, que es una de las señales más importantes que alimenta el [dashboard](./11-dashboards.md) y los [insights de IA](./15-ia.md).

La estructura de datos completa está en [`04-modelo-datos.md`](./04-modelo-datos.md#6-núcleo-actividad-y-participación); este documento cubre el comportamiento funcional.

## 2. Tipos de actividad

El tipo de actividad (`TipoActividad`) es un catálogo administrable, no una lista fija en el código (ver [`18-configuracion-sistema.md`](./18-configuracion-sistema.md)). Los tipos de referencia con los que el sistema se carga inicialmente son: **Repaso, Grupo de estudio, Simulacro, Congreso, Capacitación, Charla, Jornada**. La organización puede agregar, renombrar o desactivar tipos libremente sin intervención de desarrollo.

Cada tipo tiene un color asociado, usado consistentemente en el calendario y en los gráficos del dashboard para que un mismo tipo de actividad sea visualmente reconocible en cualquier pantalla del sistema.

## 3. Ciclo de vida de una actividad

```
planificada → en_curso → finalizada
      │
      └──────────► cancelada
```

- **planificada**: creada, con fecha futura, abierta a inscripciones si tiene cupo disponible.
- **en_curso**: transición manual o automática (por fecha/hora de inicio) — a definir en implementación si el pasaje es automático por cron o manual por el responsable; en cualquier caso, mientras está `en_curso` se habilita la carga rápida de asistencia (ver [`07-modulo-participaciones.md`](./07-modulo-participaciones.md#3-registro-de-asistencia)).
- **finalizada**: cierre del evento. A partir de este estado, las `Participacion` asociadas dejan de aceptar nuevas inscripciones, solo se puede seguir marcando asistencia retroactiva con permiso.
- **cancelada**: estado terminal alternativo. Las `Participacion` existentes se conservan (no se borran) para mantener el historial de quién se había anotado, pero se notifica automáticamente a los inscriptos (ver [`13-notificaciones.md`](./13-notificaciones.md)).

## 4. Alta y edición de una actividad

### 4.1 Campos del formulario

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | Sí | — |
| Tipo de actividad | Sí | Selector sobre el catálogo `TipoActividad` |
| Descripción | No | Editor de texto enriquecido, se muestra en la vista de inscripción |
| Fecha y hora de inicio | Sí | — |
| Fecha y hora de fin | No | Nulo permitido para actividades de duración abierta (ej. un grupo de estudio recurrente) |
| Modalidad | Sí | Presencial / Virtual / Híbrida |
| Lugar | Condicional | Obligatorio si la modalidad no es 100% virtual |
| Cupo máximo | No | Nulo = sin límite. Si se define, el sistema bloquea nuevas inscripciones al alcanzarlo y ofrece lista de espera (ver [`07-modulo-participaciones.md`](./07-modulo-participaciones.md)) |
| Responsable | Sí | Usuario responsable principal; recibe notificaciones relacionadas a esta actividad por defecto |
| Actividad padre | No | Ver sección 5 |
| Observaciones | No | — |

### 4.2 Edición

Igual criterio que en Personas: edición inline, con historial de cambios por campo relevante (ver [`17-auditoria-historial.md`](./17-auditoria-historial.md)). Cambiar la fecha de una actividad con inscriptos ya confirmados dispara automáticamente una notificación a todos los inscriptos (ver [`13-notificaciones.md`](./13-notificaciones.md)).

## 5. Actividades compuestas (actividad padre / sub-actividades)

Una actividad puede declarar opcionalmente una **actividad padre**, para modelar eventos grandes compuestos por múltiples sub-actividades independientes que, sin embargo, se quieren trackear y presentar como parte de un todo.

**Ejemplo de referencia**: una jornada anual de formación en salud, organizada como evento de un día completo con múltiples talleres temáticos en simultáneo (primeros auxilios, RCP, salud mental, etc.). Se modela como:

- Una `Actividad` padre de tipo "Jornada", que representa el evento completo (usada para la inscripción general y la comunicación global del evento).
- Cada taller como una `Actividad` hija de tipo "Charla" o "Capacitación", con `actividad_padre_id` apuntando a la jornada.

Esto habilita, sin necesidad de un modelo de datos adicional, funcionalidades como un **sistema de asistencia acumulada tipo "pasaporte"**: el progreso de una persona a través del evento se calcula contando sus `Participacion` con `estado = asistio` entre las sub-actividades de una misma actividad padre, mostrado como "3 de 5 talleres completados" en su ficha o en una pantalla dedicada del evento.

La vista de detalle de una actividad padre muestra sus sub-actividades como una sección propia (ver sección 6), y el dashboard puede agregar métricas a nivel de evento completo (ver [`11-dashboards.md`](./11-dashboards.md)).

## 6. Vista de detalle de una actividad

| Sección | Contenido |
|---|---|
| Encabezado | Nombre, tipo (con color), fecha, modalidad/lugar, estado, cupo (ocupado/total) |
| Inscriptos | Listado de `Participacion` con estado, buscable y filtrable por estado de inscripción |
| Sub-actividades | Solo si la actividad es padre de otras — listado con su propio resumen de asistencia |
| Estadísticas de la actividad | Tasa de asistencia (asistieron / inscriptos), comparación con actividades del mismo tipo (ver [`11-dashboards.md`](./11-dashboards.md)) |
| Historial | Cambios sobre esta actividad |

## 7. Listado de actividades

Vista de calendario (por defecto) y vista de lista, intercambiables. Filtros por tipo, estado, modalidad, rango de fechas y responsable. Igual que en Personas, paginado server-side en la vista de lista, sin traer el conjunto completo al cliente.

## 8. Reglas de negocio del módulo

- **Una actividad cancelada no se elimina.** Se conserva junto con sus `Participacion`, siguiendo el principio de cero pérdida de datos de [`01-vision-alcance.md`](./01-vision-alcance.md).
- **El cupo se valida a nivel de servicio, no solo de UI.** Dos usuarios inscribiendo personas en simultáneo al último cupo disponible no deben poder generar una sobre-inscripción silenciosa; la validación de cupo ocurre en una transacción a nivel de `participaciones.service.ts` (ver [`03-arquitectura.md`](./03-arquitectura.md)).
- **Una actividad padre no puede ser, a su vez, hija de otra actividad de la que ella misma es ancestro** (se previene la creación de ciclos en la jerarquía de `actividad_padre_id`).
- **Eliminar el responsable de una actividad (por ejemplo, si el usuario se da de baja) no puede dejar la actividad sin responsable**: el sistema exige asignar un nuevo responsable como parte del flujo de desactivación de un usuario (ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md)).

## 9. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `actividades.ver` | Ver listado y detalle |
| `actividades.crear` | Alta de actividades |
| `actividades.editar` | Edición de campos, cambio de estado |
| `actividades.eliminar` | Cancelar/archivar una actividad |
| `actividades.gestionar_todas` | Editar actividades de las que el usuario no es responsable (por defecto, un Militante solo edita las suyas) |

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — estructura de datos de `Actividad`
- [`07-modulo-participaciones.md`](./07-modulo-participaciones.md) — inscripción y asistencia
- [`11-dashboards.md`](./11-dashboards.md) — métricas derivadas de actividades
- [`13-notificaciones.md`](./13-notificaciones.md) — avisos automáticos ante cambios de actividad
