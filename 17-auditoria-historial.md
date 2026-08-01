# 17. Auditoría e Historial de Cambios

[← Índice general](./00-README.md)

## Índice

1. [Propósito y alcance](#1-propósito-y-alcance)
2. [Historial de entidad vs. auditoría de sistema](#2-historial-de-entidad-vs-auditoría-de-sistema)
3. [Qué se registra](#3-qué-se-registra)
4. [Qué NO se registra](#4-qué-no-se-registra)
5. [Modelo de datos utilizado](#5-modelo-de-datos-utilizado)
6. [Vista de línea de tiempo por entidad](#6-vista-de-línea-de-tiempo-por-entidad)
7. [Vista de auditoría global (administrador)](#7-vista-de-auditoría-global-administrador)
8. [Formato de los cambios registrados](#8-formato-de-los-cambios-registrados)
9. [Retención y purga](#9-retención-y-purga)
10. [Permisos](#10-permisos)
11. [Reglas de negocio](#11-reglas-de-negocio)

## 1. Propósito y alcance

El sistema necesita responder, para cualquier dato sensible o crítico, dos preguntas que la gestión manual en planillas nunca pudo responder de forma confiable:

- **¿Qué cambió, cuándo y quién lo cambió?** (historial de entidad — mirada desde el registro).
- **¿Qué hizo tal usuario en el sistema?** (auditoría de sistema — mirada desde la persona).

Ambas preguntas se resuelven sobre la misma tabla física (`HistorialCambio`, definida en [`04-modelo-datos.md`](./04-modelo-datos.md#historialcambio)), pero se presentan en la interfaz como dos vistas distintas porque responden a necesidades distintas.

## 2. Historial de entidad vs. auditoría de sistema

| | Historial de entidad | Auditoría de sistema |
|---|---|---|
| Pregunta que responde | "¿Qué le pasó a este registro?" | "¿Qué hizo este usuario?" |
| Punto de partida | Una Persona, Actividad, Participación puntual | Un Usuario puntual |
| Quién la usa | Cualquier usuario con acceso al registro en cuestión | Administrador |
| Dónde vive en la interfaz | Pestaña "Historial" dentro de la ficha de la entidad | Sección dedicada del panel de administración |
| Volumen típico de consulta | Decenas de eventos | Miles de eventos, con filtros |

Conceptualmente son dos *consultas* distintas sobre el mismo conjunto de datos, no dos sistemas separados.

## 3. Qué se registra

Se registra un evento de `HistorialCambio` ante:

- **Creación** de un registro en cualquier entidad de negocio (Persona, Actividad, Participación, PunteoPersona, PadronElectoral, Usuario, y el resto de entidades listadas en [`04-modelo-datos.md`](./04-modelo-datos.md)).
- **Modificación** de uno o más campos de un registro existente — se registra un evento por operación de guardado, no un evento por campo, agrupando todos los campos modificados en esa operación (ver sección 8).
- **Baja lógica** (soft delete) de un registro.
- **Restauración** de un registro dado de baja.
- **Fusión** de dos Personas (ver [`05-modulo-personas.md`](./05-modulo-personas.md#6-archivado-y-fusión-de-personas)) — se registra como evento especial sobre ambos registros involucrados.
- **Cambios de rol o de estado** de un Usuario.
- **Cambios de permisos** sobre un rol personalizado.
- **Activación o cierre** de un PadronElectoral.
- **Ejecución** de un ImportJob o ExportJob (evento a nivel de job, no fila por fila — el detalle fila por fila vive en `ImportJobError`, ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)).

## 4. Qué NO se registra

- Los **inicios de sesión y cierres de sesión** no generan un `HistorialCambio`: quedan en los logs propios de Supabase Auth (ver [`16-seguridad.md`](./16-seguridad.md#11-registro-de-eventos-de-autenticación)), fuera del alcance de este módulo funcional.
- Las **lecturas** (ver una ficha, ver un dashboard) no se registran en `HistorialCambio` — únicamente el acceso a punteo ajeno por parte de un Administrador se audita como excepción explícita, y ese registro vive en el mecanismo dedicado descrito en [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#8-auditoría-de-acceso).
- Los **borradores no guardados** (por ejemplo, texto tipeado en un formulario y luego descartado sin enviar) no dejan rastro.

## 5. Modelo de datos utilizado

La entidad `HistorialCambio` ya fue definida en [`04-modelo-datos.md`](./04-modelo-datos.md#historialcambio). Sus campos relevantes para este módulo:

| Campo | Descripción |
|---|---|
| `entidad_tipo` | Nombre de la entidad afectada (`Persona`, `Actividad`, etc.) |
| `entidad_id` | UUID del registro afectado |
| `accion` | `creacion` \| `modificacion` \| `baja` \| `restauracion` \| `fusion` |
| `usuario_id` | Quién ejecutó la acción |
| `cambios` | JSON con el detalle campo por campo (ver sección 8) |
| `creado_en` | Momento exacto del evento |

La tabla es **append-only**: la aplicación nunca emite `UPDATE` ni `DELETE` sobre `HistorialCambio`, reforzado además a nivel de RLS (ver [`16-seguridad.md`](./16-seguridad.md#4-políticas-de-row-level-security-por-entidad)).

## 6. Vista de línea de tiempo por entidad

Dentro de la ficha de cualquier entidad auditable (por ejemplo, la ficha de una Persona en [`05-modulo-personas.md`](./05-modulo-personas.md#3-vista-de-detalle)), la pestaña "Historial" muestra:

- Una línea de tiempo vertical, orden cronológico descendente (más reciente arriba).
- Cada entrada muestra: ícono según tipo de acción, nombre del usuario responsable, fecha y hora relativa ("hace 3 días") con fecha exacta al pasar el cursor, y un resumen legible de los campos modificados ("Cambió *Carrera* de Enfermería a Medicina").
- Las entradas de `modificacion` son expandibles: al abrir, se muestra el detalle campo por campo con el formato antes/después (ver sección 8).
- Si el registro fue dado de baja y restaurado, ambos eventos aparecen en la línea de tiempo como cualquier otro evento, sin tratamiento especial.

En dispositivos móviles la línea de tiempo se muestra en una sola columna, con las mismas entradas colapsadas por defecto.

## 7. Vista de auditoría global (administrador)

Sección exclusiva del rol Administrador (permiso `auditoria.ver`, ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md#3-catálogo-de-permisos)), con:

- **Filtro por usuario**: ver todos los eventos generados por una persona del equipo en un rango de fechas.
- **Filtro por tipo de entidad**: por ejemplo, ver todos los eventos sobre Actividades en la última semana.
- **Filtro por tipo de acción**: por ejemplo, ver únicamente bajas lógicas, para revisar qué se está archivando.
- **Búsqueda por entidad puntual**: pegar o buscar un registro específico y ver su historial completo, atajo equivalente a abrir su ficha y su pestaña de historial.
- Exportable a CSV para revisión externa o para respaldo de una decisión organizacional (por ejemplo, documentar quién aprobó qué cambio en un contexto de conflicto interno).

Esta vista es de solo lectura: no permite revertir cambios directamente desde aquí (revertir un cambio es una acción de edición nueva sobre la entidad, que a su vez genera su propio evento de historial).

## 8. Formato de los cambios registrados

El campo `cambios` almacena un JSON con la forma:

```json
{
  "campo_modificado": {
    "antes": "valor anterior",
    "despues": "valor nuevo"
  }
}
```

Para una operación de guardado que modifica varios campos a la vez, todos quedan agrupados en el mismo evento (mismo `id` de `HistorialCambio`), no un evento por campo — esto refleja que, desde la perspectiva del usuario, fue "una edición", y evita que la línea de tiempo se sature de entradas fragmentadas.

Casos especiales de formato:

- **Creación**: no hay "antes"; se registra el estado inicial completo de los campos no vacíos.
- **Relaciones (por ejemplo, etiquetas asignadas)**: se registra como `agregado` / `quitado` en vez de `antes` / `despues`, dado que son colecciones y no valores escalares.
- **Campos sensibles** (por ejemplo, el contenido de un `PunteoComentario`) no se muestran en claro en la vista de auditoría global salvo para quien ya tendría permiso de verlos en su contexto original — la auditoría nunca es una vía alternativa para eludir los permisos definidos en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

## 9. Retención y purga

- Los eventos de `HistorialCambio` no tienen fecha de expiración automática en v1: se conservan indefinidamente, dado que el volumen esperado (organización de decenas de militantes) no representa un problema de almacenamiento significativo en el horizonte de varios años.
- No existe en v1 una función de purga manual de historial — ni siquiera para el rol Administrador — precisamente porque su valor como registro confiable depende de que no pueda editarse ni borrarse selectivamente.
- Si en el futuro se requiriera una política de retención (por ejemplo, por una futura exigencia legal), debería implementarse como un proceso administrativo separado y explícito, nunca como una operación disponible desde la interfaz de uso diario.

## 10. Permisos

| Permiso | Descripción | Roles con el permiso |
|---|---|---|
| `historial.ver_propio` | Ver el historial de entidades que el usuario puede ver de por sí | Todos los roles (implícito: si podés ver la ficha, podés ver su historial) |
| `auditoria.ver` | Acceder a la vista de auditoría global por usuario | Administrador |
| `auditoria.exportar` | Exportar resultados de auditoría a CSV | Administrador |

El historial de una entidad puntual no requiere un permiso separado del permiso para ver la entidad misma: quien puede ver una ficha de Persona puede ver su pestaña de historial. La excepción es el contenido de comentarios de punteo dentro de ese historial, sujeto a las reglas de visibilidad de [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#7-visibilidad-y-permisos).

## 11. Reglas de negocio

- **RN-1**: Todo `INSERT`, `UPDATE` o soft-delete sobre una entidad auditable ejecutado por la capa de servicios (`lib/servicios/`, ver [`03-arquitectura.md`](./03-arquitectura.md#4-estructura-de-carpetas)) debe generar su correspondiente `HistorialCambio` dentro de la misma transacción — nunca como paso separado que pueda fallar independientemente.
- **RN-2**: Ninguna ruta de la aplicación emite `UPDATE` ni `DELETE` sobre la tabla `HistorialCambio`.
- **RN-3**: Un evento de fusión de Personas genera entradas de historial en ambos registros involucrados, con referencia cruzada entre ambas.
- **RN-4**: Los procesos de importación masiva no generan un evento de `HistorialCambio` por fila creada o modificada — generarían ruido excesivo — sino un único evento a nivel de `ImportJob` con el conteo agregado; el detalle fila por fila queda en `ImportJobError` y en los registros de `creado_en`/`actualizado_en` de cada fila afectada.
- **RN-5**: La vista de auditoría global nunca expone contenido que el usuario que la consulta no tendría permiso de ver en su contexto original (ver sección 8).

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — definición completa de la entidad `HistorialCambio`
- [`16-seguridad.md`](./16-seguridad.md) — garantías de integridad append-only a nivel de RLS
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — mecanismo de auditoría específico para acceso a punteo ajeno
- [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) — permisos que rigen la visibilidad de la auditoría
