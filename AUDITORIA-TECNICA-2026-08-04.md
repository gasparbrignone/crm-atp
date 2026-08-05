# Auditoría técnica — cierre de Etapas 0, 1, 2, 5 + etiquetado de Personas

**Fecha**: 2026-08-04. Pedido explícito de Gaspar: revisión completa antes de dar por definitivamente cerradas las Etapas 0, 1, 2 y 5 del rediseño de identidad (más el etiquetado de Personas, entregado en la misma sesión). Todo lo encontrado se corrigió directamente cuando no implicaba cambiar una decisión funcional ya aprobada; lo que sí la implica queda listado aparte, sin tocar.

**Resultado global**: **6 problemas reales encontrados, 6 corregidos** (con tests de regresión nuevos para cada uno), **1 limitación real documentada mas no corregida** (requiere tu decisión), **0 regresiones**. Suite final: **98/98 tests, build y lint limpios**.

---

## 1. Problemas encontrados y corregidos

### 1.1 Bug funcional real: `fusionarPersonas()` no re-vinculaba etiquetas

La fusión de dos fichas de Persona ya re-vinculaba `Participacion`, `PunteoPersona`, `PadronEntrada` e `HistorialCambio` de la ficha descartada a la definitiva (RN-2) — pero **no** `PersonaEtiqueta`. Esto existía desde antes de esta sesión (el modelo ya existía), pero recién ahora es alcanzable de verdad, porque hasta hoy no había ninguna UI real para asignar etiquetas a una Persona. Sin el fix: fusionar dos fichas con etiquetas asignadas dejaba las etiquetas de la descartada huérfanas, invisibles en la definitiva.

**Corregido** en `lib/servicios/personas.service.ts` (`fusionarPersonas`), mismo criterio que las otras relaciones con restricción de unicidad (si la definitiva ya tenía la misma etiqueta, se descarta el duplicado en vez de re-vincularlo). Documentado en `04-modelo-datos.md` RN-2. **3 tests nuevos** en `tests/unit/servicios/fusion-etiquetas.test.ts`.

### 1.2 Performance real: N+1 al calcular el umbral de confianza en cada fila de una importación

`resolverOCrearPersona()` (construida en la Etapa 1) hacía una consulta a `ConfiguracionSistema` **por cada fila** de una importación CSV, en vez de una sola vez para todo el archivo — con 1.000 filas, 1.000 SELECT idénticos innecesarios. El patrón correcto (calcular una vez, reusar) ya existía en otros dos lugares del código (`participaciones.service.ts`, `padron.service.ts`) pero no se replicó al construir la función nueva.

**Corregido**: `resolverOCrearPersona()` ahora acepta un umbral precalculado opcional; `importaciones.service.ts` lo calcula una sola vez antes del loop. **1 test nuevo** que verifica explícitamente que la consulta se hace una sola vez, sin importar cuántas filas tenga el archivo.

### 1.3 Performance real: N+1 y consultas duplicadas en la acción masiva de etiquetado

`asignarEtiquetaMasivo()` (construida en la primera parte de esta sesión) delegaba en `agregarEtiquetaAPersona()` persona por persona, lo que repetía — una vez por cada Persona seleccionada — la misma consulta de `Etiqueta` (constante durante toda la operación) y el mismo chequeo de idempotencia dos veces (una en la función masiva, otra dentro de la función individual). Con una selección de cientos de Personas, cientos de consultas redundantes.

**Corregido**: la Etiqueta se busca una sola vez; la idempotencia se resuelve con un único `findMany` + `createMany({ skipDuplicates: true })`. Mismo resultado observable, muchas menos consultas. **4 tests** (3 reescritos + 1 nuevo que verifica que la Etiqueta se busca una sola vez).

### 1.4 Bug real pre-existente (no introducido en esta sesión, encontrado al retomar el etiquetado): `Etiqueta` sin columna `orden`

`lib/servicios/configuracion.service.ts` asume que los 4 catálogos editables comparten forma, incluido `orden` — pero el modelo `Etiqueta` nunca tuvo esa columna. Resultado: **`/configuracion?tab=etiqueta` tiraba un error de Prisma en cada visita**, en producción, desde que existe ese catálogo. No relacionado con el rediseño de identidad, pero bloqueaba directamente la feature de etiquetado que estaba construyendo.

**Corregido**: migración `20260804115920_etiqueta_orden`, con backfill alfabético para las etiquetas ya cargadas. Verificado con una llamada real a `listarCatalogo("etiqueta")` contra la base real, antes y después del fix.

### 1.5 Duplicación de código: cálculo de color de chip repetido en 3 componentes

El mismo cálculo (`color de fondo semitransparente + color de texto según el color de la Etiqueta, con gris por defecto`) estaba copiado igual en 3 archivos (ficha, listado, selector de etiquetas).

**Corregido**: extraído a `lib/utils/etiqueta-color.ts` (`estiloEtiqueta()`), reusado en los 3 lugares. Sin cambio de comportamiento visual — confirmado con el build y con la verificación previa en navegador.

