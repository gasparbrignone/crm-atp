Estamos desarrollando el CRM ATP (agrupación estudiantil, Facultad de Ciencias Médicas, UNR) en `c:\Users\gaspar\Desktop\crm atp`. Repo: https://github.com/gasparbrignone/crm-atp. Deploy en producción: https://crm-atp.vercel.app.

Leé primero `CLAUDE.md` en la raíz (constitución del proyecto, incluye el estado real de fase del proyecto en la sección 10) y `20-roadmap.md` para el estado de las fases. También tenés memoria persistente entre sesiones (carpeta `memory/` del proyecto) — revisala, tiene entradas sobre cómo trabaja Gaspar y lecciones de sesiones anteriores.

## Estado del proyecto (actualizado 2026-08-04, cierre de sesión)

**No está en producción real todavía** — el único dato personal cargado es el de Gaspar, para pruebas (ver `CLAUDE.md` sección 10 y `REVISION-CRITICA-AUDITORIA-2026-08-04.md` sección 0). Esto importa para calibrar cuánto peso darle a los checklists de seguridad/legal: son condición de salida de esta etapa, no una restricción activa sobre el ritmo de desarrollo hoy.

**Fases del roadmap**: 0 a 12 completas y deployadas. Fase 13 (Hardening final: RLS real, MFA, rotación de credenciales, separación dev/prod, simulacro de backup) deliberadamente diferida — no antes de cargar el primer dato real de un tercero, y no antes de que el esquema deje de cambiar tan seguido.

## Qué se hizo en la última sesión (2026-08-04) — leer antes de asumir nada

Documento completo con el detalle y el razonamiento: `INFORME-SESION-2026-08-04.md` (resumen ejecutivo + técnico + decisiones pendientes) y `REVISION-CRITICA-AUDITORIA-2026-08-04.md` (revisión punto por punto de una auditoría anterior, con acuerdos y desacuerdos fundamentados).

1. **Motor de Resolución de Identidad** (`lib/identidad/`, ver su `README.md`): reemplazó por completo a Gemini en la comparación de nombres de persona (detección de duplicados en `lib/ia/deteccion-duplicados.ts`, matching de padrón en `lib/ia/matching-padron.ts`). Determinístico, benchmarkeado (`lib/identidad/BENCHMARK-RESULTADOS.md`, corpus sintético de 365 casos), con tests de regresión (`tests/unit/identidad/`, 36 tests, correr con `npx vitest run`). `umbral_confianza_duplicados` recalibrado de 0.7 a 0.65 (escala nueva, no comparable con la anterior) — ya actualizado en la base real, no solo en el seed.
2. **Fase 11 (Notificaciones)** y **Fase 12 (Auditoría global, Exportaciones, Configuración avanzada)** construidas completas — rutas `/notificaciones`, `/perfil`, `/auditoria`, `/exportar`, `/configuracion`.
3. Chatbot ahora muestra un desplegable "Ver de dónde salió esto" con las herramientas/consultas reales usadas (dato que ya se guardaba desde Fase 9 y nunca se leía).
4. Dashboard admin: tarjetas de "salud de datos" nuevas (personas sin contacto, entradas de padrón pendientes, importaciones sin terminar).
5. Log estructurado de uso de IA en `lib/ia/cliente-ia.ts` (grepeable en `vercel logs`, formato `[ia-uso]`).
6. Primera suite de tests automatizados del proyecto (`vitest`, ver `vitest.config.mts`).

## Pendientes reales, documentados explícitamente en el código funcional (no asumir que están hechos)

- **Etiquetado de Personas**: el catálogo `Etiqueta` y su gestión centralizada (crear/editar/desactivar/fusionar) ya están en `/configuracion`, pero **no existe ninguna UI para asignar una etiqueta desde la ficha o el listado de una Persona** — ver nota en `05-modulo-personas.md` sección 7.
- **Lista de espera de Actividades**: ni el indicador visual de "excedente de cupo" ni la notificación de "se liberó un cupo" están construidos — ver nota en `07-modulo-participaciones.md` sección 3.3. No es un gap de modelo de datos (el diseño ya evita a propósito un estado nuevo en `EstadoParticipacion`), es un gap de UI/lógica.
- **Excel real (.xlsx)** en exportaciones: hoy `/exportar` solo genera CSV (decisión documentada, no un olvido — ver `lib/utils/csv-export.ts`).
- **Resend (resumen de notificaciones por email)**: código completo pero inactivo — falta que Gaspar cree una cuenta en resend.com y cargue `RESEND_API_KEY` en Vercel. Sin eso, el cron diario (`app/api/cron/notificaciones-periodicas/`) corre igual pero el paso de email es un no-op silencioso.
- **Verificación del plan de backups de Supabase**: pendiente, necesita acceso al panel de Supabase (no verificable desde la CLI de la base). Pedido explícito a Gaspar en el informe de cierre.

