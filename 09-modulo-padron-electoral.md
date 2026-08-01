# Módulo: Gestión de Padrones Electorales

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Distinción clave: padrón vs. punteo](#2-distinción-clave-padrón-vs-punteo)
3. [Ciclo de vida de un padrón](#3-ciclo-de-vida-de-un-padrón)
4. [Carga de un padrón](#4-carga-de-un-padrón)
5. [Proceso de matching contra Personas](#5-proceso-de-matching-contra-personas)
6. [Revisión manual del matching](#6-revisión-manual-del-matching)
7. [Efecto sobre el estado de la ficha de Persona](#7-efecto-sobre-el-estado-de-la-ficha-de-persona)
8. [Vista del padrón](#8-vista-del-padrón)
9. [Reglas de negocio del módulo](#9-reglas-de-negocio-del-módulo)
10. [Permisos relevantes](#10-permisos-relevantes)

---

## 1. Objetivo del módulo

Digitalizar el padrón electoral oficial (publicado por la facultad o la universidad, típicamente en PDF) y cruzarlo automáticamente contra la base de `Persona` del sistema, para que en todo momento se sepa, de forma confiable y sin trabajo manual repetido, quién está habilitado para votar en la elección vigente.

Este módulo es uno de los principales consumidores de las capacidades de IA del sistema (lectura automática de PDFs) — ver el detalle técnico de ese proceso en [`15-ia.md`](./15-ia.md#4-lectura-automática-de-padrones-en-pdf).

## 2. Distinción clave: padrón vs. punteo

Es fundamental no confundir estos dos módulos, que manejan información electoral pero de naturaleza completamente distinta:

| | Padrón Electoral | Punteo |
|---|---|---|
| ¿Qué mide? | Un hecho objetivo y oficial: quién está habilitado para votar | Una percepción subjetiva de un militante: afinidad probable de esa persona |
| ¿Quién lo publica? | La universidad/facultad (fuente externa oficial) | Cada usuario, sobre su propio criterio |
| ¿Es privado? | No — el estado de padrón de una persona es visible para cualquiera con acceso a su ficha | Sí — estrictamente privado por usuario (ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md)) |
| Documento | Este documento | [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) |

## 3. Ciclo de vida de un padrón

```
borrador → activo → cerrado
```

- **borrador**: recién importado, en proceso de revisión de *matching* (sección 6). Todavía no afecta `Persona.estado_padron`.
- **activo**: revisado y confirmado por un usuario con permiso `padron.gestionar`. A partir de este momento, y solo a partir de este momento, sus resultados se reflejan en `Persona.estado_padron` (ver sección 7). Solo puede haber un padrón `activo` a la vez (`RN-8`, ver [`04-modelo-datos.md`](./04-modelo-datos.md)).
- **cerrado**: la elección para la que se cargó ya ocurrió. El padrón se conserva íntegro para consulta histórica, pero deja de influir sobre `Persona.estado_padron` (que vuelve a `no_evaluado` hasta que se active un padrón nuevo, salvo decisión explícita de mantener el último estado conocido — a definir junto con el equipo de la organización antes de la implementación de esta transición).

## 4. Carga de un padrón

1. El usuario crea un nuevo `PadronElectoral` (nombre, fecha de elección opcional) y sube el archivo original (PDF, o alternativamente CSV/Excel si la facultad lo publica en ese formato — reutiliza la infraestructura general de [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)).
2. El sistema extrae, vía IA, cada fila del documento como una `PadronEntrada`: DNI, nombre completo tal como figura en el original, y carrera si el documento la incluye. Ver el detalle del proceso de extracción en [`15-ia.md`](./15-ia.md#4-lectura-automática-de-padrones-en-pdf).
3. Se ejecuta automáticamente el proceso de *matching* (sección 5) sobre todas las entradas recién creadas.
4. El padrón queda en estado `borrador`, listo para revisión manual (sección 6).

## 5. Proceso de matching contra Personas

Para cada `PadronEntrada`, el sistema intenta vincularla (`persona_id`) con una `Persona` existente, en este orden de prioridad:

1. **Coincidencia exacta de DNI.** Señal más fuerte posible — si `Persona.dni` coincide exactamente, se vincula automáticamente con `estado_matching = vinculado_automatico` y `confianza_matching = 1.0`.
2. **Coincidencia difusa de nombre y apellido** (cuando no hay DNI cargado en la ficha existente, o el padrón no trae DNI legible), usando el mismo mecanismo de similitud que la detección de duplicados de personas (ver [`15-ia.md`](./15-ia.md#2-detección-inteligente-de-duplicados)). Por debajo de un umbral de confianza configurable, la entrada queda `pendiente` para revisión manual en lugar de vincularse automáticamente.
3. **Sin coincidencia**: la entrada queda `sin_coincidencia`. Desde la revisión manual (sección 6), el usuario puede vincularla a una persona existente encontrada por búsqueda manual, o dar de alta una ficha nueva a partir de los datos de la entrada del padrón.

## 6. Revisión manual del matching

Antes de activar un padrón, la vista de revisión muestra, agrupadas, las entradas que requieren atención humana:

- **Vinculadas automáticamente** (solo para auditoría rápida, no requieren acción).
- **Pendientes de confirmación** (coincidencia probable pero no automática): se muestran lado a lado la entrada del padrón y la ficha candidata, con acción de un clic para confirmar o rechazar.
- **Sin coincidencia**: acción de vincular manualmente (buscador) o crear ficha nueva.

Un padrón no puede pasar a `activo` mientras tenga entradas `pendiente` sin resolver explícitamente (pueden quedar como `sin_coincidencia` resuelto — es decir, se revisaron y se decidió no vincularlas todavía — pero no en el limbo de `pendiente`).

## 7. Efecto sobre el estado de la ficha de Persona

Al activarse un padrón, se recalcula `Persona.estado_padron` (campo derivado, no editable manualmente — ver [`05-modulo-personas.md`](./05-modulo-personas.md#5-edición-de-una-ficha)) para todas las personas del sistema:

| Situación | `estado_padron` resultante |
|---|---|
| La persona tiene una `PadronEntrada` vinculada en el padrón activo | `en_padron_habilitado` |
| La persona no tiene ninguna `PadronEntrada` vinculada en el padrón activo | `no_encontrado_en_padron` |
| No hay ningún padrón activo | `no_evaluado` |

> **Nota de diseño abierta**: el enunciado original distingue "estado dentro del padrón" y "estado de habilitación para votar" como dos conceptos. En el modelo actual se tratan como el mismo campo derivado (`estado_padron`), asumiendo que estar en el padrón oficial equivale a estar habilitado. Si la organización identifica casos reales donde ambos conceptos deban divergir (por ejemplo, alguien en el padrón pero inhabilitado por otro motivo administrativo — `en_padron_no_habilitado`, ya contemplado como valor del enum), ese caso se resuelve manualmente marcando la entrada correspondiente durante la revisión (sección 6), sin requerir un campo adicional.

Cada recálculo masivo de `estado_padron` queda registrado en `HistorialCambio` con autoría de proceso automático (`RN-6`, ver [`04-modelo-datos.md`](./04-modelo-datos.md)), asociado al `ImportJob`/activación que lo originó.

## 8. Vista del padrón

- **Resumen**: total de entradas, vinculadas automáticamente, vinculadas manualmente, sin coincidencia, con un indicador claro de si el padrón puede activarse todavía o no.
- **Comparación entre padrones**: al cargar un padrón nuevo, el sistema puede mostrar la diferencia respecto del padrón anterior (altas y bajas de personas habilitadas) como insumo directo para el dashboard (ver [`11-dashboards.md`](./11-dashboards.md)).

## 9. Reglas de negocio del módulo

- Ver `RN-8` en [`04-modelo-datos.md`](./04-modelo-datos.md) (un único padrón activo a la vez).
- Activar un padrón nuevo cierra automáticamente el anterior en la misma operación transaccional — nunca quedan dos padrones `activo` ni siquiera momentáneamente.
- El archivo original cargado (PDF/CSV/Excel) se conserva en Supabase Storage de forma indefinida mientras exista el `PadronElectoral` correspondiente, para poder auditar o re-procesar si se detectara un error de lectura.
- Ninguna `PadronEntrada` se elimina al re-procesar: si se vuelve a importar un padrón, se crea un `PadronElectoral` nuevo, nunca se sobrescribe uno existente.

## 10. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `padron.ver` | Ver el estado de padrón en las fichas de Persona y en el listado de padrones |
| `padron.importar` | Cargar un nuevo padrón |
| `padron.gestionar` | Revisar matching y activar/cerrar un padrón |
| `padron.exportar` | Exportar el padrón procesado |

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — estructura de datos de `PadronElectoral` y `PadronEntrada`
- [`05-modulo-personas.md`](./05-modulo-personas.md) — el campo derivado `estado_padron`
- [`15-ia.md`](./15-ia.md) — lectura automática de PDFs y algoritmo de matching
- [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md) — infraestructura general de importación reutilizada por este módulo
