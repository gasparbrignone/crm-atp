# Diseño de la política de enriquecimiento progresivo (Etapa 3) — para revisión de Gaspar

**Fecha**: 2026-08-04. **Estado**: propuesta de diseño, sin implementar. Pedido explícito: no tocar código de `enriquecerPersona()` hasta que este documento esté aprobado o corregido. Referencia: [`PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md`](PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md) sección 3.2.

---

## 1. Qué problema resuelve, en una frase

Hoy, cuando el sistema vincula una entrada nueva (fila de padrón, inscripción a actividad, fila de importación) contra una `Persona` ya existente, solo crea la relación (`Participacion`, `PadronEntrada.personaId`) — nunca actualiza los campos de esa `Persona` con datos más completos que traiga la fuente nueva. `enriquecerPersona()` cierra esa brecha.

## 2. Cuándo se llama

En **todo punto donde el sistema confirma** (automática o manualmente) que una entrada de datos corresponde a una `Persona` existente:

| Disparador | Función que lo confirma hoy |
|---|---|
| Alta manual — usuario elige "es la misma persona" y va a fusión | Flujo de fusión (`fusionarPersonas`) — **no aplica acá**, ver nota abajo |
| Importación de inscriptos a Actividad — match automático o revisión manual | `inscribirPersona()` (vía `resolverOCrearPersona`/`buscarPersonaCoincidente`) |
| Importación CSV genérica de Personas — match automático | `resolverOCrearPersona()` (rama `"vinculada"`) — hoy esa rama solo reporta duplicado, no vincula ni enriquece, ver sección 5 |
| Padrón — vinculación automática o manual | `vincularEntradaManualmente()`, y el paso de vinculación automática dentro de `resolverDatosMatchingEntrada()`/`procesarSiguienteLotePadron()` |

**Nota importante — la fusión NO usa esta función**: fusionar dos fichas ya tiene su propio mecanismo de fusión de atributos, campo por campo, elegido explícitamente por el usuario (`camposElegidos` en `fusionarPersonas()`, ver `05-modulo-personas.md` sección 8.2) — es más granular y ya más seguro que lo que propone este documento (el usuario decide campo por campo, no "completar automáticamente"). `enriquecerPersona()` es para el caso **más común y hoy no cubierto**: alguien ya confirmado como la misma persona (no ficha duplicada, sino la persona correcta) aporta un dato nuevo a través de una Actividad, un padrón, o una importación — no hay ninguna decisión de "cuál ficha gana", solo "¿este dato nuevo suma algo que la ficha no tenía?".

## 3. Qué campos se completan solos, cuáles se sugieren, cuáles nunca se tocan

| Campo | Si está vacío en la Persona | Si ya tiene un valor distinto | Por qué |
|---|---|---|---|
| **Teléfono** (`PersonaTelefono`) | Se agrega como nuevo registro no principal, con `origen` (Etapa 0, ya implementado) | Se agrega como nuevo registro adicional no principal | Ya es multivaluado — agregar nunca pisa nada, es aditivo por diseño. Nunca cambia cuál es el principal solo (ver sección 3.1). |
| **Email** (`PersonaEmail`) | Igual que teléfono | Igual que teléfono | Mismo motivo |
| **DNI** | Se completa solo | **Nunca se pisa** — si difiere, no se aplica ni se sugiere (ver sección 6, caso límite) | Es la señal de identidad más fuerte del sistema; un DNI distinto en una fuente nueva sobre una Persona ya confirmada como la misma es más probable error de tipeo/transcripción que un dato mejor — no vale la pena el riesgo de corromper la señal más confiable que existe |
| **Legajo** | Se completa solo | Se registra como sugerencia pendiente (ver sección 4) | Puede cambiar legítimamente (recursada, etc.), pero no hay forma de saber si el valor nuevo es más reciente o un error |
| **Carrera** | Se completa solo | Se registra como sugerencia pendiente | Igual razón que legajo — cambio de carrera es real y frecuente, pero silencioso es riesgoso |
| **Año** | Se completa solo | **Nunca se pisa ni se sugiere** | El año cambia todos los años para cualquier persona activa — completarlo o sugerirlo generaría ruido constante sin valor real; se deja fuera de esta función a propósito |
| **Apellido / Nombre** | No aplica — son obligatorios desde el alta, nunca están vacíos | **Nunca se pisan ni se sugieren desde acá** | Cambiar nombre/apellido sin revisión humana explícita es el tipo de error más grave que puede cometer este sistema (podría "corregir" el nombre de la persona equivocada). Si una fuente nueva trae un nombre más completo, esa es información para el flujo de fusión/edición manual, no para autocompletado silencioso |
| **Instagram** | Se completa solo | **Nunca se pisa ni se sugiere** | Campo de bajo riesgo pero también de bajo valor para automatizar — no vale la complejidad de una sugerencia para esto (ver autocrítica del documento madre, sección 3.11) |
| **Observaciones generales** | Se completa solo si estaba vacío | **Nunca se pisa; nunca se sugiere reemplazo** — pero si la fuente nueva trae una observación y la Persona ya tenía una, se **concatena** como línea nueva (no se pierde ninguna de las dos) | Es texto libre acumulativo por naturaleza, no un dato de "un solo valor verdadero" — concatenar es más seguro que sugerir reemplazo y más útil que descartar el dato nuevo |