### 1.6 Test propio con aserciones incorrectas (encontrado al ejecutar la batería de casos extremos)

Al escribir los tests adversariales nuevos (sección 2), dos aserciones mías estaban mal planteadas, no el motor: esperaba `confianza === 1` exacto (imposible en punto flotante, la suma de los pesos da `0.9999999999999999`) y esperaba `>0.6` para un caso que en realidad da exactamente `0.6` (ver hallazgo 3.1). Corregidas para reflejar el comportamiento real verificado, no una expectativa mía sin validar.

---

## 2. Casos extremos probados contra el motor de identidad (intento deliberado de romperlo)

23 tests nuevos en `tests/unit/identidad/casos-extremos.test.ts`, más una verificación adicional contra la base real con caracteres especiales. Ninguno rompió el motor (0 excepciones, confianza siempre en rango `[0,1]`):

- Strings vacíos, solo espacios, solo comas, un solo carácter.
- Nombres extremadamente largos (500 repeticiones, 10.000 caracteres).
- Solo números (columna mal mapeada).
- Emojis, símbolos, intento de inyección SQL en el nombre (defensa en profundidad — nunca se concatena a SQL directamente, pero tampoco debía romper el *parsing* del motor).
- Múltiples comas desordenadas, direcciones completas pegadas por error, nombre repetido muchas veces.
- Alfabetos no latinos (cirílico, chino).
- Apellido con guion, nombre invertido con inicial + apellido compuesto materno/paterno.
- Homónimos exactos reales (mismo nombre y apellido, personas distintas — el motor no puede ni debe saber que son distintas sin más datos; da confianza máxima, correcto por diseño, la decisión de si son la misma persona es humana).
- Contra la base real: apellidos con apóstrofe (`O'Brien`, `D'Angelo`), guion, tildes, un intento literal de `'; DROP TABLE "Persona"; --` como apellido (confirmado: la tabla `Persona` quedó intacta, `$queryRaw` de Prisma parametriza los templates, no concatena).

---

## 3. Problema encontrado que requiere tu decisión (no corregido)

### 3.1 Limitación real: apellidos compuestos con guion no matchean contra la misma forma con espacio

`"Maria Jose Garcia-Lopez"` vs `"Maria Jose Garcia Lopez"` — **la misma persona**, solo un formato de escritura distinto (común en apellidos españoles/franceses) — da exactamente **60% de confianza**, la misma banda que dos personas genuinamente distintas con apellido parecido. Nunca se auto-vincularía, siempre cae en revisión manual, aunque en los hechos sea una coincidencia casi perfecta.

**Causa raíz**: `normalizarTextoIdentidad()` (capa de normalización del motor) conserva el guion como parte del token — `"garcia-lopez"` queda como **una sola palabra**, mientras que `"garcia lopez"` (con espacio) queda como **dos**. La compuerta de apellido exacto (`compartenApellidoExacto`) compara tokens completos, así que `"garcia-lopez"` nunca coincide exactamente con `"garcia"` o `"lopez"` por separado.

**Por qué no lo corregí sin tu autorización**: cambiar cómo se tokeniza el guion es tocar una pieza del motor ya calibrada contra el benchmark sintético (`lib/identidad/BENCHMARK-RESULTADOS.md`, pesos y umbrales ajustados por búsqueda en grilla sobre ese corpus específico). No es un fix aislado — cambiar la tokenización puede mover resultados en todo el corpus de 365 pares y requeriría volver a correr `scripts/benchmark-identidad.ts` para confirmar que los pesos/umbrales siguen siendo óptimos. Es una decisión de diseño, no un bug de una línea.

**Documentado, no corregido**: el comportamiento actual (con la limitación) quedó fijado en un test explícito (`tests/unit/identidad/casos-extremos.test.ts`), con el comentario completo de por qué, para que quede en el código y no solo en este informe.

**Opciones, si querés que lo resuelva**:
- **A (más simple, más barata)**: en `normalizarTextoIdentidad()`, tratar el guion como separador de tokens (igual que el espacio) en vez de conservarlo dentro de la palabra. Requiere re-correr el benchmark para confirmar que los pesos siguen siendo óptimos, pero es un cambio de una línea de regex.
- **B**: agregar una regla específica en `compartenApellidoExacto()` que también compare la versión "sin guion, con espacio" de cada token de apellido antes de descartar. Más quirúrgico, no toca la tokenización general (usada también por blocking y por el resto de las señales), pero es una regla ad-hoc más para mantener.
- **C**: no tocar nada — es un caso real pero probablemente poco frecuente en la práctica de ATP (apellidos compuestos con guion no son mayoría en Argentina); queda como limitación conocida y aceptada.

No hice sonar los beeps por esto porque no bloquea nada — el sistema sigue funcionando correctamente (cae en revisión manual, nunca se equivoca silenciosamente), solo genera trabajo manual de más en un caso específico. Queda para tu respuesta junto con las preguntas abiertas del diseño de enriquecimiento.

---

## 4. Verificación de migraciones y despliegue desde cero

