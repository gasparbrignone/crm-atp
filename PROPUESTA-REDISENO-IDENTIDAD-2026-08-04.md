# Propuesta de rediseño: de "detección de duplicados" a "identidad canónica"

**Fecha**: 2026-08-04. **Naturaleza de este documento**: análisis arquitectónico puro. Se apoya en los hechos verificados en [`INFORME-MOTOR-MATCHING-Y-PADRONES-2026-08-04.md`](INFORME-MOTOR-MATCHING-Y-PADRONES-2026-08-04.md) más una segunda ronda de lectura del modelo de datos (`prisma/schema.prisma`) y de la infraestructura de búsqueda (`pg_trgm`) ya instalada.

> **Actualización 2026-08-04, misma sesión — plan aprobado por Gaspar, avance en curso**: Etapas 0, 1, 2 y 5 (sección 9) ya están implementadas, con tests de regresión (`tests/unit/`) y sin romper build/lint. Detalle de qué se hizo exactamente y qué falta en `INFORME-CIERRE-SESION-2026-08-04.md`. **Etapa 3 (enriquecimiento progresivo) sigue sin implementarse a propósito** — Gaspar pidió explícitamente el diseño detallado de la política de survivorship antes de tocar código ahí; ver `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`, pendiente de su revisión.

**Pregunta de fondo que guía todo el documento**: ¿el sistema hoy construye una identidad canónica de cada persona, o solo compara registros y los vincula? Respuesta corta, desarrollada abajo: **hoy compara y vincula, pero no enriquece**. Ese es el hallazgo central de este informe, y es distinto de todo lo que señalé en el informe anterior (que hablaba de *matching*, no de *identidad*).

---

## Índice

