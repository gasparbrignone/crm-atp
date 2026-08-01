# Módulo: Importaciones y Exportaciones

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Fuentes de importación soportadas](#2-fuentes-de-importación-soportadas)
3. [Flujo general de una importación](#3-flujo-general-de-una-importación)
4. [Importación desde Google Sheets](#4-importación-desde-google-sheets)
5. [Importación desde CSV / Excel](#5-importación-desde-csv--excel)
6. [Importación desde PDF](#6-importación-desde-pdf)
7. [Manejo de errores y filas parcialmente inválidas](#7-manejo-de-errores-y-filas-parcialmente-inválidas)
8. [Exportaciones](#8-exportaciones)
9. [Reglas de negocio del módulo](#9-reglas-de-negocio-del-módulo)
10. [Permisos relevantes](#10-permisos-relevantes)

---

## 1. Objetivo del módulo

Bajar a cero (o lo más cerca posible) el trabajo de carga manual de datos que ya existen en otro lado — sobre todo las planillas de cálculo que hoy dispersan la información de la organización, y los padrones oficiales publicados por la facultad. Este módulo es la puerta de entrada de datos masivos; su contraparte de salida (exportaciones) cierra el ciclo para cuando la información necesita salir del sistema hacia otro formato.

## 2. Fuentes de importación soportadas

| Fuente | Entidades destino soportadas | Complejidad |
|---|---|---|
| Google Sheets | Persona, Actividad | Media (requiere autorización OAuth a la cuenta de Google del usuario) |
| CSV | Persona, Actividad, PadronElectoral | Baja |
| Excel (.xlsx) | Persona, Actividad, PadronElectoral | Baja/Media (múltiples hojas, formato de celdas) |
| PDF | PadronElectoral (caso principal), Persona (extracción de listados no estructurados) | Alta — requiere IA, ver sección 6 |

## 3. Flujo general de una importación

Todas las fuentes comparten el mismo flujo de alto nivel, materializado en la entidad `ImportJob` (ver [`04-modelo-datos.md`](./04-modelo-datos.md#13-importaciones-y-exportaciones)):

```
1. Selección de fuente y archivo/enlace
2. Mapeo de columnas → campos del sistema
3. Vista previa (muestra de filas ya mapeadas, antes de confirmar)
4. Procesamiento (con detección de duplicados y normalización vía IA)
5. Revisión de resultados: exitosas / con error / duplicados sugeridos
6. Confirmación final
```

Ninguna importación se aplica "en caliente" fila por fila sin posibilidad de revisión: el paso 5 es obligatorio antes de que los datos se consideren definitivamente incorporados a las entidades destino (excepto en el caso de re-intentos de filas ya corregidas, ver sección 7).

## 4. Importación desde Google Sheets

- El usuario pega el enlace de una hoja de cálculo compartida (o la selecciona vía un selector de archivos de Google, si se implementa la integración OAuth completa).
- El sistema lee la hoja indicada (primera hoja por defecto, con opción de elegir otra si el archivo tiene múltiples pestañas) y expone sus columnas para el mapeo del paso 2.
- Ventaja específica de esta fuente sobre CSV/Excel estático: si el equipo mantiene una planilla "viva" de trabajo (por ejemplo, una lista de inscriptos a una actividad que se sigue completando en Sheets), la importación puede re-ejecutarse sobre el mismo enlace para traer solo las filas nuevas o modificadas desde la última importación (sincronización incremental) — funcionalidad de fase avanzada, ver [`20-roadmap.md`](./20-roadmap.md).

## 5. Importación desde CSV / Excel

- Detección automática de codificación y separador (para CSV) y de la primera fila como encabezado.
- El mapeo de columnas (paso 2 del flujo general) sugiere automáticamente la correspondencia entre columnas del archivo y campos del sistema cuando los nombres son similares (ej. una columna "Nombre" se sugiere automáticamente hacia `Persona.nombre`), usando IA para el matching semántico de encabezados no obvios (ver [`15-ia.md`](./15-ia.md#3-normalización-de-datos)) — el usuario siempre puede corregir la sugerencia antes de continuar.
- Soporta múltiples hojas en un archivo Excel, cada una importable como un `ImportJob` independiente.

## 6. Importación desde PDF

Es el caso más avanzado del sistema y el que más valor de automatización aporta, dado que los padrones electorales oficiales suelen publicarse exclusivamente en este formato. El detalle técnico completo del mecanismo de lectura está en [`15-ia.md`](./15-ia.md#4-lectura-automática-de-padrones-en-pdf); funcionalmente:

1. El usuario sube el PDF del padrón.
2. El sistema extrae, página por página, cada fila de datos de persona (típicamente DNI y nombre completo, a veces carrera), incluso si el PDF es una imagen escaneada (no solo texto seleccionable).
3. Cada fila extraída se convierte en una `PadronEntrada` con un puntaje de confianza de extracción; filas de baja confianza (texto borroso, formato irregular) se marcan explícitamente para revisión manual en lugar de adivinar silenciosamente.
4. A partir de ahí, sigue el flujo específico de [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) (matching contra Personas, activación).

La importación de Persona desde un PDF no estructurado (por ejemplo, una lista de asistencia en papel escaneada) sigue el mismo mecanismo de extracción, con menor garantía de estructura fija — se trata siempre como "de mayor esfuerzo de revisión manual esperado" que un CSV/Excel bien formado.

## 7. Manejo de errores y filas parcialmente inválidas

Principio central, ya establecido en [`03-arquitectura.md`](./03-arquitectura.md#13-observabilidad-y-manejo-de-errores): **una importación con errores parciales nunca se reporta como un fallo genérico.** Cada fila con problema se registra como `ImportJobError`, con el contenido original de la fila y el motivo específico del error (ej. "email con formato inválido", "carrera no reconocida"), de forma que el usuario pueda:

- Corregir el archivo original en esas filas puntuales y volver a intentar solo esas filas (no todo el archivo de nuevo).
- O decidir omitirlas conscientemente y continuar con el resto.

Las filas exitosas de una importación con errores parciales **sí se aplican** (el `ImportJob` queda `completado_con_errores`, no se descarta todo el lote por errores aislados).

## 8. Exportaciones

| Origen | Formatos | Notas |
|---|---|---|
| Personas (listado completo o filtrado/seleccionado) | CSV, Excel | Respeta los filtros activos en el listado al momento de exportar |
| Actividades y sus participaciones | CSV, Excel | Incluye estado de participación por persona |
| Padrón electoral procesado | CSV, Excel, PDF | Útil para compartir el estado de matching con otros referentes de la organización |
| Punteo propio | CSV, Excel | Solo el punteo del propio usuario, salvo permiso `punteo.exportar_todos` |

Cada exportación queda registrada en `ExportJob` (ver [`04-modelo-datos.md`](./04-modelo-datos.md#133-exportjob)), incluyendo los filtros aplicados, precisamente para tener trazabilidad de qué información salió del sistema, cuándo y por quién — relevante en particular para exportaciones que incluyan datos sensibles (ver [`16-seguridad.md`](./16-seguridad.md)).

## 9. Reglas de negocio del módulo

- Toda importación que cree o modifique una `Persona` pasa por la misma verificación de duplicados que el alta manual (ver [`05-modulo-personas.md`](./05-modulo-personas.md#32-verificación-de-duplicados-en-el-momento-del-alta)) — no existe un "modo rápido" de importación que la omita.
- El archivo original de cualquier importación se conserva en Supabase Storage, asociado al `ImportJob`, para poder auditar o reprocesar.
- Una exportación que incluya el campo `estado_padron` o cualquier dato vinculado a punteo requiere, además del permiso de exportación del módulo correspondiente, que el usuario ya tuviera permiso de lectura sobre esos datos en primer lugar (una exportación nunca es una vía para acceder a datos que el usuario no podría ver navegando el sistema normalmente).

## 10. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `importaciones.ejecutar` | Ejecutar cualquier tipo de importación |
| `exportaciones.ejecutar` | Ejecutar exportaciones sobre las entidades a las que el usuario ya tiene acceso de lectura |
| `padron.importar` | Requerido específicamente además de `importaciones.ejecutar` para importar un padrón (ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md)) |

---

### Documentos relacionados

- [`15-ia.md`](./15-ia.md) — mecanismos de IA usados durante la importación (normalización, duplicados, lectura de PDF)
- [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) — flujo específico posterior a la importación de un padrón
- [`17-auditoria-historial.md`](./17-auditoria-historial.md) — trazabilidad de cambios originados por importaciones
