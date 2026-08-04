# Módulo: Participaciones (Personas ↔ Actividades)

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Modelo conceptual](#2-modelo-conceptual)
3. [Inscripción](#3-inscripción)
4. [Registro de asistencia](#4-registro-de-asistencia)
5. [Estados de una participación](#5-estados-de-una-participación)
6. [Flujos de inscripción masiva](#6-flujos-de-inscripción-masiva)
7. [Inscripción masiva por importación (CSV/Sheets)](#7-inscripción-masiva-por-importación-csvsheets)
8. [Reglas de negocio del módulo](#8-reglas-de-negocio-del-módulo)
9. [Permisos relevantes](#9-permisos-relevantes)

---

## 1. Objetivo del módulo

Materializar y gestionar la relación entre `Persona` y `Actividad`: una persona puede participar en un número ilimitado de actividades, y una actividad puede tener un número ilimitado de personas inscriptas (o acotado por su cupo — ver [`06-modulo-actividades.md`](./06-modulo-actividades.md)). Esta relación **no es un simple vínculo N a N sin atributos**: cada participación tiene su propio estado, su propia fecha de inscripción y su propia asistencia, por lo que se modela como entidad de primer nivel (`Participacion`), no como una tabla de unión trivial.

La estructura de datos completa está en [`04-modelo-datos.md`](./04-modelo-datos.md#6-núcleo-actividad-y-participación).

## 2. Modelo conceptual

```
   Persona  1 ────────── N  Participacion  N ────────── 1  Actividad
```

Cada fila de `Participacion` responde a la pregunta "¿cómo participó esta persona puntual en esta actividad puntual?" — no solo "si" participó, sino cuándo se inscribió, si confirmó, si asistió o si canceló.

## 3. Inscripción

### 3.1 Vías de inscripción

- **Individual**, desde la ficha de la persona ("agregar a actividad") o desde la actividad ("agregar persona").
- **Masiva**, desde un listado filtrado de personas ("inscribir seleccionadas a..."), ver sección 6.
- **Autoinscripción**: fuera del alcance de la v1 (no existe portal público para que un estudiante se autoinscriba; toda inscripción la carga un usuario del sistema — ver [`01-vision-alcance.md`](./01-vision-alcance.md#6-fuera-de-alcance-v1)).

### 3.2 Validaciones al inscribir

- Verificación de cupo disponible (ver regla de negocio en [`06-modulo-actividades.md`](./06-modulo-actividades.md#8-reglas-de-negocio-del-módulo)).
- Verificación de que no exista ya una `Participacion` activa para ese par persona/actividad (si existe una cancelada, se reactiva en lugar de duplicar — `RN-4` en [`04-modelo-datos.md`](./04-modelo-datos.md)).
- Si la actividad está `finalizada` o `cancelada`, no se permiten inscripciones nuevas (solo ajustes retroactivos de asistencia, con permiso elevado).

### 3.3 Lista de espera

> **Pendiente de implementación (2026-08-04)**: ni el indicador visual de "excedente de cupo" ni la notificación de cupo liberado existen todavía en el código — corrección sobre `REVISION-CRITICA-AUDITORIA-2026-08-04.md` "Hallazgos nuevos" punto 4, que había caracterizado esto como una falta del modelo de datos; en realidad el modelo ya está bien pensado para no necesitar un estado nuevo (ver el párrafo original abajo), lo que falta es la lógica de UI y el disparador de notificación. Al construir Fase 11 (Notificaciones) se omitió deliberadamente este disparador por no tener dónde engancharlo todavía — queda pendiente para cuando se construya el indicador de excedente descripto acá.

Cuando una actividad alcanza su cupo máximo, las inscripciones adicionales quedan con estado `inscripto` pero marcadas internamente como excedentes de cupo (indicador visual en la UI, no un estado nuevo en el modelo de datos, para no complejizar el enum de `Participacion.estado`). Si se libera un cupo (una cancelación), el sistema sugiere automáticamente a la siguiente persona en la lista de espera, vía notificación al responsable de la actividad (ver [`13-notificaciones.md`](./13-notificaciones.md)).

## 4. Registro de asistencia

El caso de uso más frecuente en el día del evento: marcar asistencia rápido, para muchas personas, generalmente desde un celular. Requisitos de UX específicos:

- Vista de "modo asistencia": lista de inscriptos con un único botón grande por persona para alternar entre `confirmado` → `asistio` → `ausente`, sin pasos intermedios ni confirmaciones adicionales.
- Búsqueda rápida dentro de la lista de inscriptos (por nombre, sin necesidad de usar el buscador global) para encontrar a alguien en una fila larga.
- Marcar asistencia completa `fecha_asistencia` automáticamente al momento de marcar el estado, sin pedirla como campo manual.

## 5. Estados de una participación

| Estado | Significado | Transiciones válidas desde este estado |
|---|---|---|
| `inscripto` | Anotado, sin confirmación adicional | → `confirmado`, `asistio`, `ausente`, `cancelado` |
| `confirmado` | Confirmó asistencia previamente (por ejemplo, respondió un recordatorio) | → `asistio`, `ausente`, `cancelado` |
| `asistio` | Asistió efectivamente | → `ausente` (corrección manual excepcional) |
| `ausente` | No asistió | → `asistio` (corrección manual excepcional) |
| `cancelado` | Canceló su inscripción o fue dado de baja | → `inscripto` (re-inscripción, reutiliza el mismo registro por `RN-4`) |

## 6. Flujos de inscripción masiva

Desde un listado de Personas filtrado (por ejemplo, "todas las de 2do año de Enfermería"), acción "Inscribir a actividad", selecciona la actividad destino y crea una `Participacion` por cada persona seleccionada que todavía no la tuviera, respetando la validación de cupo del conjunto completo antes de confirmar (si el cupo no alcanza para todos los seleccionados, se informa cuántos entrarían y se pide confirmación explícita en vez de fallar silenciosamente a mitad de camino).

## 7. Inscripción masiva por importación (CSV/Sheets)

> Decisión registrada con Gaspar (2026-08-01), no estaba resuelta en la v1 original de este documento. Complementa — no reemplaza — la sección 6: el flujo de la sección 6 parte de un listado de Personas ya cargadas en el sistema; esta sección cubre el caso real más frecuente en la operatoria de ATP, donde la inscripción a una actividad puntual se junta primero en un formulario/planilla externa (Google Sheets vinculado a la web de ATP, o un CSV puntual exportado de ahí) y **no** en el CRM directamente. El botón "Inscribir" individual (sección 3.1) sigue existiendo, pero queda como vía accesoria, no la principal, para este caso de uso.

**Origen del dato real**: a diferencia del alta de Personas (que sí suele incluir DNI), el formulario de inscripción a una actividad típicamente solo junta **nombre, apellido y teléfono** (siempre presentes) y, a partir de ahora, **email**. El DNI y la carrera/año **no** suelen venir en el formulario, salvo en actividades puntuales que sí lo piden.

**Mecanismo de matcheo contra Personas ya cargadas** (sin DNI en la mayoría de los casos, ver [`15-ia.md`](./15-ia.md#2-detección-inteligente-de-duplicados) para el detalle de señales y umbral de confianza):

1. DNI idéntico, si vino en el archivo — determinístico, certeza total.
2. Teléfono idéntico — señal fuerte elegida como segunda prioridad para este flujo específico (dato casi siempre presente y razonablemente único por persona).
3. Si no hay coincidencia exacta de teléfono (o es ambigua entre más de una Persona), se compara nombre + apellido de forma asistida por IA contra un conjunto acotado de candidatos con apellido similar, cubriendo errores de tipeo y variantes de escritura.
4. Si ninguna señal produce una coincidencia razonable, la fila **no crea una Persona nueva automáticamente**: queda registrada como pendiente de revisión manual (mismo mecanismo que `ImportJobError`), para que un usuario decida si es un alta nueva o un dato mal escrito de alguien ya cargado. Esta es una decisión deliberada de mitigar el riesgo de duplicados dado que, sin DNI, una creación automática tiene más chance real de generar una ficha repetida (contradice `RN-1`).

**Carrera y año inferidos por actividad**: cuando una actividad es de una carrera/año conocidos de antemano (ej. "Repaso CyD" ⇒ Medicina, 1er año), el usuario que importa puede indicar opcionalmente una carrera y año "por defecto" para esa tanda de inscriptos. Se aplica **solo** a Personas nuevas o que todavía no tuvieran ese campo cargado — nunca sobreescribe un dato ya existente.

**Re-importación de la misma actividad**: si se vuelve a subir un archivo actualizado de la misma actividad (por ejemplo, se sumó gente después de la primera carga), la importación **solo agrega inscripciones nuevas**. Nunca cancela automáticamente a alguien que estaba inscripto y ya no figura en el archivo nuevo — esa baja, si corresponde, queda a criterio manual.

**Alcance actual**: implementado primero para CSV (reutiliza el mecanismo de `ImportJob`/`ImportJobError` de [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md)). La integración directa con Google Sheets (sección 4 de ese documento) queda pendiente para una iteración posterior — hoy el flujo real es exportar la planilla a CSV y subirla.

## 8. Reglas de negocio del módulo

- Ver `RN-4` en [`04-modelo-datos.md`](./04-modelo-datos.md#18-reglas-de-negocio-transversales) (unicidad del par persona/actividad).
- Cambiar el estado de una `Participacion` genera entrada en `HistorialCambio`, igual que cualquier otro cambio relevante del sistema.
- La eliminación de una `Participacion` **no existe** como operación disponible desde la UI estándar: el equivalente es pasarla a `cancelado`, preservando el registro.

## 9. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `participaciones.gestionar` | Inscribir, cancelar, marcar asistencia |
| `participaciones.gestionar_masivo` | Inscripción/cancelación masiva desde listados |
| `importaciones.ejecutar` | Importar inscriptos por CSV a una actividad (sección 7) — mismo permiso genérico de [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md#10-permisos-relevantes), no se creó un permiso nuevo |

---

### Documentos relacionados

- [`05-modulo-personas.md`](./05-modulo-personas.md) — la entidad Persona
- [`06-modulo-actividades.md`](./06-modulo-actividades.md) — la entidad Actividad y sus sub-actividades
- [`11-dashboards.md`](./11-dashboards.md) — métricas de participación y asistencia
