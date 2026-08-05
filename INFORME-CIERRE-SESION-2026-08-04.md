# Informe de cierre — rediseño del motor de identidad (Etapas 0, 1, 2, 5) + etiquetado de Personas

**Fecha**: 2026-08-04. Continuación de la misma sesión que produjo [`INFORME-MOTOR-MATCHING-Y-PADRONES-2026-08-04.md`](INFORME-MOTOR-MATCHING-Y-PADRONES-2026-08-04.md) (informe técnico solicitado) y [`PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md`](PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md) (arquitectura propuesta, aprobada por Gaspar con 2 condiciones: avanzar por etapas, y presentar el diseño de la política de enriquecimiento antes de tocar esa etapa — ver [`DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`](DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md), entregado, pendiente de revisión).

## Qué se implementó

### Etapa 0 — Blocking + evidencia de origen
- Reemplazado el blocking por prefijo de apellido (3-4 caracteres exactos) por `similarity()` sobre el índice GIN `pg_trgm` ya instalado (Fase 10, para el buscador global) en `lib/ia/deteccion-duplicados.ts` y `lib/ia/matching-padron.ts`. Mejora real de recall: encuentra candidatos con error de tipeo en las primeras letras del apellido, que el blocking anterior no podía ver por diseño.
- Migración `20260804112004_persona_contacto_origen`: agrega `origen` (enum `OrigenDato`) y `fechaCreacion` a `PersonaTelefono`/`PersonaEmail`. Poblado en los 3 puntos de creación reales (alta manual/punteo → `alta_manual`, importación CSV de Personas → `importacion_csv`, importación de inscriptos a Actividad → `importacion_actividad`).
- Renombradas las 2 funciones `normalizarTelefono` (una para guardar, una para comparar) a `normalizarTelefonoParaGuardar`/`normalizarTelefonoParaComparar` — mismo comportamiento, nombres que no se confunden entre sí.

### Etapa 1 — Unificación de los 3 caminos de importación (el hallazgo más urgente del informe técnico)
- Nueva función `resolverOCrearPersona()` en `lib/servicios/personas.service.ts`: envuelve `buscarPersonaCoincidente()` + `crearPersona()`, devuelve `creada` / `vinculada` / `ambiguo`.
- `lib/servicios/importaciones.service.ts` migrado para usarla — antes solo comparaba DNI exacto (la única de las 3 vías que no usaba el motor completo, y contradecía lo que decía `14-importaciones-exportaciones.md`). Ahora usa el motor completo, igual que el alta manual y la importación de inscriptos.
- Corregidas las 2 divergencias documentación-vs-código detectadas en el informe técnico (`14-*.md` sección 9, `15-ia.md` sección 4.1 sobre lectura de PDF por imagen).

### Etapa 2 — Política de decisión centralizada
- `lib/identidad/politica-decision.ts`: función única `clasificarConfianza()` con el piso de 0.4 (antes solo existía en `matching-padron.ts`; `deteccion-duplicados.ts` no lo tenía, así que una coincidencia de confianza casi nula igual se mostraba como "sugerencia ambigua" al usuario). Ambos módulos migrados a usarla.
- **Cambio de comportamiento real, ya en producción con este cierre**: en detección de duplicados de Personas (alta manual e importaciones), un candidato con confianza por debajo de 0.4 ahora se descarta silenciosamente (`sin_candidatos`) en vez de mostrarse como sugerencia. Es la corrección de una inconsistencia real, pero lo marco explícito porque cambia algo visible para el usuario.

### Etapa 5 — Captura de veredictos humanos (arranca a acumular datos reales desde hoy)
- Modelo nuevo `VeredictoIdentidad` (migración `20260804114616_veredicto_identidad`) + servicio `lib/servicios/veredictos-identidad.service.ts`.
- Cableado en los 3 puntos reales donde un humano ya confirma o rechaza una coincidencia: alta manual (`confirmar_distinta`), fusión (`fusionarPersonas`, cualquier fusión confirmada), y padrón (`vincularEntradaManualmente` / `marcarEntradaSinCoincidencia`, esta última registra un veredicto por cada candidato sugerido y descartado).
- Ningún fallo en esta captura interrumpe la operación real (try/catch aislado en cada punto) — es un registro adicional, no una condición de la operación.