- **Las 3 migraciones nuevas de esta sesión están consistentes con la base real**: verificado con una consulta directa a `_prisma_migrations` — las 12 carpetas de `prisma/migrations/` en disco coinciden exactamente con las 12 filas registradas en la base (0 pendientes, 0 huérfanas, 0 a medio aplicar).
- **Orden cronológico correcto**: `20260804112004` → `20260804114616` → `20260804115920`, todas posteriores a la última migración pre-existente (`20260804030900`).
- **`npx prisma validate`**: schema válido.
- **Riesgo real para un despliegue desde cero, ya conocido, reafirmado acá**: `prisma migrate deploy` sigue colgándose contra el pooler de Supabase (mismo problema documentado en `CLAUDE.md`, reproducido de nuevo al aplicar la primera migración de esta sesión). El camino que funciona es el manual ya documentado (crear la carpeta a mano, aplicar con un script que usa `$executeRawUnsafe` sentencia por sentencia, insertar en `_prisma_migrations`). Si alguna vez necesitás levantar un ambiente nuevo desde cero (branch de preview con su propia base, por ejemplo), este es el camino a seguir, no `prisma migrate deploy` directo — no es una regresión de esta sesión, es una limitación conocida del proyecto contra este proveedor específico de Postgres.

---

## 5. Revisión de performance / N+1

Además de los 2 N+1 reales corregidos (secciones 1.2 y 1.3), encontré uno **pre-existente, no introducido esta sesión, que decidí NO tocar**:

`buscarCoincidenciaDeterministica()` en `lib/ia/deteccion-duplicados.ts` (sin modificar por mí, salvo el nombre de una función interna) — el chequeo de teléfono exacto trae **todos** los `PersonaTelefono` de la base entera (de personas no fusionadas) y filtra en JavaScript, en vez de filtrar en SQL. Esto es porque la normalización de teléfono para comparar no es trivial de expresar como una columna indexada. No es una regresión de esta sesión (esta función no fue tocada, solo el nombre de la función interna que llama), y tocar la estrategia de esa consulta es una decisión de diseño con implicancias de corrección (no solo de performance) que prefiero no tomar unilateralmente en una auditoría. Lo marco para que lo tengas presente si el volumen de Personas crece significativamente — hoy, con el volumen real de ATP (miles, no decenas de miles), el impacto es bajo.

---

## 6. Nivel de confianza final

**Alto**, con una salvedad puntual señalada.

- El código de las Etapas 0, 1, 2 y 5, y el etiquetado completo, están verificados en 3 capas: tests unitarios (98/98, con cobertura específica de cada fix de esta auditoría), verificación real en navegador contra la base de desarrollo real (sesión anterior, Playwright), y ahora además una batería adversarial de 23 casos extremos contra el motor puro más pruebas manuales contra la base real con caracteres especiales — ninguna rompió nada.
- Los 6 problemas reales que encontré en esta auditoría (3 de código de esta sesión, 1 pre-existente pero recién alcanzable, 1 de duplicación, 1 de mis propios tests) ya están corregidos y con test de regresión.
- La única salvedad real es la limitación de apellidos con guion (sección 3.1) — no es un bug que corrompa nada, es una imprecisión conocida y ahora documentada del motor, con el sistema respondiendo de la forma más segura posible ante esa imprecisión (revisión manual, nunca auto-vinculación incorrecta).
- No encontré nada que me haga dudar de que las Etapas 0, 1, 2 y 5 están listas para considerarse cerradas.

## 7. Recomendaciones para la Etapa 3

1. **Antes de programar nada de Etapa 3, necesito tu respuesta a las 4 preguntas abiertas de `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`** — sigue siendo el bloqueo real, esta auditoría no lo cambia.
2. **La limitación de apellidos con guion (sección 3.1) es más urgente resolver antes que después de la Etapa 3**: el enriquecimiento progresivo va a comparar nombres con más frecuencia y desde más fuentes — si vas a decidir sobre esto, mejor decidirlo ahora que después de que el enriquecimiento dependa del mismo motor con la misma limitación.
3. Los 2 N+1 corregidos en esta auditoría son un recordatorio de que **cualquier función nueva que orqueste el motor de identidad en un loop (como la Etapa 3 va a hacer) necesita pensar explícitamente en "¿esto se llama una vez por operación, o una vez por fila?" desde el diseño**, no como optimización posterior — lo voy a tener en cuenta al diseñar la implementación de `enriquecerPersona()` una vez que apruebes el diseño.
4. Dado que encontré un bug real de re-vinculación en la fusión (sección 1.1) al construir una feature que tocaba una relación que la fusión no contemplaba, **al implementar `enriquecerPersona()` conviene revisar explícitamente qué pasa con el enriquecimiento si la Persona enriquecida se fusiona después** (¿el enriquecimiento pendiente/aplicado sigue a la ficha definitiva?) — no es una pregunta nueva de la Etapa 3, pero esta auditoría es evidencia de que este tipo de interacción entre features se pasa por alto fácil si no se pregunta explícitamente.
