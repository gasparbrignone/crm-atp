Estamos desarrollando el CRM ATP (agrupación estudiantil, Facultad de Ciencias Médicas, UNR) en `c:\Users\gaspar\Desktop\crm atp`. Repo: https://github.com/gasparbrignone/crm-atp. Deploy en producción: https://crm-atp.vercel.app.

Leé primero `CLAUDE.md` en la raíz (constitución del proyecto, incluye el estado real de fase del proyecto en la sección 10 — **cambió hoy, ver más abajo**) y `20-roadmap.md`. También tenés memoria persistente entre sesiones (carpeta `memory/` del proyecto) — revisala, especialmente las entradas de hoy sobre el rediseño de identidad y el primer dato real cargado.

## Cambio de fase del proyecto (2026-08-04, importante, leer primero)

**Hoy se cargó el primer dato real de un tercero**: el padrón electoral real de Consejo Directivo de Medicina, 5356 personas reales (nombre y DNI reales, no datos de prueba). Por regla ya establecida en `CLAUDE.md` sección 10 (ahora actualizada para reflejarlo): **el checklist de seguridad de `16-seguridad.md` sección 13 (RLS real, MFA, backups verificados, revisión legal de punteo, rotación de credenciales, sin secretos en el repo, auditoría de punteo ajeno, revisión de términos de IA) pasó de "condición futura" a "restricción activa"**. Ninguno de los 8 ítems está resuelto todavía — es una prioridad real pendiente de que Gaspar decida cómo abordarla (implica trabajo legal/infraestructura, no solo código), no algo que una sesión nueva deba iniciar por su cuenta sin que él lo pida explícitamente.

## ⚠️ Nada de esta sesión está commiteado todavía

Toda la sesión del 2026-08-04 (ver detalle abajo) quedó en el working directory, sin commit. `git status` tiene ~30 archivos modificados/nuevos, incluidas 3 migraciones nuevas ya aplicadas a mano contra la base real (ver más abajo — el problema conocido de `prisma migrate deploy` colgándose contra el pooler volvió a pasar, se aplicaron con el script temporal ya documentado en este archivo). Antes de seguir trabajando, correr `git status` y `git diff --stat` para verlo completo, y probablemente conviene commitear (agrupado en 2-3 commits lógicos: rediseño de identidad, etiquetado de Personas, lectura determinística de padrón + botón de borrado) antes de seguir sumando cambios — preguntale a Gaspar si no está ya claro por contexto de la conversación.

## Qué se hizo en la sesión del 2026-08-04 (resumen — el detalle completo está en los informes listados abajo)

1. **Informe técnico exhaustivo** del motor de matching/identidad y carga de padrones, a pedido de Gaspar — `INFORME-MOTOR-MATCHING-Y-PADRONES-2026-08-04.md`.
2. **Propuesta de rediseño de identidad** ("de detección de duplicados a identidad canónica"), aprobada por Gaspar por etapas — `PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md`. Implementadas: Etapa 0 (blocking con `pg_trgm`, evidencia de origen en contactos), Etapa 1 (`resolverOCrearPersona()`, unifica los 3 caminos de importación de Personas), Etapa 2 (`lib/identidad/politica-decision.ts`, umbral de piso centralizado), Etapa 5 (`VeredictoIdentidad`, captura de veredictos humanos). **Etapa 3 (enriquecimiento progresivo) sigue sin implementar** — diseño completo en `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md`, con 4 preguntas abiertas esperando respuesta de Gaspar.
3. **Auditoría técnica completa** de lo anterior — `AUDITORIA-TECNICA-2026-08-04.md`. Encontró y corrigió 6 problemas reales (bug de fusión que no re-vinculaba etiquetas, 2 N+1 de performance, bug pre-existente de `Etiqueta` sin columna `orden`, duplicación de código, tests propios mal planteados). Dejó **1 limitación documentada sin corregir, pendiente de decisión de Gaspar**: apellidos compuestos con guion (`"Garcia-Lopez"` vs `"Garcia Lopez"`) no matchean como la misma persona por cómo tokeniza el motor — 3 opciones de fix presentadas, ninguna aplicada todavía.
4. **Etiquetado de Personas** completado de punta a punta (backend + UI: alta manual, ficha, listado con columna y acción masiva) — pendiente de una sesión anterior a esta.
5. **Reemplazo completo de Gemini por un parser determinístico** en la lectura de padrón PDF (`lib/padron/lectura-padron.ts`), a pedido explícito de Gaspar ("prescindamos de la IA cuando haya alternativas no-IA igual o más eficientes"), después de que el proyecto de Google AI Studio quedara bloqueado ("PERMISSION_DENIED") a mitad de una carga real — el tercer incidente real de disponibilidad de un proveedor de IA para este módulo. Validado contra el padrón real completo: **5356/5356 filas, 0 omitidas**. `lib/ia/lectura-padron-pdf.ts` fue eliminado.
6. **Botón de borrado de padrones** (solo en estado `borrador`, permiso `padron.gestionar`, excepción documentada al principio de "cero pérdida de datos" igual que RN-5) — en el listado (`/padron`) y en el detalle (`/padron/[id]`).

## Estado técnico verificado al cierre de esta sesión