### 3.1 Teléfono/email "principal" — nunca cambia solo

Un dato nuevo que llega vía enriquecimiento **nunca se marca como principal automáticamente**, aunque la Persona no tuviera ninguno marcado como principal todavía. Si no hay ningún teléfono/email marcado como principal, el primero que se agregue (por cualquier vía, incluida esta) puede proponerse como principal solo si **no hay ningún otro ya cargado** — en ese caso específico, no hay ambigüedad real (no hay nada que "reemplazar"). Si ya existe uno marcado como principal, el nuevo se agrega como secundario, punto, sin ninguna sugerencia de "actualizar el principal" en esta etapa (esa idea está en la propuesta madre sección 3.7 como mejora futura, no en el alcance de esta función).

## 4. Qué es una "sugerencia pendiente" — el mecanismo para lo que no se completa solo

Cuando un campo (legajo, carrera) ya tiene un valor y la fuente nueva trae uno **distinto**, no se aplica y no se descarta silenciosamente: queda registrada como una fila pendiente de revisión, reutilizando el mismo patrón visual que ya existe hoy para las sugerencias de duplicado en el alta manual (`EstadoFormularioPersona.candidatos` en `personas/actions.ts`) — no es un mecanismo nuevo de UI, es el mismo patrón aplicado a un caso distinto.

Propuesta de dónde vive esta cola, dos opciones, con recomendación:

- **Opción A (recomendada, más simple)**: no crear ninguna tabla nueva. La "sugerencia" es simplemente un registro en `HistorialCambio` con `accion: "otro"`, `metadata: { proceso: "enriquecimiento_pendiente", campo, valorPropuesto, origen }`, sin aplicar el cambio. Se hace visible agregando una tarjeta al dashboard de salud de datos (Etapa 4 del plan madre) que cuente y liste estos eventos no resueltos, con un botón "aplicar" / "descartar" que llama a `actualizarCampoPersonaAction` (ya existe) o simplemente cierra el evento. Ventaja: cero modelo nuevo, reutiliza lo que ya audita todo el sistema.
- **Opción B**: tabla nueva `SugerenciaEnriquecimiento` con estado (`pendiente`/`aplicada`/`descartada`). Más estructurado, permite una bandeja de tareas dedicada, pero es más código y otra tabla para un caso que, en la práctica, va a ser poco frecuente (solo legajo y carrera generan sugerencia; DNI/nombre/apellido no llegan a esta etapa).

**Mi recomendación es la Opción A** — es coherente con el principio de "evitar sobreingeniería" del pedido original, reutiliza infraestructura de auditoría que ya existe y ya es visible en la ficha de cada Persona (pestaña Historial), y si con el uso real se demuestra que hace falta una bandeja dedicada, migrar de A a B más adelante es un cambio aislado (no hay que rehacer la lógica de decisión, solo dónde se persiste la sugerencia).

## 5. Impacto en `resolverOCrearPersona()` — cambio de contrato