## Decisiones pendientes de Gaspar (ver `INFORME-SESION-2026-08-04.md` para el detalle completo)

1. ¿Construir etiquetado de Personas y/o lista de espera ahora, o quedan documentadas como pendientes por más tiempo?
2. ¿Activar el resumen de notificaciones por email (crear cuenta Resend)?
3. Verificar plan de backups de Supabase.

Si Gaspar no dio indicación sobre estas 3, preguntarle antes de asumir una — son decisiones de producto/alcance, no técnicas.

## Cómo trabajar (pedido directo de Gaspar, sigue vigente)

Autonomía real: probar, medir y desplegar por cuenta propia (Vercel CLI ya autenticada y linkeada a `crm-atp/crm-atp`, conexión a la base real vía scripts en `scripts/`), sin pedir clicks manuales — reservar las preguntas para decisiones de producto/alcance no resueltas en la documentación, con opciones concretas y una recomendación.

**Antes de cualquier escritura masiva contra la base real, o antes de un `git push` a `main`** (dispara deploy automático a producción), el modo automático puede bloquear y pedir confirmación — normal, no un error. Push a producción está confirmado como aceptable para trabajo verificado (build+lint+test completos) — no es necesario re-preguntar cada vez, salvo cambios que toquen lógica de negocio crítica (matching, permisos, punteo) donde vale la pena avisar igual.

**Verificar antes de asumir** (lección repetida varias veces en este proyecto — límites de duración de función, nombres de modelos de IA vigentes, límites de rate, algoritmos de similitud): buscar en la fuente real (WebFetch a documentación oficial, benchmark propio, o una llamada real a la API) antes de configurar código en base a un número "que suena razonable". Ver memoria `feedback-verificar-antes-de-asumir`. El motor de identidad de esta sesión es el ejemplo más reciente: se armó un benchmark real en vez de elegir pesos a mano, y encontró 2 errores de diseño reales antes de integrarlos.

## Notas técnicas recurrentes

- **Prisma CLI cuelga con `DIRECT_URL`** (`migrate dev`/`migrate status`/`migrate deploy`) y falla con "prepared statement already exists" contra el pooler (`DATABASE_URL`, puerto 6543). Camino alternativo probado varias veces: crear la carpeta de migración a mano (`prisma/migrations/<timestamp-UTC>_<nombre>/migration.sql`), aplicar con un script temporal que usa `prisma.$executeRawUnsafe()` statement por statement (array explícito, no parsear el .sql por `.split(";")`), más un `INSERT` manual en `_prisma_migrations` (checksum = SHA-256 del contenido del archivo), después `npx prisma generate`. Borrar el script temporal al terminar.
- **Scripts de prueba/debug**: en `scripts/`, correr con `node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/archivo.ts dotenv_config_path=.env.local`, y **borrar después** de usarlos (excepción: `scripts/benchmark-identidad.ts` es permanente, se corre a mano cada vez que se toca `lib/identidad/algoritmos.ts` o `motor-scoring.ts`).
- CLI de Vercel autenticada. `npx vercel logs crm-atp.vercel.app` para errores reales (no hace streaming en vivo real, hay que reinvocarlo). `npx vercel ls crm-atp` para ver el estado de los últimos deploys.
- `GEMINI_API_KEY` cargada en `.env.local` y Vercel. Modelo vigente: `gemini-3.1-flash-lite` (ver `lib/ia/cliente-ia.ts` — no asumir el nombre sin verificar, el catálogo de Google cambia rápido).
- Tests: `npx vitest run`. Build completo antes de cualquier push: `npm run build` (corre typecheck real de Next.js, más estricto que `tsc --noEmit` solo).