1. [Diagnóstico del sistema actual](#1-diagnóstico-del-sistema-actual)
2. [Problemas encontrados](#2-problemas-encontrados)
3. [Arquitectura propuesta](#3-arquitectura-propuesta)
4. [Comparación arquitectura actual vs propuesta](#4-comparación-arquitectura-actual-vs-propuesta)
5. [Riesgos de migración](#5-riesgos-de-migración)
6. [Impacto en rendimiento](#6-impacto-en-rendimiento)
7. [Impacto en mantenibilidad](#7-impacto-en-mantenibilidad)
8. [Impacto en experiencia de usuario](#8-impacto-en-experiencia-de-usuario)
9. [Plan de implementación por etapas](#9-plan-de-implementación-por-etapas)
10. [Recomendación final](#10-recomendación-final)

---

## 1. Diagnóstico del sistema actual

### 1.1 ¿Qué es hoy una `Persona` en este sistema?

Es una fila de tabla que **representa un registro**, no una identidad activamente mantenida. La única operación que trata explícitamente la noción de "esto y aquello son la misma identidad" es la **fusión** (`fusionarPersonas`): cuando dos fichas se confirman como la misma persona, una pasa a `estadoFicha = fusionada` con `fusionadaEnId` apuntando a la definitiva. Verifiqué que esto **nunca encadena** — `fusionarPersonas` rechaza explícitamente si cualquiera de las dos fichas ya está `fusionada` (`PersonaYaFusionadaError`), así que el puntero siempre es de un solo salto, nunca hay que "seguir la cadena" para encontrar la ficha real. Esto, en el lenguaje de la pregunta que planteaste, **ya es un Identity Graph mínimo y correcto**: un grafo de dos niveles (ficha activa → fichas fusionadas que apuntan a ella), sin ciclos, sin cadenas. No es un grafo probabilístico con múltiples aristas de confianza — es un puntero de "esto se convirtió en esto otro", que es exactamente lo que hace falta acá (ver sección 3.1 para por qué no conviene ir más allá de esto).

Lo que **no existe** es la otra mitad de "identidad canónica": cuando el sistema *vincula* una entrada nueva (una fila de padrón, una inscripción a actividad, una fila de CSV) contra una `Persona` ya existente, **hoy solo crea la relación** (`Participacion`, `PadronEntrada.personaId`) — **nunca toca los campos de la `Persona`** con la información nueva que trajo esa fuente. Verificado leyendo `inscribirPersona()`/`importarParticipacionesCsv()` y `vincularEntradaManualmente()`: ninguna de las dos, al confirmar un match, actualiza `nombre`, `apellido`, teléfono o cualquier otro campo de la Persona con datos más completos que pudiera traer la fuente nueva.

**Esto es la brecha central respecto del objetivo que planteaste.** El ejemplo que diste en tu pedido (Actividad A → Actividad B → Padrón → Formulario, cada uno agregando un dato nuevo) **no funciona hoy como vos lo describís**: cada fuente nueva se vincula a la Persona existente, pero la ficha de esa Persona se queda exactamente con los datos que tenía desde el alta original. Si "Juan Perez" se dio de alta sin teléfono y después aparece en una Actividad con teléfono, ese teléfono **si** se guarda (porque `inscribirPersona` sí crea el `PersonaTelefono` — confirmar en sección 3.3) — pero un dato más rico como "apellido materno" o "nombre completo corregido" que traiga una fuente posterior, **no se aplica nunca** a la ficha ya existente.

### 1.2 ¿El sistema realmente compara, o realmente resuelve identidad?

Con el vocabulario de la disciplina de *entity resolution*: el sistema hoy implementa correctamente la etapa de **"vinculación" (record linkage)** — decidir si el registro B corresponde a la misma entidad que el registro A — pero no implementa la etapa de **"fusión de atributos" (attribute fusion / survivorship)**, que es la que construye progresivamente la versión "mejor conocida" de cada entidad a partir de todas las fuentes que la mencionan. Sin esa segunda etapa, decir "identidad canónica" es prematuro: lo que hay es "deduplicación con revisión humana", que es un prerrequisito necesario pero no suficiente para lo que pediste.

### 1.3 Los tres pipelines de importación no usan el mismo motor

Esto ya está documentado en detalle en el informe anterior (sección 7), lo resumo acá porque es central para el punto 2 de tu pedido:

| Camino | Usa el Motor de Identidad completo |
|---|---|
| Alta manual | ✅ |
| Importación CSV genérica de Personas | ❌ — solo DNI exacto |
| Importación de inscriptos a Actividad | ✅ |
| Importación/lectura de Padrón | ✅ |

Tu pedido asume — correctamente, como objetivo — que "todos deberían terminar utilizando exactamente el mismo motor". Hoy **no sucede**. Es el problema más concreto y accionable de este documento (ver sección 3.4).

### 1.4 El motor de scoring en sí (comparación) está bien diseñado — no es donde está el problema

Quiero ser explícito acá porque el pedido me pide cuestionar todo: revisé de nuevo `lib/identidad/` completo con espíritu crítico, buscando específicamente si el algoritmo de comparación necesita rediseño. **Conclusión: no.** Las 4 señales ponderadas, las 2 compuertas de seguridad, la separación en capas (normalizar → algoritmos → scoring → resolución) y el hecho de que nunca decide solo — todo eso está bien pensado, benchmarkeado, y con tests de regresión sobre bugs reales. Rediseñar *eso* sería resolver un problema que no existe. El problema real está un nivel más arriba: en cómo se **usa** ese motor (de forma inconsistente) y en qué se **hace con el resultado** (nada, aparte de vincular).

### 1.5 Blocking: infraestructura ya paga, pero no usada donde importa

Encontré algo que no estaba en el informe anterior: el proyecto ya tiene, desde el 2026-08-02 (Fase 10, para el buscador global), **índices GIN de `pg_trgm`** sobre `Persona.apellido` y `Persona.nombre` (migración `20260802190000_buscador_trgm_unaccent`). Es exactamente la tecnología que la sección 7 de tu pedido menciona como alternativa a evaluar — **ya está instalada y corriendo en producción**, pero el módulo de identidad no la usa: el *blocking* de candidatos (`obtenerCandidatosPorApellido` en `deteccion-duplicados.ts`, `obtenerCandidatosPorNombre` en `matching-padron.ts`) sigue haciendo `startsWith` sobre los primeros 3-4 caracteres del apellido, ignorando el índice de similitud que ya está pago y funcionando para otra feature. Es la mejora de menor costo y mayor impacto de todo este documento (desarrollada en 3.5).

### 1.6 No hay evidencia de origen por dato

Confirmé en el schema: `PersonaTelefono` y `PersonaEmail` no tienen ningún campo de origen (`de dónde vino este número`) ni siquiera de fecha de creación. `Persona.instagram` y `Persona.observacionesGenerales` son campos escalares únicos, sin historial estructurado más allá de lo que `HistorialCambio` registra genéricamente como texto libre por cada edición. Hoy, para responder "¿de dónde salió este teléfono?", hay que ir a leer manualmente el log de `HistorialCambio` de esa Persona — no hay una vista ni un campo directo.

### 1.7 No hay métricas de calidad de matching en producción

Existen ya (Fase 12) tarjetas de "salud de datos" en el dashboard admin: personas sin contacto, entradas de padrón pendientes, importaciones sin terminar. Es una base real y buena para construir sobre ella (ver sección 3.8) — pero no hay ninguna métrica específica de calidad del *matching* en sí: cuántos auto-vinculados, cuántos van a revisión, cuántas veces un humano revierte una auto-vinculación (que sería la señal más directa de falso positivo real), tasa de éxito de Gemini, etc.

---

## 2. Problemas encontrados

Ordenados por severidad real, no por orden de aparición en tu pedido:

| # | Problema | Severidad | Evidencia |
|---|---|---|---|
| **P1** | El objetivo de "identidad canónica" no se cumple: un match nunca enriquece la Persona existente, solo crea la relación | **Alta** — es la brecha central respecto de lo que pediste | `inscribirPersona()`, `vincularEntradaManualmente()` no tocan campos de `Persona` |
| **P2** | Importación CSV genérica de Personas no usa el motor de identidad, solo DNI — inconsistente con los otros 2 caminos y con la documentación funcional | **Alta** — duplicados reales posibles hoy mismo | `importaciones.service.ts`, ya señalado en el informe anterior |
| **P3** | Blocking por prefijo de 3-4 caracteres, sin usar el índice `pg_trgm` ya instalado para el buscador global | **Media** — no es un bug, es una oportunidad barata sin explotar | `deteccion-duplicados.ts`, `matching-padron.ts` vs migración `20260802190000_buscador_trgm_unaccent` |
| **P4** | Política de decisión (umbrales de 3 vías) duplicada y ligeramente inconsistente entre los 2 módulos que llaman al motor: `matching-padron.ts` tiene un piso explícito de 0.4 por debajo del cual descarta directo; `deteccion-duplicados.ts` no tiene ese piso — una coincidencia de confianza muy baja igual se muestra como "sugerencia ambigua" al usuario | **Media** — inconsistencia de comportamiento entre módulos que deberían compartir política | `matching-padron.ts` (`CONFIANZA_MINIMA_PARA_REVISION`) vs `deteccion-duplicados.ts` (sin equivalente) |
| **P5** | No hay campo de origen/fecha en `PersonaTelefono`/`PersonaEmail`, ni evidencia estructurada para `instagram`/`observacionesGenerales` | **Media** — bloquea directamente el punto 4 de tu pedido | Schema, sección 1.6 |
| **P6** | No hay métricas de calidad de matching ni panel dedicado a eso (aparte de "salud de datos" genérica) | **Media** | Sección 1.7 |
| **P7** | Benchmark sintético, sin validar contra decisiones humanas reales | **Media**, ya señalada en el informe anterior | `BENCHMARK-RESULTADOS.md` |
| **P8** | Documentación funcional desactualizada en 2 puntos concretos respecto del código real | **Baja-Media**, ya señalada en el informe anterior | `14-*.md`, `15-ia.md` |
| **P9** | Tres funciones de normalización de teléfono con nombre casi idéntico en archivos distintos, sin distinción visible en el nombre | **Baja** — riesgo de mantenibilidad, no de corrección | `normalizacion.ts`, `deteccion-duplicados.ts` |

---

## 3. Arquitectura propuesta

### 3.1 Punto 1 de tu pedido — modelo de identidad: NO construir un Identity Graph completo

**Recomendación: no.** Justificación de costo/beneficio:

Un Identity Graph "de verdad" (entidades separadas para "Identidad" vs "Observación candidata", múltiples aristas de confianza entre observaciones, resolución de componentes conexas, posibilidad de que una identidad se "divida" retroactivamente si se descubre que dos personas distintas quedaron mal fusionadas) es la arquitectura correcta cuando: hay decenas de fuentes con señales contradictorias frecuentes, el volumen es grande (cientos de miles+), y la resolución de identidad tiene que poder revertirse de forma parcial y auditable con frecuencia. Ninguna de esas tres condiciones aplica hoy a ATP (volumen "miles" documentado como supuesto S4, ~4 fuentes de entrada conocidas, y — punto clave — **el sistema ya exige revisión humana en todo caso ambiguo**, así que la "corrección retroactiva" en la práctica ya pasa por una persona mirando la ficha, no por una reconciliación automática de grafo).

Construir esa arquitectura ahora sería sobreingeniería activa: más tablas, más código, más superficie de bugs, para resolver un problema (identidades que se dividen y recombinan dinámicamente con múltiples fuentes en conflicto) que este proyecto no tiene en la práctica.

**Lo que sí recomiendo** es completar el modelo que ya existe, que es direccionalmente correcto pero está incompleto en dos sentidos concretos:

1. El puntero de fusión (`fusionadaEnId`) ya resuelve bien "esto se convirtió en aquello" — mantenerlo tal cual.
2. Falta la etapa de **fusión de atributos** (survivorship) que describo en 3.2 — eso es lo que realmente te da "identidad canónica acumulativa", no un grafo más complejo.

### 3.2 Punto 3 de tu pedido — enriquecimiento progresivo: la pieza que falta

Propongo una función nueva y explícita, `enriquecerPersona(personaId, datosNuevos, origen, usuarioId)`, en `lib/servicios/personas.service.ts`, que se llama **siempre** que se confirma un match (automático o manual) contra una Persona existente, desde cualquiera de los pipelines. Regla de fusión de atributos (survivorship), simple y conservadora a propósito:

- **Un campo vacío en la Persona existente se completa con el dato nuevo, sin pedir confirmación.** No hay riesgo real: no se pisa nada, solo se llena un hueco. Esto ya es coherente con el principio de "la IA/heurística nunca decide sola" porque acá no hay ninguna decisión de negocio en juego — es estrictamente aditivo.
- **Un campo con valor existente nunca se pisa automáticamente.** Si el dato nuevo difiere del existente (ej. la Persona tiene apellido "Perez" y la fuente nueva trae "Perez Garcia"), se registra como una **sugerencia pendiente** (mismo patrón visual que ya existe hoy para sugerencias de duplicado en el alta manual) en vez de aplicarse sola.
- **Teléfono y email**: como ya son multivaluados (`PersonaTelefono`/`PersonaEmail`), un dato nuevo simplemente se agrega a la lista (no destructivo por diseño, ya lo permite el modelo actual) — no hace falta ninguna decisión de "pisar o no", solo agregar si no existe ya.
- Cada enriquecimiento aplicado queda registrado en `HistorialCambio` con `metadata` indicando el origen (mismo mecanismo que ya usa RN-6 para eventos automáticos) — no hace falta un modelo nuevo para esto, ya existe.

Este es el cambio de mayor impacto conceptual de todo el documento: es lo que convierte "detectar duplicados y vincular" en "construir progresivamente la mejor versión conocida de cada persona", que es literalmente el objetivo que planteaste.

### 3.3 Punto 4 de tu pedido — evidencia por dato: extender lo que ya existe, no crear un modelo nuevo

Evalué dos caminos:

**Camino A (descartado)**: una tabla nueva `EvidenciaDato` genérica (entidad, campo, valor, origen, fecha, para cualquier campo de cualquier entidad). Es la solución "más completa" en abstracto, pero es sobreingeniería para el caso real: hoy los únicos campos donde "de dónde salió esto" importa de verdad en la práctica son teléfono, email, y quizás carrera — no observaciones generales ni instagram, que rara vez tienen conflicto de fuente real.

**Camino B (recomendado)**: agregar 2 columnas nullable a `PersonaTelefono` y `PersonaEmail` (que son las que ya son multivaluadas, y donde "de qué fuente vino cada uno" tiene valor práctico real):

```
origen        String?   // "alta_manual" | "importacion_csv" | "importacion_actividad" | "padron" | "editado_manual"
fechaCreacion DateTime  @default(now())   // hoy PersonaTelefono NO tiene este campo — falta para saber "el último usado"
```

Para `instagram` y `observacionesGenerales` (campos escalares, no multivaluados): **no crear evidencia estructurada nueva** — ya existe `Persona.modificadoPorId` + `Persona.fechaModificacion` a nivel de toda la ficha, y `HistorialCambio` ya guarda, campo por campo, quién cambió qué y cuándo (aunque no en un formato tan directamente consultable como una columna). Es información suficiente para el caso de uso real ("¿quién tocó esto por última vez?"), sin necesitar un modelo nuevo. Si en el futuro aparece evidencia real de que hace falta más (ej. conflictos frecuentes de instagram entre fuentes), se revisita — no antes.

Este camino B es aditivo (columnas nuevas nullable), migración de bajo riesgo, y responde directamente al ejemplo que diste (teléfono con múltiples orígenes visibles).

### 3.4 Punto 2 de tu pedido — unificación de todos los caminos de importación

Propongo consolidar los 3 caminos en una sola función de servicio, `resolverOCrearPersona(datosEntrada, contexto, usuarioId)`, que envuelve en un solo lugar: `buscarPersonaCoincidente()` → clasificación de confianza (3.6) → si hay match, `enriquecerPersona()` (3.2) → si no hay match, `crearPersona()`. Los 3 pipelines (`importaciones.service.ts`, `participaciones.service.ts`, y el alta manual en `personas/actions.ts`) pasan a llamar a esta única función en vez de tener cada uno su propia orquestación — hoy `participaciones.service.ts` ya casi hace esto bien (usa el motor completo), así que en la práctica es principalmente **corregir `importaciones.service.ts`** para que deje de comparar solo por DNI, más un refactor liviano para que las 3 rutas converjan en el mismo punto de entrada. Esto cierra P2 de forma definitiva y estructural (no solo "arreglar el bug puntual", sino hacer estructuralmente imposible que un cuarto pipeline futuro se olvide de usar el motor completo).

### 3.5 Punto 7 de tu pedido — blocking: usar lo que ya está instalado

Reemplazar el `startsWith` de 3-4 caracteres por una consulta que aproveche el índice `pg_trgm` ya existente:

```sql
SELECT * FROM "Persona"
WHERE similarity(apellido, $1) > 0.3
ORDER BY similarity(apellido, $1) DESC
LIMIT 20
```

Con dos refuerzos adicionales, combinados (no exclusivos entre sí):

1. **Huella digital (`huellaDigital()`, ya existe en `normalizar.ts`) como filtro de dedupe exacto barato primero**: si dos nombres tienen exactamente las mismas palabras (en cualquier orden), es candidato directo de altísima prioridad, sin ni siquiera necesitar el motor de scoring completo — un `WHERE` sobre una columna indexada de huella (requeriría persistir la huella como columna generada o mantenida, evaluar costo/beneficio en la etapa correspondiente del plan).
2. **`similarity()` sobre trigram como red de contención general**, reemplazando el prefijo actual — mejor recall (agarra errores de tipeo en las primeras letras, que el prefijo actual pierde por diseño, ver limitación 8 del informe anterior), mismo orden de costo computacional porque el índice GIN ya existe y ya se paga su mantenimiento en cada escritura (está usado por el buscador global).

**No recomiendo** ir más allá de esto (ej. múltiples índices combinados con blocking compuesto apellido+carrera+año) hasta que el volumen real lo justifique — ver sección 3.9 sobre escalabilidad.

### 3.6 Punto 6 de tu pedido — separar resolución de identidad en etapas explícitas

Hoy la separación **ya existe en el código a nivel de módulo** (normalizar → algoritmos → scoring → resolución, los 4 archivos de `lib/identidad/`), pero **la política de decisión** (qué umbral separa auto-vinculación de revisión manual de descarte) está duplicada de forma ligeramente inconsistente en los 2 módulos llamadores (P4 de la sección 2). Propongo una quinta pieza explícita:

```
lib/identidad/
  normalizar.ts        (ya existe — sin cambios)
  algoritmos.ts         (ya existe — sin cambios)
  motor-scoring.ts       (ya existe — sin cambios)
  resolucion.ts           (ya existe — sin cambios, sigue sin decidir nada, solo ordena candidatos)
  politica-decision.ts     (NUEVO — la única función que traduce una confianza numérica en una de las 3 vías)
```

```ts
export function clasificarConfianza(confianza: number, umbral: number): "auto" | "revision" | "descarte" {
  const PISO_REVISION = 0.4; // hoy solo vive en matching-padron.ts
  if (confianza < PISO_REVISION) return "descarte";
  if (confianza < umbral) return "revision";
  return "auto";
}
```

Los 2 (o, tras 3.4, potencialmente 1) módulos llamadores usan esta función en vez de repetir el `if` — resuelve P4 de raíz, no solo lo alinea puntualmente. Esta capa nueva es la que separa limpiamente **comparación** (motor-scoring, no cambia) de **decisión** (política, nueva) — que es exactamente la separación de responsabilidades que tu punto 6 pide, y hoy está mezclada dentro de cada caller.

**Enriquecimiento**, en este esquema, pasa a ser una etapa más, después de la decisión (3.2) — así quedan las 5 etapas completas que pedís: normalización → generación de candidatos (blocking, 3.5) → comparación (scoring, sin cambios) → decisión (política, nueva) → enriquecimiento (nuevo, 3.2).

### 3.7 Punto 5 de tu pedido — datos múltiples

| Dato | ¿Multivaluado hoy? | Recomendación |
|---|---|---|
| Teléfono | ✅ Ya (`PersonaTelefono`, con `esPrincipal`) | Mantener; agregar `origen`/`fechaCreacion` (3.3) para saber "último usado" ordenando por fecha |
| Email | ✅ Ya (`PersonaEmail`, con `esPrincipal`) | Igual que teléfono |
| Instagram | ❌ Campo único en `Persona` | **No multivaluar** — en la práctica una persona tiene un solo Instagram vigente; el costo de una tabla nueva no se justifica hoy. Si aparece evidencia real de conflicto entre fuentes, revisitar. |
| Observaciones | ❌ Campo único, texto libre | **No multivaluar como "dato de contacto"** — ya es conceptualmente distinto (es una nota abierta, no un dato estructurado con "principal/histórico"). Si hace falta acumular observaciones de múltiples fuentes sin pisarse, la solución correcta no es "múltiples observaciones con principal", es simplemente **agregar** texto nuevo en vez de reemplazar (cambio de comportamiento menor, evaluable aparte, bajo impacto). |

**Definición de "principal", "histórico" y "último usado"** para teléfono/email, formalizando lo que ya implica el modelo actual + la mejora de 3.3:

- **Principal**: `esPrincipal = true` (ya existe, RN-3 ya garantiza que hay como máximo uno por Persona).
- **Histórico**: cualquier registro con `esPrincipal = false` — nunca se borra (coherente con el principio de cero pérdida de datos ya vigente en el proyecto).
- **Último usado**: el de `fechaCreacion` más reciente entre todos los de esa Persona (requiere el campo nuevo de 3.3) — útil, por ejemplo, para sugerir automáticamente "actualizar el principal" cuando aparece un teléfono más nuevo que el marcado como principal, sin hacerlo solo (decisión humana, coherente con el resto del sistema).

### 3.8 Punto 8 y 9 de tu pedido — métricas y dashboard de calidad

Extender el dashboard de "salud de datos" ya existente (Fase 12) con una sección nueva específica de identidad/matching, no un dashboard separado (reutilizar la pantalla y el patrón visual ya construido):

| Métrica | Cómo se calcula | Para qué sirve |
|---|---|---|
| % auto-vinculado vs revisión manual (últimos 30 días) | `count(estadoMatching = vinculado_automatico) / total`, sobre `PadronEntrada` + equivalente para duplicados de Personas | Termómetro general de qué tan bien está calibrado el umbral |
| **Tasa de reversión de auto-vinculaciones** | Requiere agregar (cambio menor) un registro cuando un humano deshace/corrige una vinculación que había sido automática — hoy esa señal no se captura en ningún lado | Es la métrica más directa de **falso positivo real** que puede tener el sistema — hoy no existe ninguna forma de medir esto |
| Entradas en banda de revisión manual sin resolver hace más de X días | `count(estadoMatching = pendiente AND fechaCreacion < hoy - X)` | Detecta cuellos de botella de trabajo humano acumulado |
| Tiempo promedio de resolución de una revisión manual | Diferencia entre `fechaCreacion` de la entrada y el `HistorialCambio` que la resolvió | Mide carga operativa real del equipo, no solo del sistema |
| % de éxito de Gemini en lectura de padrón | `count(confianzaExtraccion >= 0.75) / total`, ya se guarda el dato, falta agregarlo | Calidad de la lectura de PDF, señal temprana de un padrón con formato raro |
| Personas creadas por importación sin DNI ni teléfono ni email (fichas "pobres") | Conteo directo sobre `Persona` | Mide si el enriquecimiento progresivo (3.2) está funcionando con el tiempo — debería bajar una vez implementado |
| Personas con evidencia de conflicto sin resolver (del paso de enriquecimiento, 3.2) | Conteo de sugerencias pendientes generadas por `enriquecerPersona` | Cola de trabajo nueva que introduce la feature de enriquecimiento — hay que medirla para no generar más trabajo del que ahorra |

### 3.9 Punto 10 de tu pedido — validación con datos reales, plan concreto

1. **Capturar veredictos humanos desde ya**, sin esperar a tener volumen: cada vez que un usuario confirma o rechaza una sugerencia de duplicado (alta manual, revisión de padrón), guardar el par comparado + la confianza calculada + la decisión humana en una tabla nueva y liviana, `VeredictoIdentidad` (aditiva, bajo riesgo). Esto empieza a acumular datos reales desde el primer día de uso real, no hace falta "esperar" a una fecha futura.
2. **Cuando haya volumen suficiente** (orden de cientos de veredictos, umbral a definir con criterio, no automático), correr una variante de `scripts/benchmark-identidad.ts` que use ese corpus real en vez del sintético, recalculando precisión/recall/F1 y el umbral óptimo real.
3. **Nunca recalibrar el umbral solo**: si el óptimo medido se aleja significativamente del configurado (`umbral_confianza_duplicados`), generar una alerta/sugerencia visible para que un humano (vos, o quien tenga el permiso) decida si actualizar el valor en `/configuracion` — coherente con el principio ya vigente de que ningún número autocalculado se aplica solo sin confirmación.

### 3.10 Punto 11 de tu pedido — escalabilidad, sin optimizar prematuramente

| Volumen | Con blocking trigram (3.5) | Cuándo cambiar de estrategia |
|---|---|---|
| Hasta ~10.000 | Sin cambios adicionales necesarios | — |
| ~10.000–50.000 | Sigue cómodo — el índice GIN trigram escala bien en ese rango, y el motor de scoring en sí es microsegundos | Empezar a medir tiempos reales de blocking en producción, no antes |
| ~50.000–100.000 | Blocking compuesto (apellido + primera letra de nombre, o apellido + carrera) para acotar más los candidatos antes del scoring | Recién acá evaluar mover el matching pesado (padrón, importaciones masivas) a un job asíncrono en cola en vez de inline en el request — hoy no hace falta, el límite de 300s de Vercel ya se maneja con el procesamiento incremental por lotes existente |
| 100.000+ | Fuera del rango para el que este sistema fue diseñado (supuesto S4 documentado: "miles, no decenas de miles") | Ahí sí, revisar si Postgres + `pg_trgm` sigue siendo suficiente o hace falta un motor de búsqueda dedicado (ej. Elasticsearch/Meilisearch) — decisión de arquitectura mayor, no anticiparla ahora |

No propongo ningún cambio de infraestructura (colas, motores de búsqueda externos, particionado) para el volumen actual o el proyectado a mediano plazo — sería exactamente la sobreingeniería que pediste evitar.

### 3.11 Punto 12 de tu pedido — revisión crítica explícita, incluyendo autocuestionamiento de esta misma propuesta

- **¿Es correcto no construir un Identity Graph completo?** Lo sostengo (3.1), pero marco la condición bajo la cual cambiaría de opinión: si en el futuro ATP integra fuentes externas de verdad con señales contradictorias frecuentes (ej. sincronización con un sistema de la facultad, redes sociales con matching automático), ahí sí un grafo probabilístico se justificaría — hoy no.
- **¿Es correcto no crear una tabla de evidencia genérica?** También lo sostengo (3.3), pero es la decisión de este documento con la que menos margen de certeza tengo — si en la práctica el enriquecimiento progresivo (3.2) genera más conflictos de los esperados en campos que hoy asumo "sin conflicto real" (instagram, observaciones), habría que revisitar esto antes de lo previsto. Lo marco como riesgo abierto, no como decisión cerrada.
- **¿La reimplementación a mano de los algoritmos de similitud (sin ninguna librería externa) sigue siendo la decisión correcta?** Sí — es un módulo chico (306 líneas), autocontenido, con tests exhaustivos, y no tiene mantenimiento activo pendiente. El costo de mantenerlo a mano es bajo y ya está pago (benchmarkeado, testeado). No recomiendo migrar a una librería externa solo por principio.
- **¿Las 2 compuertas de seguridad siguen siendo suficientes, o hace falta una tercera?** No encontré evidencia de que falte una tercera compuerta — las dos existentes nacieron de bugs reales concretos y los cubren bien. Agregar una compuerta especulativa sin un caso real que la motive sería sobreingeniería.
- **Autocrítica de esta misma propuesta**: el mayor riesgo de todo este documento es 3.2 (enriquecimiento progresivo) — es el cambio de comportamiento más nuevo, el que menos precedente tiene en el código actual, y el que más necesita que definas vos la política exacta antes de programarlo (qué se completa solo, qué pide confirmación). No lo voy a implementar con una política que yo invente sin validarla con vos primero.

---

## 4. Comparación arquitectura actual vs propuesta

| Dimensión | Actual | Propuesta |
|---|---|---|
| Modelo de identidad | Registro + fusión de un solo salto (correcto pero incompleto) | Igual, + etapa de fusión de atributos (enriquecimiento) |
| Caminos de importación | 3 pipelines, 2 usan el motor completo, 1 no | 1 función de servicio compartida, los 3 convergen |
| Blocking | Prefijo de apellido (SQL simple) | `pg_trgm` (ya instalado) + huella digital como filtro exacto |
| Política de decisión de umbrales | Duplicada, levemente inconsistente entre 2 módulos | Centralizada en una función (`politica-decision.ts`) |
| Qué pasa al confirmar un match | Solo se crea la relación (Participación/vínculo de padrón) | Se crea la relación + se enriquece la Persona (campos vacíos) |
| Evidencia de origen | Ninguna estructurada (solo `HistorialCambio` genérico) | Origen + fecha en `PersonaTelefono`/`PersonaEmail` |
| Métricas de calidad | Ninguna específica de matching | Panel nuevo dentro del dashboard de salud de datos ya existente |
| Validación del umbral | Benchmark sintético únicamente | + corpus de veredictos humanos reales, acumulado desde el uso real |
| Complejidad de infraestructura | Baja | Baja — ningún cambio de infraestructura nuevo, todo sobre lo ya instalado |

---

## 5. Riesgos de migración

| Cambio | Riesgo | Mitigación |
|---|---|---|
| Blocking a `pg_trgm` | **Bajo** — cambio de una consulta SQL, reversible, se puede correr en paralelo comparando resultados antes de reemplazar | Medir en un ambiente de prueba antes de reemplazar el prefijo actual |
| Unificar los 3 imports en `resolverOCrearPersona` | **Medio** — toca 3 puntos de entrada existentes, riesgo de romper el flujo de "confirmar distinta"/fusión del alta manual si no se preserva con cuidado | Cubrir con tests de regresión (ya existe la suite de `tests/unit/identidad/`, sumar tests de integración de los 3 pipelines) antes de reemplazar código en producción |
| Enriquecimiento progresivo (`enriquecerPersona`) | **Alto** relativo a los demás — es comportamiento nuevo, no un refactor de algo existente; puede sorprender a un usuario si la política no está bien acotada | Política conservadora desde el día uno (solo completar vacíos, nunca pisar), validar la política exacta con vos antes de programar, feature flag/activación gradual si hace falta |
| Origen/fecha en `PersonaTelefono`/`PersonaEmail` | **Bajo** — columnas nuevas nullable, aditivas | Migración estándar, sin downtime |
| Política de decisión centralizada | **Bajo-Medio** — cambia el comportamiento de `deteccion-duplicados.ts` al agregarle el piso de 0.4 que hoy no tiene | Verificar con casos reales que agregar el piso no oculte sugerencias que hoy sí se muestran y son útiles |
| Tabla `VeredictoIdentidad` | **Bajo** — aditiva, no depende de nada existente | — |

---

## 6. Impacto en rendimiento

- **Blocking con `pg_trgm`**: neutro a positivo — el índice GIN ya existe y ya se mantiene en cada escritura (lo usa el buscador global), así que no hay costo de infraestructura nuevo; `similarity()` sobre un índice GIN trigram es del mismo orden de magnitud que la consulta de prefijo actual, con mejor recall.
- **Motor de scoring**: sin cambios — ya es del orden de microsegundos por comparación, no es el cuello de botella hoy ni lo va a ser con los cambios propuestos.
- **Enriquecimiento progresivo**: agrega una escritura adicional (actualizar campos de `Persona`) en el camino de confirmación de un match — costo marginal, del mismo orden que cualquier `UPDATE` ya existente en el sistema.
- **Ninguno de los cambios propuestos** introduce llamadas de red nuevas, dependencias externas, ni procesamiento asincrónico adicional al que ya existe.

---

## 7. Impacto en mantenibilidad

- **Positivo, neto**: consolidar 3 lugares con lógica de duplicados en 1 (`resolverOCrearPersona`) y 2 lugares con política de umbrales en 1 (`politica-decision.ts`) reduce directamente el riesgo de que vuelvan a desincronizarse — que es exactamente lo que ya pasó (P4, esta inconsistencia existe hoy).
- **Riesgo menor introducido**: `enriquecerPersona` es una función nueva con reglas de negocio no triviales (qué se completa, qué se sugiere) — hay que documentarla con el mismo nivel de detalle que el resto de `lib/identidad/` para que no se vuelva una caja negra.
- **Deuda menor que quedaría resuelta de paso**: renombrar las 3 funciones de normalización de teléfono (P9) para que la diferencia sea obvia por el nombre, no solo por comentarios — bajo costo, alto valor de claridad para cualquiera que edite el código en el futuro.

---

## 8. Impacto en experiencia de usuario

- **Positivo directo**: fichas de Persona que se completan solas con el tiempo (enriquecimiento progresivo) significan menos trabajo manual real para el equipo de militantes — hoy, si "Juan Perez" apareció sin teléfono en el alta y después lo dio en una Actividad, alguien tiene que copiarlo a mano a la ficha; con la propuesta, eso pasa solo.
- **Positivo directo**: un panel de calidad de matching le da a vos (o a quien coordine) visibilidad real de cómo está funcionando el sistema, sin depender de leer logs de Vercel.
- **Riesgo a mitigar activamente**: si el enriquecimiento se implementa mal, un usuario podría ver un campo de una ficha "cambiar solo" sin entender por qué — se mitiga con la regla conservadora de 3.2 (nunca pisar, solo completar vacíos) y dejando todo trazado en el Historial de la ficha, que ya es una pestaña visible hoy.
- **Neutro**: los cambios de blocking y de política de decisión son invisibles para el usuario final — mejoran la calidad de las sugerencias que ya ve, sin cambiar la interfaz.

---

## 9. Plan de implementación por etapas

Ordenado por relación costo/beneficio, no por dependencia estricta — las etapas 0 y 1 se pueden hacer en cualquier orden entre sí, ambas son prerequisito razonable antes de la 3.

**Etapa 0 — Blocking + campos de origen (bajo riesgo, sin dependencias)**
Reemplazar prefijo por `pg_trgm` en los 2 módulos de blocking existentes. Agregar `origen`/`fechaCreacion` a `PersonaTelefono`/`PersonaEmail` (migración aditiva). Renombrar las 3 funciones de normalización de teléfono (P9).

**Etapa 1 — Cerrar la inconsistencia de importación (alta prioridad, ya documentada en el informe anterior)**
Construir `resolverOCrearPersona()` y migrar `importaciones.service.ts` para que use el motor completo en vez de solo DNI. Corregir la documentación funcional desactualizada (P8) en el mismo cambio.

**Etapa 2 — Centralizar la política de decisión**
`politica-decision.ts`, migrar los 2 (o ya 1, si la Etapa 1 los unificó) callers a usarla. Validar con casos reales que el piso de 0.4 no oculte sugerencias hoy útiles en detección de duplicados de Personas.

**Etapa 3 — Enriquecimiento progresivo (el cambio de mayor impacto conceptual, requiere tu validación de la política antes de programar)**
Definir con vos, explícitamente, qué campos se completan solos y bajo qué condición exacta (propuesta de partida: solo completar vacíos, nunca pisar). Implementar `enriquecerPersona()` y conectarla a los 3 puntos de confirmación de match (alta manual, importaciones, vinculación de padrón).

**Etapa 4 — Dashboard de calidad de matching**
Extender el dashboard de salud de datos existente con las métricas de la sección 3.8. Depende de que la Etapa 3 esté activa para que algunas métricas (fichas "pobres" en descenso) tengan sentido de tendencia.

**Etapa 5 — Validación con datos reales (arranca ya, madura con el tiempo)**
Crear `VeredictoIdentidad` y empezar a capturar veredictos humanos desde el primer uso real (no depende de las demás etapas, se puede hacer en paralelo desde la Etapa 0). Recalibración real recién cuando haya volumen suficiente.

---

## 10. Recomendación final

**No rediseñar el motor de comparación** (`lib/identidad/algoritmos.ts`, `motor-scoring.ts`) — está bien pensado, benchmarkeado, y las decisiones que ya tomó (compuertas de seguridad, sin librerías externas, revisión humana obligatoria) siguen siendo correctas hoy. Cuestionarlo activamente, como pediste, y no encontré una arquitectura mejor para *esa* pieza específica.

**Sí rediseñar cómo se usa ese motor y qué se hace con su resultado** — ahí está el gap real entre "lo que el sistema hace hoy" (deduplicar y vincular) y "lo que pediste" (construir una identidad canónica acumulativa). El cambio de mayor impacto conceptual es el enriquecimiento progresivo (3.2/Etapa 3); el de mayor impacto inmediato con menor riesgo es cerrar la inconsistencia de importación (3.4/Etapa 1), que además ya estaba señalada como el hallazgo más urgente del informe anterior.

**Orden de arranque sugerido**: Etapa 0 y Etapa 1 primero (bajo riesgo, alto valor, ya validadas por el diagnóstico), Etapa 5 en paralelo desde el día uno (no cuesta nada empezar a acumular veredictos reales), y recién después de tu validación explícita de la política, Etapa 3. No recomiendo tratar esto como un rediseño de una sola vez — el propio pedido dice "no quiero sobreingeniería", y la forma de honrar eso es avanzar por etapas independientemente entregables, no con una migración grande de una sola vez.

No implementé nada de lo anterior. Quedo a la espera de qué etapas aprobás y, en particular, de la definición exacta de la política de enriquecimiento (Etapa 3) antes de tocar código ahí.
