# Módulo: Participaciones (Personas ↔ Actividades)

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Modelo conceptual](#2-modelo-conceptual)
3. [Inscripción](#3-inscripción)
4. [Registro de asistencia](#4-registro-de-asistencia)
5. [Estados de una participación](#5-estados-de-una-participación)
6. [Flujos de inscripción masiva](#6-flujos-de-inscripción-masiva)
7. [Reglas de negocio del módulo](#7-reglas-de-negocio-del-módulo)
8. [Permisos relevantes](#8-permisos-relevantes)

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

## 7. Reglas de negocio del módulo

- Ver `RN-4` en [`04-modelo-datos.md`](./04-modelo-datos.md#18-reglas-de-negocio-transversales) (unicidad del par persona/actividad).
- Cambiar el estado de una `Participacion` genera entrada en `HistorialCambio`, igual que cualquier otro cambio relevante del sistema.
- La eliminación de una `Participacion` **no existe** como operación disponible desde la UI estándar: el equivalente es pasarla a `cancelado`, preservando el registro.

## 8. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `participaciones.gestionar` | Inscribir, cancelar, marcar asistencia |
| `participaciones.gestionar_masivo` | Inscripción/cancelación masiva desde listados |

---

### Documentos relacionados

- [`05-modulo-personas.md`](./05-modulo-personas.md) — la entidad Persona
- [`06-modulo-actividades.md`](./06-modulo-actividades.md) — la entidad Actividad y sus sub-actividades
- [`11-dashboards.md`](./11-dashboards.md) — métricas de participación y asistencia