Hoy (Etapa 1, ya implementado), cuando `resolverOCrearPersona()` devuelve `tipo: "vinculada"`, el llamador decide qué hacer — en `importaciones.service.ts` eso significa "reportar como duplicado, no crear nada". Con enriquecimiento, el significado correcto de `"vinculada"` pasa a ser **"ya existe: se enriqueció con los datos nuevos, y no se crea una fila duplicada"** — sigue sin crear una `Persona` nueva (eso no cambia), pero ahora **si** hay una escritura real sobre la Persona existente. Esto es coherente con el objetivo del pedido original ("identidad canónica acumulativa"), pero es un cambio de comportamiento real que vale la pena que confirmes: hoy una importación CSV con una fila que matchea a alguien existente se reporta como error/duplicado sin tocar nada; con esto, va a **enriquecer la ficha existente y además reportarlo como informativo** (no como error) en el resumen de la importación, ya que técnicametne no es un problema sino un resultado esperado. Habría que decidir si esa fila sigue contando como "duplicado" en las métricas del `ImportJob` o pasa a una categoría nueva ("enriquecida") — lo dejo como pregunta abierta en la sección 8.

## 6. Casos límite

- **Fuente nueva con un DNI distinto al de la Persona ya confirmada como la misma**: no se aplica, no se sugiere, se registra en `HistorialCambio` como anomalía (`metadata: { proceso: "enriquecimiento_anomalia", campoConflicto: "dni" }`) para que quede trazado, pero no genera una tarea visible — es un caso raro y probablemente indica un error de matching más profundo (dos personas distintas que el motor vinculó mal), no algo que resolver con una sugerencia de campo.
- **Dos fuentes distintas enriquecen el mismo campo vacío casi al mismo tiempo** (ej. dos importaciones concurrentes agregan legajo a la misma Persona con valores distintos): gana la primera que se procese (ya no está vacío para la segunda, que entonces genera sugerencia pendiente en vez de pisar) — el propio diseño de "solo completa si está vacío" resuelve la concurrencia sin necesitar locking explícito.
- **La Persona está `archivada`**: enriquecimiento igual aplica (una ficha archivada puede reaparecer en una fuente nueva; archivar no debería congelar su calidad de datos) — sin cambios de estado, solo los campos.
- **La Persona está `fusionada`**: nunca debería llegar a `enriquecerPersona()` porque `buscarPersonaCoincidente`/`buscarPersonaParaEntradaPadron` ya excluyen `estadoFicha: "fusionada"` de los candidatos — si por algún bug llegara, la función debe rechazar explícito (no enriquecer una ficha fantasma) y registrar el caso como anomalía.

## 7. Qué NO hace esta función (para que quede explícito)

- No fusiona fichas.
- No decide que dos Personas son la misma — eso ya lo decidió el motor de identidad o un humano antes de que se llegue a `enriquecerPersona()`.
- No borra ni reemplaza ningún valor existente, en ningún campo, bajo ninguna circunstancia.
- No genera notificaciones al usuario en tiempo real (las sugerencias pendientes se ven en el dashboard/historial, no interrumpen ningún flujo).

## 8. Preguntas abiertas para vos antes de implementar

1. **¿Confirmás la tabla de la sección 3** (qué se completa solo / qué genera sugerencia / qué nunca se toca)? Es el corazón del diseño — todo lo demás es mecánica.
2. **¿Opción A o B para las sugerencias pendientes** (sección 4)? Recomiendo A.
3. **Sección 5**: cuando una importación CSV enriquece en vez de solo reportar duplicado, ¿la fila sigue contando como "duplicado" en el resumen del `ImportJob`, o agregamos una categoría nueva ("enriquecida", sin contar como error)? Mi inclinación es la segunda opción (no es un error, es el sistema funcionando como se pidió), pero cambia lo que ve el usuario al terminar una importación, así que prefiero confirmarlo antes de tocar ese contador.
4. **Concatenación de observaciones (sección 3, fila "Observaciones generales")**: ¿te sirve el criterio de "agregar como línea nueva con separador y fecha", o preferís que las observaciones queden completamente fuera del alcance de enriquecimiento por ahora (más conservador, menos valor)?

Quedo esperando tu revisión de este documento antes de tocar código de `enriquecerPersona()`.
