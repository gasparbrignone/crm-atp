# Módulo: CRM de Personas

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Ciclo de vida de una ficha](#2-ciclo-de-vida-de-una-ficha)
3. [Alta de una persona](#3-alta-de-una-persona)
4. [Vista de ficha (detalle)](#4-vista-de-ficha-detalle)
5. [Edición de una ficha](#5-edición-de-una-ficha)
6. [Listado de personas](#6-listado-de-personas)
7. [Etiquetado](#7-etiquetado)
8. [Archivado y fusión](#8-archivado-y-fusión)
9. [Reglas de negocio del módulo](#9-reglas-de-negocio-del-módulo)
10. [Permisos relevantes](#10-permisos-relevantes)

---

## 1. Objetivo del módulo

Sostener una **ficha única, completa y confiable por cada estudiante** con el que la organización tuvo o tiene contacto. Es el módulo del que dependen literalmente todos los demás: Actividades, Punteo y Padrón Electoral no tienen sentido sin una base de Personas consistente detrás.

La estructura de datos completa (campos, tipos, restricciones) está documentada en [`04-modelo-datos.md`](./04-modelo-datos.md#5-núcleo-persona); este documento cubre el comportamiento funcional: cómo se crea, edita, visualiza y gestiona una ficha a lo largo de su ciclo de vida.

## 2. Ciclo de vida de una ficha

```
   [Creación]
  manual / import / matching de padrón
        │
        ▼
   ┌──────────┐    fusión detectada y confirmada    ┌────────────┐
   │  ACTIVA   │ ───────────────────────────────────►│  FUSIONADA  │
   └────┬─────┘                                       └────────────┘
        │  archivado manual (ya no pertenece
        │  a la comunidad, egresado, etc.)
        ▼
   ┌────────────┐   reactivación manual   
   │  ARCHIVADA  │ ◄────────────────────── (vuelve a ACTIVA)
   └────────────┘
```

Una ficha puede crearse por tres vías, documentadas en detalle en sus respectivos módulos:

1. **Alta manual** desde la UI (sección 3 de este documento).
2. **Importación masiva** desde Google Sheets, CSV o Excel (ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)).
3. **Lectura automática de un padrón electoral en PDF**, cuando una entrada del padrón no logra vincularse (*matching*) a ninguna persona existente y se decide darla de alta como ficha nueva (ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md)).

En los tres casos, la ficha resultante pasa por el mismo mecanismo de detección de duplicados antes de confirmarse (ver sección 5 de [`15-ia.md`](./15-ia.md)).

## 3. Alta de una persona

### 3.1 Campos del formulario

| Campo | Obligatorio | Notas de UX |
|---|---|---|
| Nombre | Sí | — |
| Apellido | Sí | — |
| DNI | No, pero fuertemente recomendado | Si se completa, dispara la verificación de duplicados por coincidencia exacta (señal más fuerte que nombre/apellido) |
| Legajo | No | — |
| Carrera | No | Selector sobre el catálogo `Carrera` (ver [`18-configuracion-sistema.md`](./18-configuracion-sistema.md)) |
| Año | No | Selector numérico acotado por la duración de referencia de la carrera elegida, cuando está disponible |
| Teléfono principal | No | Se normaliza automáticamente al formato internacional al guardar (ver [`15-ia.md`](./15-ia.md)) |
| Email principal | No | — |
| Instagram | No | Se acepta con o sin `@`, se normaliza sin él |
| Observaciones generales | No | Texto libre, visible para cualquier usuario con acceso de lectura a la ficha — **no** es el lugar para anotaciones de punteo (ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) para la distinción) |
| Etiquetas | No | Selector múltiple sobre el catálogo `Etiqueta`, con opción de crear una etiqueta nueva en el momento |

El formulario permite agregar teléfonos y emails adicionales (no solo el principal) desde el mismo alta, no como paso posterior obligatorio.

### 3.2 Verificación de duplicados en el momento del alta

Antes de confirmar la creación, el sistema ejecuta una verificación de duplicados sobre los datos ingresados — desde el 2026-08-04, resuelta por el Motor de Resolución de Identidad determinístico, no por IA (ver `lib/identidad/README.md` y el algoritmo completo en [`15-ia.md`](./15-ia.md#2-detección-de-duplicados)). Si se detecta una coincidencia probable:

- Se muestra la ficha existente en paralelo al formulario, con los campos que coinciden resaltados.
- El usuario elige entre **"Es la misma persona" → lo lleva al flujo de fusión** (sección 8.2) o **"Es una persona distinta" → confirma el alta igual**, quedando un registro en el historial de que la sugerencia fue descartada explícitamente (para no volver a sugerir la misma coincidencia repetidamente).

## 4. Vista de ficha (detalle)

La ficha de una persona es la pantalla más visitada del sistema y se organiza en pestañas para no saturar la vista:

| Pestaña | Contenido |
|---|---|
| **Datos generales** | Todos los campos estructurados de la sección 3, editables inline con permiso `personas.editar` |
| **Actividades** | Listado de todas sus `Participacion`, con estado y fecha, ordenado por fecha descendente |
| **Punteo** | Visible únicamente si el usuario tiene punteo propio sobre esta persona, o permiso `punteo.ver_todos`. Ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) |
| **Etiquetas** | Gestión de etiquetas asociadas |
| **Historial** | Línea de tiempo de todos los cambios sobre esta ficha, vía `HistorialCambio` — ver [`17-auditoria-historial.md`](./17-auditoria-historial.md) |

El encabezado de la ficha (visible siempre, fuera de las pestañas) muestra: nombre completo, carrera y año, estado de padrón (con color semántico), y las etiquetas activas — es el resumen que un militante necesita ver en dos segundos antes de entrar en detalle.

## 5. Edición de una ficha

- La edición es **inline** por campo (no un formulario modal separado), para minimizar fricción — coherente con el principio de "mobile-first para tareas de campo" de [`01-vision-alcance.md`](./01-vision-alcance.md).
- Cada edición de un campo relevante genera una entrada en `HistorialCambio` con el valor anterior y el nuevo (ver [`17-auditoria-historial.md`](./17-auditoria-historial.md)).
- El campo `estado_padron` **no es editable manualmente**: es siempre resultado del cruce contra el Padrón Electoral activo (ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md)). Si un usuario cree que el estado mostrado es incorrecto, la corrección pasa por revisar la entrada del padrón correspondiente, no por sobrescribir el campo derivado — esto evita que el dato de habilitación para votar quede desincronizado de su fuente oficial.

## 6. Listado de personas

### 6.1 Columnas por defecto

Nombre completo, Carrera, Año, Estado de padrón, Etiquetas, Última actividad registrada. Configurable por el usuario (columnas visibles persistidas por usuario, no solo por sesión).

### 6.2 Filtros

Carrera, año, estado de padrón, estado de ficha (activa por defecto — las archivadas y fusionadas quedan ocultas salvo que se pidan explícitamente), etiquetas (multi-selección), y "con/sin punteo propio" (filtro relevante para que un militante encuentre rápido a quién todavía no punteó).

### 6.3 Paginación y rendimiento

Paginado server-side, 50 registros por página por defecto (configurable por el usuario entre 25/50/100). Nunca se trae el listado completo al cliente — ver justificación de rendimiento en [`03-arquitectura.md`](./03-arquitectura.md#11-rendimiento).

### 6.4 Acciones masivas

Sobre una selección múltiple del listado: asignar etiqueta, exportar selección (ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)), archivar selección (con confirmación explícita, dado que afecta múltiples fichas a la vez).

## 7. Etiquetado

> **Implementado (2026-08-04)**: el catálogo `Etiqueta` (modelo de datos, filtro en el listado) y su gestión centralizada en `/configuracion` (creación, edición, desactivación, fusión de duplicadas — ver `18-configuracion-sistema.md`) ya existían; lo que faltaba (hallazgo de `REVISION-CRITICA-AUDITORIA-2026-08-04.md`) era la asignación desde la ficha o el listado de una Persona, completado esta fecha: selector múltiple en el alta (`components/personas` → `FormularioNuevaPersona`, con opción de crear etiqueta nueva al vuelo), gestión inline en la pestaña "Etiquetas" de la ficha (`EtiquetasPersona`), y la acción masiva "Asignar etiqueta..." del listado — todos descriptos abajo, ahora todos reales. La fusión de dos fichas de Persona (sección 8.2) también re-vincula las etiquetas de la ficha descartada a la definitiva (RN-2, ver `04-modelo-datos.md` sección 18).

- Cualquier usuario con permiso `personas.editar` puede asignar etiquetas existentes; crear una etiqueta nueva desde el selector requiere el mismo permiso (no un permiso adicional, para no friccionar el uso cotidiano).
- Las etiquetas son compartidas por toda la organización (no son privadas por usuario, a diferencia de la clasificación de punteo — ver la distinción explícita en [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#1-distinción-clave-etiqueta-vs-clasificación-de-punteo)).
- Gestión del catálogo global de etiquetas (renombrar, fusionar dos etiquetas equivalentes, desactivar) vive en [`18-configuracion-sistema.md`](./18-configuracion-sistema.md).

## 8. Archivado y fusión

### 8.1 Archivado

Acción reversible que oculta una ficha de los listados y búsquedas por defecto, sin eliminar ningún dato. Casos de uso típicos: una persona que ya no pertenece a la comunidad universitaria (egresó, se dio de baja de la carrera). Requiere permiso `personas.archivar` y queda registrado en `HistorialCambio` con la acción `archivar`.

### 8.2 Fusión de duplicados

Flujo guiado, siempre iniciado por una sugerencia del Motor de Resolución de Identidad (ver sección 3.2) o por una detección manual del usuario, nunca ejecutado automáticamente (principio rector de [`01-vision-alcance.md`](./01-vision-alcance.md#8-principios-de-diseño-rectores)):

1. El usuario ve las dos fichas lado a lado, campo por campo.
2. Para cada campo con valores distintos, elige cuál conservar (por defecto, se sugiere el valor no vacío o el más reciente).
3. Confirma. El sistema aplica `RN-2` (ver [`04-modelo-datos.md`](./04-modelo-datos.md#18-reglas-de-negocio-transversales)): la ficha no elegida pasa a `fusionada`, todas sus `Participacion`, `PunteoPersona` e historial se re-vinculan a la ficha definitiva, y el evento de fusión queda registrado.

El detalle del algoritmo de detección que alimenta este flujo está en [`15-ia.md`](./15-ia.md#2-detección-inteligente-de-duplicados).

## 9. Reglas de negocio del módulo

Además de las reglas transversales `RN-1` a `RN-8` de [`04-modelo-datos.md`](./04-modelo-datos.md#18-reglas-de-negocio-transversales), aplican específicamente a este módulo:

- **No se permite el alta de una ficha sin nombre y apellido.** Es la única combinación de campos verdaderamente obligatoria — todo lo demás (DNI, carrera, contacto) puede completarse después, porque en la práctica real de campo un militante a veces solo tiene el nombre de alguien con quien recién habló.
- **El DNI, cuando se carga, debe ser único.** Si un usuario intenta cargar un DNI ya existente, el sistema bloquea el alta y muestra directamente la ficha existente (no una simple advertencia), porque en este caso la coincidencia es una certeza, no una sugerencia probabilística.
- **Un cambio de carrera o año no borra el historial de actividades previas** de la persona en su carrera/año anterior — esos datos quedan tal como estaban en el momento de cada `Participacion` histórica (la `Participacion` no almacena una copia de carrera/año, los consulta desde la ficha actual; si se necesitara el dato histórico exacto se reconstruye desde `HistorialCambio`).

## 10. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `personas.ver` | Ver el listado y las fichas (salvo pestaña de Punteo, gobernada aparte) |
| `personas.crear` | Alta manual |
| `personas.editar` | Edición de campos y gestión de etiquetas |
| `personas.archivar` | Archivar/restaurar fichas |
| `personas.fusionar_duplicados` | Ejecutar el flujo de fusión |
| `personas.exportar` | Exportar el listado o una selección |

El detalle completo del sistema de permisos y su matriz por rol está en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — estructura de datos de `Persona` y entidades asociadas
- [`07-modulo-participaciones.md`](./07-modulo-participaciones.md) — relación de Persona con Actividades
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — punteo asociado a una Persona
- [`15-ia.md`](./15-ia.md) — detección de duplicados y normalización de datos
