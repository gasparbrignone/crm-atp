# Modelo de Datos

[← Índice general](./00-README.md)

## Índice

1. [Alcance de este documento](#1-alcance-de-este-documento)
2. [Convenciones generales del modelo](#2-convenciones-generales-del-modelo)
3. [Mapa de entidades](#3-mapa-de-entidades)
4. [Catálogos base](#4-catálogos-base)
5. [Núcleo: Persona](#5-núcleo-persona)
6. [Núcleo: Actividad y Participación](#6-núcleo-actividad-y-participación)
7. [Etiquetado](#7-etiquetado)
8. [Usuarios, roles y permisos](#8-usuarios-roles-y-permisos)
9. [Punteo](#9-punteo)
10. [Padrón electoral](#10-padrón-electoral)
11. [Historial y auditoría](#11-historial-y-auditoría)
12. [Notificaciones](#12-notificaciones)
13. [Importaciones y exportaciones](#13-importaciones-y-exportaciones)
14. [Configuración del sistema](#14-configuración-del-sistema)
15. [Chatbot de IA](#15-chatbot-de-ia)
16. [Cardinalidades — resumen general](#16-cardinalidades--resumen-general)
17. [Estrategia general de índices](#17-estrategia-general-de-índices)
18. [Reglas de negocio transversales](#18-reglas-de-negocio-transversales)
19. [Extensibilidad futura del modelo](#19-extensibilidad-futura-del-modelo)

---

## 1. Alcance de este documento

Este documento describe **todas** las entidades del sistema a nivel funcional: sus campos, tipos, restricciones, relaciones y las reglas de negocio que las gobiernan. Es la especificación que luego se traduce en `prisma/schema.prisma` y en las migraciones correspondientes durante la implementación — pero **no contiene** ese código ni esas migraciones, por decisión explícita del alcance de esta etapa (ver [`01-vision-alcance.md`](./01-vision-alcance.md)).

Cada entidad documentada acá tiene, como mínimo, referencia cruzada hacia el módulo funcional que la usa como protagonista.

## 2. Convenciones generales del modelo

Estas convenciones aplican a **todas** las entidades salvo que se indique explícitamente lo contrario:

- **Identificador primario**: toda entidad usa un `id` de tipo **UUID** generado automáticamente, no un entero autoincremental. Motivo: evita filtrado de volumen de datos por IDs secuenciales expuestos en URLs, y facilita la eventual sincronización entre entornos.
- **Timestamps de auditoría base**: toda entidad de negocio (no los catálogos ni las tablas puramente técnicas) incluye `fecha_creacion` (fecha y hora, autogenerada al insertar) y `fecha_modificacion` (fecha y hora, actualizada automáticamente en cada `UPDATE`).
- **Autoría**: toda entidad de negocio incluye `creado_por` y `modificado_por`, referencias al `Usuario` que ejecutó la acción. Puede ser nulo únicamente en registros creados por procesos automáticos del sistema (por ejemplo, un `Insight` generado por IA), en cuyo caso se documenta explícitamente en la entidad correspondiente.
- **Borrado**: ninguna entidad de negocio central (Persona, Actividad, Participación, PunteoPersona, PunteoComentario) admite borrado físico (`DELETE`) desde la aplicación. Todas implementan **soft delete** mediante un campo `estado` o `archivado` (ver el detalle en cada entidad) y su eliminación lógica queda registrada en el Historial. Los catálogos (Carrera, TipoActividad, Etiqueta) sí pueden desactivarse (`activo = false`) pero tampoco se eliminan físicamente si tienen registros asociados, para no romper integridad referencial histórica.
- **Nombres**: los nombres de entidades y campos de negocio se documentan en español, reflejando el lenguaje ubicuo del [glosario](./02-glosario.md). La traducción a convenciones técnicas (camelCase, nombres de tabla en inglés si así se decidiera durante la implementación) es una decisión de la etapa de código, no de este documento.

## 3. Mapa de entidades

Vista de alto nivel de todas las entidades y su agrupación funcional. El detalle de cada una está en las secciones siguientes.

| Grupo | Entidades |
|---|---|
| Catálogos base | `Carrera`, `TipoActividad` |
| Núcleo CRM | `Persona`, `Actividad`, `Participacion` |
| Etiquetado | `Etiqueta`, `PersonaEtiqueta` |
| Usuarios y acceso | `Usuario`, `Rol`, `Permiso`, `RolPermiso` |
| Punteo | `PunteoPersona`, `PunteoComentario`, `ClasificacionPunteo` (catálogo) |
| Padrón electoral | `PadronElectoral`, `PadronEntrada` |
| Historial y auditoría | `HistorialCambio` |
| Notificaciones | `Notificacion` |
| Datos masivos | `ImportJob`, `ImportJobError`, `ExportJob` |
| Configuración | `ConfiguracionSistema` |
| IA / Chatbot | `ChatbotConversacion`, `ChatbotMensaje` |

## 4. Catálogos base

Los catálogos son entidades administrables desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md). Se modelan como tablas propias (no como `ENUM` de base de datos) para que se puedan agregar o desactivar valores sin una migración de esquema.

### 4.1 Carrera

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | Identificador |
| `nombre` | Texto corto | Obligatorio, único | Ej.: "Medicina", "Licenciatura en Enfermería" |
| `duracion_anios` | Numérico entero | Opcional | Duración de referencia de la carrera, usada como límite superior sugerido (no forzado) del campo `Persona.anio` |
| `activo` | Booleano | Default `true` | Permite retirar una carrera de los formularios sin borrar el historial de personas que la cursan/cursaron |
| `orden` | Numérico entero | Opcional | Orden de aparición en selectores |

> **Nota de carga inicial**: como referencia para la carga inicial de este catálogo (a confirmar y completar por el equipo de la organización, no como lista cerrada), la facultad organiza su oferta de grado en tres escuelas — Medicina, Enfermería y Fonoaudiología — a las que se suma la Licenciatura en Terapia Ocupacional. Esta lista se carga como datos, no como valores fijos en el código, precisamente para que quede bajo control total de la organización.

### 4.2 TipoActividad

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | Identificador |
| `nombre` | Texto corto | Obligatorio, único | Ej.: "Repaso", "Simulacro", "Congreso", "Capacitación", "Charla", "Jornada", "Grupo de estudio" |
| `color` | Texto corto | Opcional | Color asociado, usado para diferenciar visualmente tipos de actividad en calendario y dashboard |
| `activo` | Booleano | Default `true` | — |
| `orden` | Numérico entero | Opcional | — |

Ver uso completo en [`06-modulo-actividades.md`](./06-modulo-actividades.md).

## 5. Núcleo: Persona

La entidad central del sistema. Ver el detalle funcional completo (estados, ciclo de vida, reglas de unicidad) en [`05-modulo-personas.md`](./05-modulo-personas.md); esta sección documenta exclusivamente su estructura de datos.

### 5.1 Persona

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | Identificador |
| `nombre` | Texto corto | Obligatorio | Nombre de pila |
| `apellido` | Texto corto | Obligatorio | Apellido |
| `dni` | Texto corto | Opcional, único cuando no es nulo | Documento de identidad. Campo clave para el cruce con el Padrón Electoral |
| `legajo` | Texto corto | Opcional, único cuando no es nulo | Número de legajo universitario (sistema SIU-Guaraní u equivalente) |
| `carrera_id` | UUID | FK → `Carrera.id`, opcional | Carrera que cursa |
| `anio` | Numérico entero | Opcional, 1 a 6 | Año de cursada dentro de su carrera |
| `instagram` | Texto corto | Opcional | Usuario de Instagram, sin el `@` |
| `observaciones_generales` | Texto largo | Opcional | Notas generales no confidenciales, visibles para cualquier usuario con acceso a la ficha (distinto de los comentarios de punteo, que son privados — ver sección 9) |
| `estado_padron` | Enum | Default `no_evaluado` | `no_evaluado` \| `en_padron_habilitado` \| `en_padron_no_habilitado` \| `no_encontrado_en_padron`. Campo **derivado**, recalculado automáticamente al importar o actualizar un Padrón Electoral (ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md)); no editable manualmente |
| `estado_ficha` | Enum | Default `activa` | `activa` \| `archivada` \| `fusionada`. Soft delete y trazabilidad de fusiones (ver sección 18.2) |
| `fusionada_en_id` | UUID | FK → `Persona.id`, opcional | Si `estado_ficha = fusionada`, apunta a la ficha resultante de la fusión |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |
| `fecha_modificacion` | Fecha y hora | Autogenerado | — |
| `creado_por` | UUID | FK → `Usuario.id`, opcional | Nulo si la ficha se creó por una importación sin usuario asociado directo (poco frecuente; normalmente el usuario que ejecuta la importación queda como autor) |
| `modificado_por` | UUID | FK → `Usuario.id`, opcional | — |

**Relaciones de Persona** (todas documentadas en detalle en sus secciones propias): teléfonos (1—N), emails (1—N), etiquetas (N—M vía `PersonaEtiqueta`), participaciones (1—N vía `Participacion`), punteos (1—N vía `PunteoPersona`, uno por cada `Usuario` que la puntea).

### 5.2 PersonaTelefono

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `persona_id` | UUID | FK → `Persona.id`, obligatorio | — |
| `numero` | Texto corto | Obligatorio | Se almacena normalizado (ver [`15-ia.md`](./15-ia.md)) en formato internacional, ej. `+549341XXXXXXX` |
| `es_principal` | Booleano | Default `false` | Exactamente un teléfono por Persona debe tener `es_principal = true` cuando existe al menos un teléfono cargado (regla de negocio, ver sección 18.3) |
| `notas` | Texto corto | Opcional | Ej.: "WhatsApp", "no responde llamadas" |
| `origen` | Enum `OrigenDato` | Opcional | `alta_manual` \| `importacion_csv` \| `importacion_actividad` \| `padron` \| `editado_manual`. `NULL` en registros previos al 2026-08-04 (dato desconocido, no se infiere retroactivamente) — ver `PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md` sección 3.3 |
| `fecha_creacion` | Fecha y hora | Autogenerado | Junto con `es_principal`, permite distinguir "el principal" de "el último cargado" (no siempre son el mismo) |

### 5.3 PersonaEmail

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `persona_id` | UUID | FK → `Persona.id`, obligatorio | — |
| `email` | Texto corto | Obligatorio, formato válido de correo | — |
| `es_principal` | Booleano | Default `false` | Misma regla que en `PersonaTelefono` |
| `origen` | Enum `OrigenDato` | Opcional | Mismo enum y mismo criterio que en `PersonaTelefono` |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |

## 6. Núcleo: Actividad y Participación

Ver detalle funcional en [`06-modulo-actividades.md`](./06-modulo-actividades.md) y [`07-modulo-participaciones.md`](./07-modulo-participaciones.md).

### 6.1 Actividad

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre` | Texto corto | Obligatorio | — |
| `tipo_actividad_id` | UUID | FK → `TipoActividad.id`, obligatorio | — |
| `descripcion` | Texto largo | Opcional | — |
| `fecha_inicio` | Fecha y hora | Obligatorio | — |
| `fecha_fin` | Fecha y hora | Opcional | Puede ser nulo para actividades de duración abierta (ej. un grupo de estudio recurrente sin fecha de cierre definida) |
| `modalidad` | Enum | Default `presencial` | `presencial` \| `virtual` \| `hibrida` |
| `lugar` | Texto corto | Opcional | Dirección o nombre del espacio; irrelevante si `modalidad = virtual` |
| `cupo_maximo` | Numérico entero | Opcional | Nulo = sin límite |
| `estado` | Enum | Default `planificada` | `planificada` \| `en_curso` \| `finalizada` \| `cancelada` |
| `responsable_id` | UUID | FK → `Usuario.id`, obligatorio | Usuario responsable principal de la actividad |
| `actividad_padre_id` | UUID | FK → `Actividad.id`, opcional, autorreferencia | Permite agrupar sub-actividades bajo un evento mayor (ver supuesto S5 en [`01-vision-alcance.md`](./01-vision-alcance.md) y ejemplo en [`06-modulo-actividades.md`](./06-modulo-actividades.md)) |
| `observaciones` | Texto largo | Opcional | — |
| `fecha_creacion` / `fecha_modificacion` / `creado_por` / `modificado_por` | — | — | Estándar (ver sección 2) |

### 6.2 Participacion

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `persona_id` | UUID | FK → `Persona.id`, obligatorio | — |
| `actividad_id` | UUID | FK → `Actividad.id`, obligatorio | — |
| `estado` | Enum | Default `inscripto` | `inscripto` \| `confirmado` \| `asistio` \| `ausente` \| `cancelado` |
| `fecha_inscripcion` | Fecha y hora | Autogenerado | — |
| `fecha_asistencia` | Fecha y hora | Opcional | Se completa al marcar `estado = asistio` |
| `observaciones` | Texto largo | Opcional | — |
| `fecha_creacion` / `fecha_modificacion` / `creado_por` / `modificado_por` | — | — | Estándar |

**Restricción de unicidad**: el par (`persona_id`, `actividad_id`) es único. Una persona no puede tener dos registros de participación para la misma actividad (si se re-habilita su inscripción, se actualiza el registro existente, no se crea uno nuevo — ver regla de negocio en sección 18.4).

## 7. Etiquetado

### 7.1 Etiqueta

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre` | Texto corto | Obligatorio, único | — |
| `color` | Texto corto | Opcional | — |
| `categoria` | Texto corto | Opcional | Agrupador libre (ej. "rol dentro del curso", "prioridad") |
| `activo` | Booleano | Default `true` | — |
| `orden` | Entero | Opcional | Posición de presentación en selectores, igual que en los otros 3 catálogos editables (sección 2 de `18-configuracion-sistema.md`) |
| `creado_por` | UUID | FK → `Usuario.id` | — |

> **Corrección 2026-08-04**: `orden` faltaba en esta tabla (y en el modelo Prisma real) desde el alta original del catálogo — bug real encontrado al construir la UI de asignación de etiquetas (`05-modulo-personas.md` sección 7): `/configuracion?tab=etiqueta` tiraba un error en cada visita porque el código de gestión de catálogos (`lib/servicios/configuracion.service.ts`) ya asumía este campo para los 4 catálogos por igual. Corregido con la migración `20260804115920_etiqueta_orden` (con backfill alfabético para las etiquetas ya cargadas).

### 7.2 PersonaEtiqueta

Tabla de unión para la relación N—M entre `Persona` y `Etiqueta`.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `persona_id` | UUID | FK → `Persona.id`, obligatorio | — |
| `etiqueta_id` | UUID | FK → `Etiqueta.id`, obligatorio | — |
| `fecha_asignacion` | Fecha y hora | Autogenerado | — |
| `asignado_por` | UUID | FK → `Usuario.id` | — |

**Restricción de unicidad**: el par (`persona_id`, `etiqueta_id`) es único.

## 8. Usuarios, roles y permisos

Ver detalle funcional completo en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

### 8.1 Usuario

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK, igual al `id` de Supabase Auth | La tabla `Usuario` extiende, no duplica, la identidad que gestiona Supabase Auth |
| `nombre` | Texto corto | Obligatorio | — |
| `apellido` | Texto corto | Obligatorio | — |
| `email` | Texto corto | Obligatorio, único | Sincronizado con Supabase Auth |
| `rol_id` | UUID | FK → `Rol.id`, obligatorio | Ver supuesto S3: un único rol principal por usuario en la v1 |
| `estado` | Enum | Default `activo` | `activo` \| `inactivo`. Un usuario `inactivo` no puede iniciar sesión pero conserva su historial de acciones y su punteo (que pasa a ser visible por el Administrador para continuidad organizacional) |
| `telefono` | Texto corto | Opcional | — |
| `ultimo_acceso` | Fecha y hora | Opcional, autogenerado | — |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |

### 8.2 Rol

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre` | Texto corto | Obligatorio, único | Ej.: "Administrador", "Coordinador", "Militante", "Lectura" |
| `descripcion` | Texto largo | Opcional | — |
| `es_rol_sistema` | Booleano | Default `false` | `true` para los cuatro roles base (no pueden eliminarse, solo editarse en su set de permisos); `false` para roles adicionales creados por un Administrador |

### 8.3 Permiso

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `codigo` | Texto corto | Obligatorio, único | Formato `modulo.accion`, ej. `personas.editar` |
| `modulo` | Texto corto | Obligatorio | Agrupador para la UI de gestión de permisos, ej. `personas`, `punteo`, `padron` |
| `descripcion` | Texto corto | Obligatorio | Descripción legible, ej. "Editar fichas de personas" |

El catálogo completo de permisos se documenta en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md), no se repite acá para evitar duplicación que pueda desincronizarse.

### 8.4 RolPermiso

Tabla de unión N—M entre `Rol` y `Permiso`.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `rol_id` | UUID | FK → `Rol.id`, obligatorio | — |
| `permiso_id` | UUID | FK → `Permiso.id`, obligatorio | — |

**Restricción de unicidad**: el par (`rol_id`, `permiso_id`) es único.

## 9. Punteo

Ver detalle funcional completo (incluyendo el marco legal aplicable) en [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) y [`16-seguridad.md`](./16-seguridad.md).

### 9.1 ClasificacionPunteo (catálogo)

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre` | Texto corto | Obligatorio, único | Valor por defecto sugerido: "Sin contactar", "Favorable", "Indeciso", "Desfavorable", "No ubicable" |
| `color` | Texto corto | Opcional | — |
| `orden` | Numérico entero | Opcional | — |
| `activo` | Booleano | Default `true` | — |

Se modela como catálogo (no como `ENUM`) deliberadamente: es el campo más políticamente sensible de todo el sistema y su taxonomía exacta debe quedar 100% en manos de la organización, administrable sin despliegue de código.

### 9.2 PunteoPersona

Registro único por cada par (`Usuario`, `Persona`): el estado actual del punteo que ese usuario mantiene sobre esa persona.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `usuario_id` | UUID | FK → `Usuario.id`, obligatorio | Dueño del punteo |
| `persona_id` | UUID | FK → `Persona.id`, obligatorio | — |
| `clasificacion_id` | UUID | FK → `ClasificacionPunteo.id`, opcional | Nulo hasta la primera clasificación manual |
| `estado_seguimiento` | Enum | Default `sin_iniciar` | `sin_iniciar` \| `en_seguimiento` \| `contactado` \| `requiere_reintento` \| `cerrado` |
| `fecha_ultima_actualizacion` | Fecha y hora | Autogenerado | — |

**Restricción de unicidad**: el par (`usuario_id`, `persona_id`) es único.
**Restricción de acceso**: ver política de RLS específica en [`16-seguridad.md`](./16-seguridad.md) — solo `usuario_id` y usuarios con permiso `punteo.ver_todos` pueden leer un registro dado.

### 9.3 PunteoComentario

Bitácora de comentarios/observaciones de seguimiento, en relación 1—N con `PunteoPersona`. Es lo que el enunciado original describe como "comentarios privados" y "seguimiento".

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `punteo_persona_id` | UUID | FK → `PunteoPersona.id`, obligatorio | — |
| `contenido` | Texto largo | Obligatorio | — |
| `fecha_creacion` | Fecha y hora | Autogenerado | Los comentarios no se editan una vez creados (se puede agregar un comentario nuevo, no reescribir el pasado) — ver regla de negocio en sección 18.5 |

## 10. Padrón electoral

Ver detalle funcional completo en [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md).

### 10.1 PadronElectoral

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre` | Texto corto | Obligatorio | Ej.: "Elecciones de Centro de Estudiantes — 2027" |
| `fecha_eleccion` | Fecha | Opcional | — |
| `estado` | Enum | Default `borrador` | `borrador` \| `activo` \| `cerrado`. Ver supuesto S2 (un único padrón `activo` a la vez) |
| `archivo_origen_id` | Texto corto | Opcional | Referencia al archivo original en Supabase Storage |
| `fecha_carga` | Fecha y hora | Autogenerado | — |
| `cargado_por` | UUID | FK → `Usuario.id` | — |

### 10.2 PadronEntrada

Cada fila del padrón oficial tal como fue publicado, antes o después del cruce (*matching*) contra `Persona`.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `padron_electoral_id` | UUID | FK → `PadronElectoral.id`, obligatorio | — |
| `dni` | Texto corto | Obligatorio | Tal como figura en el documento oficial |
| `nombre_completo_original` | Texto corto | Obligatorio | Texto tal cual extraído del PDF, sin normalizar, para trazabilidad |
| `carrera_texto_original` | Texto corto | Opcional | — |
| `persona_id` | UUID | FK → `Persona.id`, opcional | Nulo hasta que el proceso de *matching* (manual o asistido por IA) lo vincule |
| `estado_matching` | Enum | Default `pendiente` | `pendiente` \| `vinculado_automatico` \| `vinculado_manual` \| `sin_coincidencia` |
| `confianza_matching` | Numérico decimal | Opcional | Puntaje 0–1 devuelto por el proceso de *matching* asistido por IA, ver [`15-ia.md`](./15-ia.md) |

## 11. Historial y auditoría

Ver detalle funcional en [`17-auditoria-historial.md`](./17-auditoria-historial.md).

### 11.1 HistorialCambio

Tabla única, genérica, que registra tanto el historial de cambios de entidades (por ejemplo, la ficha de una Persona) como los eventos de auditoría a nivel sistema (por ejemplo, un login o una exportación). Es intencionalmente una sola tabla, no dos, para tener un único punto de escritura auditable.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `entidad` | Texto corto | Obligatorio | Nombre de la entidad afectada, ej. `Persona`, `Actividad`, `PunteoPersona` |
| `entidad_id` | UUID | Obligatorio | ID del registro afectado (sin FK física, dado que `entidad` varía — la integridad se garantiza a nivel de aplicación) |
| `accion` | Enum | Obligatorio | `crear` \| `editar` \| `archivar` \| `restaurar` \| `fusionar` \| `exportar` \| `importar` \| `login` \| `cambio_permiso` \| `otro` |
| `campo` | Texto corto | Opcional | Nombre del campo modificado, si la acción es a nivel de campo |
| `valor_anterior` | Texto largo | Opcional | Serializado; nulo cuando no aplica (ej. `login`) |
| `valor_nuevo` | Texto largo | Opcional | — |
| `usuario_id` | UUID | FK → `Usuario.id`, opcional | Nulo únicamente en eventos generados por procesos automáticos (ver sección 18.6) |
| `fecha` | Fecha y hora | Autogenerado, obligatorio | — |
| `metadata` | Texto largo (JSON) | Opcional | Contexto adicional (ej. IP de origen, ID de la importación que originó el cambio) |

**Regla de append-only**: esta tabla no admite `UPDATE` ni `DELETE` desde la aplicación, solo `INSERT`. Es la garantía técnica central de que la auditoría es confiable.

### 11.2 VeredictoIdentidad

**Agregada 2026-08-04** — ver `PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md` sección 3.9. Registra cada vez que un humano confirma o rechaza una sugerencia de posible duplicado del Motor de Resolución de Identidad (`lib/identidad/`, ver su README) — alta manual, fusión de fichas, o revisión de padrón. No decide nada por sí sola: es un corpus de veredictos reales para, cuando haya volumen suficiente, recalibrar `umbral_confianza_duplicados` contra casos reales en vez de solo el corpus sintético del benchmark (`lib/identidad/BENCHMARK-RESULTADOS.md`).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `nombre_objetivo` | Texto largo | Obligatorio | Nombre completo que se estaba evaluando (el nuevo dato entrante) |
| `candidato_id` | UUID | Obligatorio, sin FK física | ID de la Persona candidata evaluada (puede quedar apuntando a una ficha luego fusionada o archivada — no se seguiría automáticamente) |
| `confianza` | Decimal(4,3) | Obligatorio | Confianza recalculada en el momento de capturar el veredicto (no un valor guardado de antes, que puede no existir — ej. vinculación manual sin candidatos automáticos previos) |
| `explicacion` | Texto largo | Obligatorio | Desglose legible de las señales del motor para ese par, igual formato que se muestra en la UI de sugerencias |
| `decision` | Enum | Obligatorio | `misma_persona` \| `distinta_persona` |
| `contexto` | Texto corto | Obligatorio | `alta_manual` \| `fusion_manual` \| `padron` |
| `usuario_id` | UUID | FK → `Usuario.id`, opcional | — |
| `fecha` | Fecha y hora | Autogenerado, obligatorio | — |

No es append-only por regla explícita como `HistorialCambio` (no forma parte de la auditoría de acciones sobre una entidad), pero en la práctica tampoco se edita ni se borra desde la aplicación — es un log de eventos de captura, igual de inmutable en los hechos.

## 12. Notificaciones

Ver detalle funcional en [`13-notificaciones.md`](./13-notificaciones.md).

### 12.1 Notificacion

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `usuario_id` | UUID | FK → `Usuario.id`, obligatorio | Destinatario |
| `tipo` | Enum | Obligatorio | `informativa` \| `accionable` \| `alerta` |
| `titulo` | Texto corto | Obligatorio | — |
| `mensaje` | Texto largo | Obligatorio | — |
| `entidad_relacionada` | Texto corto | Opcional | Ej. `Persona`, para poder armar el enlace de destino |
| `entidad_relacionada_id` | UUID | Opcional | — |
| `leida` | Booleano | Default `false` | — |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |
| `fecha_lectura` | Fecha y hora | Opcional | — |

## 13. Importaciones y exportaciones

Ver detalle funcional completo en [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md).

### 13.1 ImportJob

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `tipo_origen` | Enum | Obligatorio | `google_sheets` \| `csv` \| `excel` \| `pdf` |
| `entidad_destino` | Enum | Obligatorio | `Persona` \| `PadronElectoral` \| `Actividad` |
| `estado` | Enum | Default `pendiente` | `pendiente` \| `procesando` \| `en_revision` \| `completado` \| `completado_con_errores` \| `fallido` |
| `archivo_origen_id` | Texto corto | Opcional | Referencia en Supabase Storage |
| `total_filas` | Numérico entero | Opcional | — |
| `filas_exitosas` | Numérico entero | Default 0 | — |
| `filas_con_error` | Numérico entero | Default 0 | — |
| `duplicados_detectados` | Numérico entero | Default 0 | — |
| `usuario_id` | UUID | FK → `Usuario.id`, obligatorio | — |
| `fecha_inicio` | Fecha y hora | Autogenerado | — |
| `fecha_fin` | Fecha y hora | Opcional | — |

### 13.2 ImportJobError

Detalle fila por fila de los errores de una importación, en relación 1—N con `ImportJob` (ver justificación de por qué esto es obligatorio, no opcional, en [`03-arquitectura.md`](./03-arquitectura.md), sección 13).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `import_job_id` | UUID | FK → `ImportJob.id`, obligatorio | — |
| `numero_fila` | Numérico entero | Obligatorio | — |
| `contenido_original` | Texto largo | Obligatorio | La fila cruda, para que el usuario pueda corregir y reintentar |
| `mensaje_error` | Texto corto | Obligatorio | — |

### 13.3 ExportJob

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `entidad_origen` | Enum | Obligatorio | `Persona` \| `Actividad` \| `Participacion` \| `PadronElectoral` |
| `formato` | Enum | Obligatorio | `csv` \| `excel` \| `pdf` |
| `filtros_aplicados` | Texto largo (JSON) | Opcional | Filtros usados al momento de exportar, para trazabilidad de qué se compartió |
| `usuario_id` | UUID | FK → `Usuario.id`, obligatorio | — |
| `fecha` | Fecha y hora | Autogenerado | — |

## 14. Configuración del sistema

Ver detalle funcional en [`18-configuracion-sistema.md`](./18-configuracion-sistema.md).

### 14.1 ConfiguracionSistema

Modelo clave-valor para parámetros globales que no ameritan una tabla propia.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `clave` | Texto corto | Obligatorio, único | Ej. `umbral_confianza_duplicados`, `nombre_organizacion` |
| `valor` | Texto largo | Obligatorio | Serializado según el tipo esperado por esa clave |
| `descripcion` | Texto corto | Opcional | — |
| `modificado_por` | UUID | FK → `Usuario.id` | — |
| `fecha_modificacion` | Fecha y hora | Autogenerado | — |

## 15. Chatbot de IA

Ver detalle funcional en [`15-ia.md`](./15-ia.md).

### 15.1 ChatbotConversacion

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `usuario_id` | UUID | FK → `Usuario.id`, obligatorio | — |
| `titulo` | Texto corto | Opcional | Generado automáticamente a partir del primer mensaje |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |

### 15.2 ChatbotMensaje

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | — |
| `conversacion_id` | UUID | FK → `ChatbotConversacion.id`, obligatorio | — |
| `rol` | Enum | Obligatorio | `usuario` \| `asistente` |
| `contenido` | Texto largo | Obligatorio | — |
| `consultas_ejecutadas` | Texto largo (JSON) | Opcional | Registro de qué consultas de solo lectura se ejecutaron para responder, con fines de auditoría (ver [`15-ia.md`](./15-ia.md) y [`16-seguridad.md`](./16-seguridad.md)) |
| `fecha_creacion` | Fecha y hora | Autogenerado | — |

## 16. Cardinalidades — resumen general

| Relación | Cardinalidad | Notas |
|---|---|---|
| Persona — PersonaTelefono | 1 — N | — |
| Persona — PersonaEmail | 1 — N | — |
| Persona — Carrera | N — 1 | Opcional |
| Persona — Etiqueta | N — M | vía `PersonaEtiqueta` |
| Persona — Actividad | N — M | vía `Participacion` |
| Persona — PadronEntrada | 1 — 1 (opcional) | Una persona se vincula a lo sumo a una entrada por cada `PadronElectoral` |
| Actividad — TipoActividad | N — 1 | Obligatorio |
| Actividad — Actividad (padre) | N — 1 | Opcional, autorreferencia |
| Usuario — Rol | N — 1 | Un rol agrupa muchos usuarios (ver supuesto S3) |
| Rol — Permiso | N — M | vía `RolPermiso` |
| Usuario — PunteoPersona | 1 — N | Un usuario puntea a muchas personas |
| Persona — PunteoPersona | 1 — N | Una persona puede ser punteada por muchos usuarios, cada uno con su propio registro independiente |
| PunteoPersona — PunteoComentario | 1 — N | — |
| PadronElectoral — PadronEntrada | 1 — N | — |
| Usuario — ImportJob / ExportJob | 1 — N | — |
| ImportJob — ImportJobError | 1 — N | — |
| Usuario — ChatbotConversacion | 1 — N | — |
| ChatbotConversacion — ChatbotMensaje | 1 — N | — |
| (cualquier entidad) — HistorialCambio | 1 — N | Vía `entidad` + `entidad_id`, sin FK física |

## 17. Estrategia general de índices

Principios aplicados de forma consistente (el detalle exacto de índices se ajusta durante la implementación, pero estas son las decisiones que no deben omitirse):

- **Toda FK tiene índice.** Sin excepción — es el patrón de consulta más común del sistema (traer todas las Participaciones de una Persona, todos los PunteoComentario de un PunteoPersona, etc.).
- **Búsqueda por identificador humano**: `Persona.dni` y `Persona.legajo` requieren índice único, dado que son la vía principal de búsqueda exacta y de *matching* contra el padrón.
- **Búsqueda difusa de texto**: `Persona.nombre`, `Persona.apellido` y `Actividad.nombre` requieren índices de tipo *trigram* (extensión `pg_trgm` de PostgreSQL) para soportar búsqueda tolerante a errores de tipeo desde el [buscador global](./12-buscador-global.md), además de la extensión `unaccent` para ignorar tildes.
- **Filtros combinados frecuentes**: `Persona` requiere un índice compuesto sobre (`carrera_id`, `anio`, `estado_padron`), que es el patrón de filtro más habitual desde el dashboard y los listados.
- **`HistorialCambio`** requiere índice compuesto sobre (`entidad`, `entidad_id`, `fecha`) para poder traer eficientemente "todo el historial de esta ficha puntual, ordenado por fecha", que es su patrón de consulta dominante.
- **`PunteoPersona`** requiere índice compuesto sobre (`usuario_id`, `persona_id`) — coincide con la restricción de unicidad, por lo que ese mismo índice cubre ambos propósitos.

## 18. Reglas de negocio transversales

Estas reglas complementan lo ya indicado campo por campo. Cada una tiene un identificador (`RN-x`) para poder referenciarla desde otros documentos sin ambigüedad.

**RN-1 — Unicidad de persona.** El sistema no debe permitir intencionalmente dos fichas para el mismo individuo. La prevención activa (detección de duplicados al crear o importar) se documenta en [`15-ia.md`](./15-ia.md); esta regla define el objetivo, no el mecanismo.

**RN-2 — Fusión conserva historia.** Al fusionar dos fichas de Persona, la ficha no elegida como definitiva pasa a `estado_ficha = fusionada` con `fusionada_en_id` apuntando a la definitiva. No se borra físicamente. Toda `Participacion`, `PunteoPersona`, `PadronEntrada`, `PersonaEtiqueta` y entrada de `HistorialCambio` que apuntaba a la ficha fusionada se re-vincula a la ficha definitiva (para las relaciones con restricción de unicidad — `Participacion` por actividad, `PunteoPersona` por usuario, `PersonaEtiqueta` por etiqueta — si la definitiva ya tenía la misma relación, la de la descartada se descarta en vez de duplicarla, igual que RN-4 para re-inscripciones), y el propio evento de fusión queda registrado en `HistorialCambio`. **Nota 2026-08-04**: la re-vinculación de `PersonaEtiqueta` faltaba en la implementación hasta esta fecha — no era alcanzable en la práctica porque todavía no existía ninguna UI para asignar etiquetas a una Persona (ver `05-modulo-personas.md` sección 7); corregido al construir esa UI.

**RN-3 — Un único contacto principal por tipo.** Para `PersonaTelefono` y `PersonaEmail`, exactamente un registro por Persona puede tener `es_principal = true` cuando existe al menos uno cargado. Al marcar uno nuevo como principal, el anterior se desmarca automáticamente en la misma operación (transacción única).

**RN-4 — Una participación por persona y actividad.** Re-inscribir a una persona que ya tiene un registro de `Participacion` para esa actividad actualiza el registro existente (típicamente revirtiendo un estado `cancelado` a `inscripto`) en lugar de crear un duplicado.

**RN-5 — Los comentarios de punteo son inmutables una vez creados.** `PunteoComentario` no admite edición ni borrado desde la UI estándar — solo alta de nuevos comentarios. Esto preserva la integridad del seguimiento histórico. Una corrección se hace agregando un comentario nuevo que aclare la corrección, nunca reescribiendo el pasado. (Una eliminación excepcional por error grave de carga queda reservada al rol Administrador y se registra igualmente en `HistorialCambio`.)

**RN-6 — Autoría de eventos automáticos.** Los registros de `HistorialCambio` generados por procesos automáticos (por ejemplo, el recálculo de `estado_padron` tras importar un padrón) tienen `usuario_id` nulo pero `metadata` obligatorio, identificando el proceso que lo generó (ej. `{"proceso": "matching_padron", "import_job_id": "..."}"`), para que nunca quede un cambio sin explicación aunque no tenga un usuario humano asociado.

**RN-7 — Los catálogos no se eliminan si están en uso.** `Carrera`, `TipoActividad`, `Etiqueta` y `ClasificacionPunteo` solo pueden desactivarse (`activo = false`), nunca eliminarse, si existe al menos un registro que los referencia. Un valor desactivado deja de ofrecerse en formularios nuevos pero se sigue mostrando correctamente en los registros históricos que ya lo usan.

**RN-8 — Integridad del padrón activo.** Solo puede existir un `PadronElectoral` con `estado = activo` a la vez (ver supuesto S2). Activar uno nuevo requiere cerrar explícitamente el anterior (`estado = cerrado`) en la misma operación.

## 19. Extensibilidad futura del modelo

Estas notas no implican trabajo a realizar en el alcance actual; documentan **por qué el modelo actual no bloquea** una evolución futura, para que decisiones de esta etapa no se tomen de forma que compliquen innecesariamente ese camino:

- **Multi-organización**: si en el futuro el sistema debiera soportar más de una agrupación u otra facultad, el punto de extensión natural es agregar una entidad `Organizacion` y un campo `organizacion_id` en las entidades raíz (`Persona`, `Actividad`, `Usuario`, `PadronElectoral`). El uso de UUIDs como identificadores primarios y la ausencia de lógica que asuma "una sola organización" en el resto del modelo hacen que este cambio sea aditivo, no una reescritura.
- **Roles múltiples por usuario**: si el supuesto S3 se revisara, `Usuario.rol_id` se reemplazaría por una tabla de unión `UsuarioRol`, siguiendo exactamente el mismo patrón ya usado en `RolPermiso`.
- **Múltiples padrones activos simultáneos**: si la organización necesitara gestionar, por ejemplo, elecciones de dos claustros en paralelo, el modelo ya soporta múltiples `PadronElectoral`; solo cambiaría la regla de negocio RN-8 (de "uno activo" a "uno activo por categoría de elección"), agregando un campo `categoria` a `PadronElectoral`.

---

### Documentos relacionados

- [`03-arquitectura.md`](./03-arquitectura.md) — cómo este modelo se traduce en Prisma y Postgres
- [`16-seguridad.md`](./16-seguridad.md) — políticas de Row Level Security por entidad
- [`17-auditoria-historial.md`](./17-auditoria-historial.md) — uso funcional detallado de `HistorialCambio`