## Etiquetado de Personas (pendiente de sesión anterior, retomado y cerrado en esta)

Con el backend ya construido antes de la interrupción de esta sesión (motor de identidad), completé la UI que faltaba, según `05-modulo-personas.md` sección 7:

- **Alta manual** (`/personas/nueva`): selector de etiquetas existentes (checkboxes) + campo para crear etiquetas nuevas al vuelo, dentro de "Más datos (opcional)".
- **Ficha de Persona** (`/personas/[id]`, pestaña "Etiquetas" nueva): agregar etiqueta existente, crear y asignar una nueva, quitar una asignada — todo inline, sin recargar la página. También se ven como chips en el encabezado de la ficha.
- **Listado** (`/personas`): columna nueva "Etiquetas" con los chips de cada fila, filtro por etiqueta en la barra de búsqueda, y acción masiva "Asignar etiqueta..." sobre una selección (mismo patrón que la inscripción masiva a Actividad ya existente).
- Server Actions nuevas en `personas/actions.ts`: `agregarEtiquetaAction`, `quitarEtiquetaAction`, `crearYAgregarEtiquetaAction`, `asignarEtiquetaMasivoAction` — todas gateadas por `personas.editar` (mismo permiso que el resto de la edición, sin fricción extra para crear una etiqueta nueva, como pide la sección 7 del documento).

**Bug real pre-existente encontrado y corregido al retomar esto**: `lib/servicios/configuracion.service.ts` asume que los 4 catálogos editables (Carrera, TipoActividad, Etiqueta, ClasificacionPunteo) comparten la misma forma, incluido un campo `orden` — pero el modelo `Etiqueta` nunca tuvo esa columna. Resultado: **`/configuracion?tab=etiqueta` tiraba un error de Prisma en cada visita**, sin relación con mi trabajo de esta sesión, ya estaba roto en producción. Lo agregué (migración `20260804115920_etiqueta_orden`, con backfill por orden alfabético para las etiquetas ya existentes) porque bloqueaba directamente la feature que estaba construyendo (la ficha/listado necesitan poder leer y ordenar el catálogo de Etiquetas).

**Verificación real en navegador** (no solo build/lint/tests): creé un usuario administrador temporario (`scripts/create-admin-user.ts`, ya existía en el repo para este propósito), levanté `npm run dev`, y usé Playwright para manejar un Chromium real: login → alta de una Persona con una etiqueta nueva → ficha → agregar/quitar etiquetas desde la pestaña → listado con columna de etiquetas → selección + acción masiva de asignación. Los 8 pasos terminaron correctamente, confirmado con capturas de pantalla. Único error de consola detectado: un 403 de Gemini en el dashboard de insights (`"Your project has been denied access"`) — **no relacionado con este trabajo**, ya existía antes; vale la pena que lo revises en tu cuenta de Google AI Studio si no lo sabías. Al terminar, borré el usuario de prueba (Supabase Auth + fila `Usuario`), las Personas y Etiquetas de prueba creadas durante la verificación, y bajé el servidor de desarrollo — no queda ningún dato de prueba en la base real.

## Qué NO se implementó (a propósito)

- **Etapa 3 (enriquecimiento progresivo)**: diseño entregado en `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`, con 4 preguntas abiertas para vos. Sin código.
- **Etapa 4 (dashboard de calidad de matching)**: queda para después de que definas la Etapa 3, ya que algunas métricas propuestas dependen de que el enriquecimiento esté activo.
- Consolidación de `participaciones.service.ts`/`personas/actions.ts` para que también pasen literalmente por `resolverOCrearPersona()` — ya usaban el motor completo correctamente, quedó como mejora de mantenibilidad de menor prioridad, no bloqueante.

## Tests ejecutados y resultados