- **110/110 tests pasan**, `npm run build` y `npm run lint` limpios (0 errores, 0 warnings).
- 3 migraciones nuevas aplicadas a mano contra la base real (mismo camino ya documentado más abajo para cuando `prisma migrate deploy` se cuelga): `20260804112004_persona_contacto_origen`, `20260804114616_veredicto_identidad`, `20260804115920_etiqueta_orden`. Verificado con `_prisma_migrations` que disco y base coinciden exactamente.
- Verificación real en navegador (Playwright, usuario de prueba creado y borrado) del flujo de etiquetado — ver `AUDITORIA-TECNICA-2026-08-04.md` y el informe de cierre anterior para el detalle.

## Decisiones pendientes de Gaspar (nuevas, de esta sesión)

1. Las 4 preguntas abiertas de `DISENO-POLITICA-ENRIQUECIMIENTO-2026-08-04.md` (política de survivorship para Etapa 3).
2. Qué hacer con la limitación de apellidos con guion (`AUDITORIA-TECNICA-2026-08-04.md` sección 3.1, 3 opciones presentadas).
3. Cómo y cuándo abordar el checklist de seguridad, ahora activo (ver arriba).
4. Si conviene commitear el trabajo de hoy antes de seguir.

## Pendientes de sesiones anteriores, todavía sin tocar

- Lista de espera de Actividades (indicador de excedente de cupo + notificación de cupo liberado).
- Activar el resumen de notificaciones por email (falta que Gaspar cree cuenta en Resend y cargue `RESEND_API_KEY`).
- Verificación del plan de backups de Supabase (ahora más urgente por el cambio de fase de arriba).

## Cómo trabajar (pedido directo de Gaspar, sigue vigente — reforzado esta sesión)

**Modo autónomo explícito**: no detener el avance para confirmaciones innecesarias — si una decisión ya fue aprobada por la arquitectura o es un refactor sin impacto funcional, tomarla y seguir sin preguntar. Interrumpir solo por: decisión de producto real, validación arquitectónica importante, o una acción que solo Gaspar puede hacer. Señal sonora pedida: 3 beeps con PowerShell (`[console]::beep(800,250)` en loop) cuando de verdad se necesita su intervención. Al terminar cada etapa de trabajo aprobada: correr toda la batería de tests, revisar que no haya regresiones, resolver problemas encontrados antes de avanzar, y entregar un informe breve. Si queda otra tarea aprobada para hacer sin su intervención, arrancarla sola sin esperar instrucción nueva.

Autonomía real: probar, medir y desplegar por cuenta propia (Vercel CLI ya autenticada y linkeada a `crm-atp/crm-atp`, conexión a la base real vía scripts en `scripts/`), sin pedir clicks manuales. Antes de cualquier escritura masiva contra la base real, o antes de un `git push` a `main`, el modo automático puede bloquear y pedir confirmación — normal, no un error.

**Verificar antes de asumir** (lección repetida varias veces en este proyecto): buscar en la fuente real (WebFetch a documentación oficial, benchmark propio, o una llamada real a la API/base) antes de configurar código en base a un número "que suena razonable". El motor de identidad y el reemplazo de Gemini por el parser determinístico de padrón son los ejemplos más recientes: en ambos casos se verificó contra datos/comportamiento real antes de decidir, no se asumió.

## Notas técnicas recurrentes

- **Prisma CLI cuelga con `DIRECT_URL`** (`migrate dev`/`migrate status`/`migrate deploy`) contra el pooler de Supabase — volvió a pasar 2 veces esta sesión. Camino alternativo probado: crear la carpeta de migración a mano (`prisma/migrations/<timestamp-UTC>_<nombre>/migration.sql`), aplicar con un script temporal que usa `prisma.$executeRawUnsafe()` sentencia por sentencia (array explícito, no parsear el .sql por `.split(";")`), más un `INSERT` manual en `_prisma_migrations` (checksum = SHA-256 del contenido del archivo), después `npx prisma generate`. Verificar con una consulta directa a `_prisma_migrations` comparando contra las carpetas en disco (no confiar en `prisma migrate status`, también se cuelga). Borrar el script temporal al terminar.
- **Scripts de prueba/debug**: en `scripts/`, correr con `node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/archivo.ts dotenv_config_path=.env.local`, y **borrar después** de usarlos (excepción: `scripts/benchmark-identidad.ts` es permanente). **Cuidado especial**: nunca dejar en `scripts/` (ni en ningún lado del repo) un volcado de datos reales de personas — pasó esta sesión (texto completo de un padrón real con nombres/DNI reales), se detectó y se borró antes de que quedara rastro en git, pero es un riesgo real a vigilar activamente de acá en adelante dado que ya hay datos reales de terceros en la base.
- CLI de Vercel autenticada. `npx vercel logs crm-atp.vercel.app` para errores reales. `npx vercel ls crm-atp` para el estado de los últimos deploys.
- `GEMINI_API_KEY`: el proyecto de Google AI Studio quedó bloqueado hoy ("PERMISSION_DENIED... contact support") — no es cuota, es un bloqueo de proyecto, necesita revisión de Gaspar en la consola de Google. La lectura de padrón ya no depende de esto (determinística desde hoy), pero el chatbot/insights y el matching semántico de carrera (último recurso) sí siguen usando Gemini y van a seguir fallando hasta que se resuelva.
- Tests: `npx vitest run`. Build completo antes de cualquier push: `npm run build`.