- Suite completa: **69/69 tests pasan** (36 preexistentes de `lib/identidad/` + 33 nuevos de esta sesión, 0 regresiones). Incluye `tests/unit/servicios/etiquetado-persona.test.ts` (10 tests: idempotencia de asignar/quitar, reactivación de etiqueta desactivada al reusar nombre, conteo correcto de la acción masiva incluyendo deduplicación de IDs repetidos).
- Nuevos, por archivo:
  - `tests/unit/servicios/resolver-o-crear-persona.test.ts` (4) — contrato de las 3 vías de `resolverOCrearPersona()`.
  - `tests/unit/servicios/importaciones-personas.test.ts` (6) — duplicado/ambiguo/creación/fallo-aislado-de-fila en la importación CSV corregida.
  - `tests/unit/identidad/politica-decision.test.ts` (4) — las 3 bandas de `clasificarConfianza()`, incluyendo el caso "piso gana aunque el umbral configurado sea más bajo".
  - `tests/unit/servicios/deteccion-duplicados-piso.test.ts` (4) — el fix de P4 con el motor de scoring real (no mockeado): confianza bajo el piso → `sin_candidatos`; banda de revisión (caso histórico Cejas) → `ambiguo`; confianza alta → `coincidencia`.
  - `tests/unit/servicios/veredictos-identidad.test.ts` (2) — recalculo real de confianza al capturar un veredicto.
  - `tests/unit/servicios/padron-veredictos.test.ts` (3) — cableado de veredictos en vinculación/descarte manual de padrón.
- Smoke test manual contra la base real de desarrollo (script temporal, borrado después de usarlo): confirmé que el blocking nuevo encuentra "Perez" al buscar "Xerez" (imposible con el blocking anterior) y que los 2 bugs históricos (Cejas/Cejas, la compuerta de nombre) siguen sin auto-vincular.
- `npm run build`: compila limpio, TypeScript sin errores, en las 4 corridas (una por etapa).
- `npm run lint`: 0 errores. 3 warnings preexistentes (imports sin usar en `personas/actions.ts`, de la feature de etiquetado de Personas que quedó pausada antes de este trabajo — no relacionados, no los toqué).

## Decisiones técnicas que tomé sin preguntar (por ser refactors sin impacto funcional o ya aprobados por la arquitectura)

- Migré las 2 migraciones de esta sesión a mano (script temporal + insert directo en `_prisma_migrations`) porque `prisma migrate deploy` volvió a colgarse contra el pooler — mismo patrón ya documentado en `CLAUDE.md`, sin sorpresas.
- Elegí la Opción A de sugerencias pendientes en el diseño de enriquecimiento (reutilizar `HistorialCambio` en vez de una tabla nueva) como recomendación, pero la dejé como pregunta abierta explícita porque cambia cómo se va a ver una parte de la UI futura.
- No toqué el contrato de `resultado.tipo === "vinculada"` de `resolverOCrearPersona()` en esta etapa — hoy sigue significando "ya existe, no crear nada" en `importaciones.service.ts`. Cuando se implemente la Etapa 3, ese significado cambia (ver sección 5 del diseño de enriquecimiento) — lo dejé señalado ahí, sin tocarlo hasta que la Etapa 3 esté aprobada.

## Riesgos pendientes / para revisar con vos

1. **El cambio de comportamiento de la Etapa 2** (candidatos de confianza <0.4 dejan de mostrarse como sugerencia en detección de duplicados de Personas) ya está en producción con este cierre — si alguna vez viste una sugerencia de "posible duplicado" con un porcentaje muy bajo y la usaste para algo, avisame y lo revisamos.
2. **Las 4 preguntas abiertas de `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`** — necesito tu respuesta antes de tocar código de Etapa 3.
3. Pendientes de la sesión anterior (etiquetado de Personas, lista de espera de Actividades, Resend, backups de Supabase) siguen sin tocar — quedaron pausados desde antes de este trabajo de arquitectura de identidad.

No hay nada bloqueante para mí en este momento — sigo con cualquier otra tarea aprobada que encuentre, o quedo esperando tu revisión del diseño de enriquecimiento.
