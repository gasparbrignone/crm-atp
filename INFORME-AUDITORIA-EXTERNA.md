# Informe para auditoría externa — CRM ATP

**Fecha del informe:** 3 de agosto de 2026
**Propósito:** este documento está pensado para pegarse en una conversación con otro modelo de IA (ChatGPT u otro) para que audite el estado del proyecto de forma independiente y sugiera mejoras, riesgos no vistos, o correcciones de rumbo. Contiene todo el contexto necesario para que alguien sin acceso al repo pueda opinar con criterio.

---

## 1. Qué es el proyecto

CRM inteligente a medida para **ATP**, una agrupación estudiantil de la Facultad de Ciencias Médicas (Universidad Nacional de Rosario, Argentina). Centraliza personas (estudiantes con los que la agrupación tiene contacto), actividades (charlas, simulacros, jornadas) y participación en ellas, punteo electoral (seguimiento de afinidad política — dato sensible bajo ley argentina de protección de datos) y cruce contra padrones electorales oficiales de la facultad.

El dueño del producto (Gaspar) **no es programador**. Todo el desarrollo se hizo con Claude Code, a partir de 21 documentos de especificación funcional/técnica ya escritos y aprobados antes de que existiera una línea de código.

## 2. Stack técnico

- **Next.js 16** (App Router), React 19, TypeScript estricto
- **Tailwind CSS v4**
- **Prisma 6** como ORM, **PostgreSQL** vía **Supabase** (Auth + DB + Storage)
- **IA**: API de Gemini (Google AI Studio), modelo `gemini-3.1-flash-lite`, invocada siempre desde el servidor. Migrado desde Anthropic/Claude el 2026-08-02 (la cuenta de Anthropic se quedó sin saldo en medio de la carga real de un padrón)
- **Vercel** (plan Hobby/gratuito, 300s de duración máxima de función) para hosting, deploy automático desde `main`
- Repo en GitHub, sin CI configurado (el control de calidad antes de cada deploy lo hace la sesión de Claude Code manualmente: build, lint, typecheck)

## 3. Estado del roadmap (14 fases planeadas, numeradas 0-13)

| Fase | Estado |
|---|---|
| 0 — Fundaciones | ✅ En producción |
| 1 — CRM de Personas | ✅ En producción |
| 2 — Actividades y Participaciones | ✅ En producción |
| 3 — Dashboards v1 | ✅ En producción |
| 4 — Usuarios y permisos completo | ✅ En producción |
| 5 — Punteo electoral y comentarios | ✅ En producción (checklist legal de la sección 10 revisado y confirmado por ATP el 2026-08-03) |
| 6 — Padrón electoral | ✅ En producción (carga vía CSV y lectura nativa de PDF por IA) |
| 7 — Importaciones avanzadas | ✅ En producción |
| 8 — IA: duplicados y normalización | ✅ En producción |
| 9 — Chatbot e insights de IA | ✅ En producción (recién destrabada 2026-08-03 junto con el checklist legal de Punteo) |
| 10 — Buscador global | ✅ En producción (pg_trgm + unaccent) |
| 11 — Notificaciones | ⬜ No iniciada |
| 12 — Auditoría, exportaciones y configuración avanzada | ⬜ No iniciada (existe historial básico por entidad, pero no exportaciones ni configuración avanzada) |
| 13 — Hardening final | ⬜ No iniciada |

Además, fuera del roadmap numerado: historial de Persona con línea de tiempo real (antes era un texto fijo sin datos).

**Estado de datos real al momento de este informe**: un padrón real de la facultad (Medicina, mal etiquetado en el sistema como "CD FONO 2026" por un error de tipeo humano al crearlo) está siendo cargado de forma incremental por lotes — 2 de 14 lotes procesados, ~930 entradas, todavía en estado `borrador` (no activado). Ya hay personas reales cargadas en producción (nombre, DNI).

## 4. Arquitectura de IA — detalle relevante para la auditoría

Todas las funciones de IA (detección de duplicados, normalización de carrera, lectura de padrones en PDF, matching de padrón, chatbot, insights de dashboard) pasan por una única puerta de entrada (`lib/ia/cliente-ia.ts`) y usan siempre el mismo modelo barato (`gemini-3.1-flash-lite`, thinking desactivado). Nunca generan SQL libre: son siempre funciones de solo lectura acotadas con parámetros tipados, o clasificaciones sobre un conjunto pequeño y ya filtrado de candidatos.

**Límites reales medidos contra la cuenta real (no supuestos de documentación):**
- 15 requests/minuto en la cuota gratuita para este modelo (el código se autolimita a 12/min).
- Cuota diaria gratuita: existe y se agotó realmente durante el uso normal de hoy (número exacto no confirmado, Google no lo publica en la documentación pública — solo se ve en el panel de la cuenta). Al agotarse, el sistema deja de poder usar IA hasta la medianoche (huso horario del proyecto de Google) o hasta que se vincule una cuenta de facturación (decisión pendiente de Gaspar, no tomada todavía).

## 5. Auditoría profunda realizada hoy (2026-08-03) — hallazgos y fixes

A pedido explícito de Gaspar ("no puedo permitir gastar en API sin que funcione, como pasó con Claude"), se hizo una revisión exhaustiva de todo el código relacionado a IA, buscando específicamente: fallos que no se manejan bien, uso de cuota que no rinde, y errores reales de lógica.

### 5.1 — Corregido: un fallo de IA podía tirar abajo un lote de padrón entero

`padron.service.ts` resolvía el matching de todas las filas de un lote en paralelo (10 workers) con `Promise.all`, sin try/catch por fila. Si UNA fila fallaba (ej. por un error transitorio, o por la cuota agotada a mitad de lote), se rechazaba el `Promise.all` completo y se perdían los resultados YA resueltos de las demás filas — sin persistir nada y sin avanzar el contador de lotes. El reintento del usuario volvía a gastar cuota real re-resolviendo filas que ya se habían resuelto bien la vez anterior. **Corregido**: una fila que falla queda omitida con el motivo del error, sin tirar abajo el resto del lote.

### 5.2 — Corregido: una importación CSV de personas podía quedar colgada para siempre

En `importaciones.service.ts`, la resolución de carrera por IA (para variantes de escritura tipo "Enfermeria"/"ENF") no tenía try/catch dentro del loop de filas. Si fallaba, todo el `for` se abortaba **antes** de llegar al `prisma.importJob.update()` final — el `ImportJob` quedaba en estado "procesando" para siempre, sin ningún mensaje de error, con las filas ya creadas antes del fallo sin ningún reporte de cierre. **Corregido**: la fila sigue sin carrera asignada (recuperable a mano después) en vez de perder el reporte de toda la importación.

### 5.3 — Corregido: crear una persona nueva podía romperse por completo si la IA fallaba

En el alta manual de personas (`app/(app)/personas/actions.ts`), la detección de duplicados por IA no tenía try/catch — si fallaba, toda la Server Action tiraba un error crudo al usuario (probablemente la causa de un error genérico de "Server Components render" que Gaspar había reportado antes, sin poder reproducirlo). Esto contradice una regla explícita del proyecto ("los errores no controlados se traducen a un mensaje entendible"). **Corregido**: si la detección de duplicados falla, se sigue de largo sin la sugerencia (la IA asiste, no bloquea) en vez de impedir directamente dar de alta una persona.

### 5.4 — Corregido: un mensaje del chatbot podía quedar sin respuesta para siempre

En `chatbot.service.ts`, el mensaje del usuario se guardaba en la base ANTES de llamar a la IA. Si la llamada a la IA fallaba, la excepción se propagaba sin capturar — la pregunta del usuario quedaba huérfana en el historial (sin respuesta, pero contando igual para el límite de mensajes de la conversación) y el usuario veía un error crudo. **Corregido**: un fallo de la IA ahora se guarda como una respuesta del asistente explicando el problema, como cualquier otro turno normal.

### 5.5 — Agregado: fallar rápido ante cuota diaria agotada (en vez de reintentar a ciegas)

El cliente de IA reintentaba automáticamente ante cualquier error 429, sin distinguir "cuota por minuto" (se resuelve sola en segundos) de "cuota diaria" (no se resuelve hasta el día siguiente, reintentar no sirve de nada). Esto hacía perder tiempo real reintentando varias veces algo que no podía funcionar. **Agregado**: se detecta el tipo de cuota agotada real que reporta Google y, si es diaria, se falla inmediato con un mensaje explicando cuándo va a volver a funcionar.

### 5.6 — Bug de correctitud real y grave: vínculos automáticos de padrón evidentemente erróneos

Reportado por Gaspar en vivo, con capturas de pantalla reales: el matching automático de padrón vinculaba personas con **nombres de pila completamente distintos** solo porque compartían apellido (ej. "Barroso, Constanza" vinculada automático a "cindy barroso"; "Cejas, Agustina" Y "Cejas, Damaris" — dos personas distintas del padrón — vinculadas ambas, automático, a la misma "Candela Cejas" ya cargada).

**Causa raíz, confirmada con datos reales de producción**: el modelo de IA usado para esta tarea (barato, sin razonamiento) no es confiable calibrando un número de confianza para el caso "el apellido coincide pero el nombre de pila no tiene nada que ver". Prueba directa: la misma fila de padrón, procesada dos veces por la IA en momentos distintos, dio 60% de confianza una vez (rechazada correctamente, a revisión manual) y 85% la otra vez (vinculada automático, mal) — exactamente la misma comparación, dos resultados contradictorios. El umbral de confianza configurado no alcanza a filtrar esto porque el problema no es *dónde* está el umbral, sino que el número que devuelve la IA para este caso puntual no es estable.

**Fix aplicado**: se agregó una verificación determinística en código (no depende de la IA) — si el nombre de pila de la entrada del padrón no comparte ningún token real con el de la persona candidata, se fuerza revisión humana sin importar qué confianza haya reportado la IA. Con esa misma regla (sin gastar cuota de IA), se revisaron los 15 vínculos automáticos ya cargados en la base: **13 eran incorrectos** (se bajaron a revisión manual) y 2 eran correctos (se mantuvieron). El padrón afectado sigue en estado `borrador` (no activado), así que esto nunca llegó a afectar el estado real de habilitación de ninguna persona en producción.

**Pendiente, no urgente**: 28 entradas del mismo padrón, en estado "pendiente" de revisión manual, tienen listas de candidatos sugeridos calculadas por una versión de código *anterior* a un fix del 2026-08-02 (que corrigió cómo se buscan candidatos) — esas sugerencias no son confiables, aunque no son peligrosas porque un humano las revisa una por una antes de aceptar cualquiera. Conviene recalcularlas, pero requiere cuota de IA (agotada por hoy).

### 5.7 — Verificado, sin bugs

Se revisaron también sin encontrar problemas: el limitador de tasa compartido (`cliente-ia.ts`), la lectura de PDF de padrones (`lectura-padron-pdf.ts`), la detección de duplicados de personas (`deteccion-duplicados.ts`), todas las herramientas del chatbot (permisos, defensa en profundidad, formas de retorno), y el cacheo de insights del dashboard (se confirmó contra la documentación oficial de Next.js que `unstable_cache` sí incluye los argumentos de la llamada en la clave de caché, no solo las keyParts explícitas — no era un bug).

## 6. Riesgos conocidos, sin resolver todavía

- **El limitador de tasa de Gemini es por instancia de proceso, no global de verdad.** En un entorno serverless (Vercel), dos invocaciones concurrentes de la función pueden correr en instancias distintas, cada una con su propio contador en memoria — el límite de 12/min es "mejor esfuerzo" dentro de una instancia, no una garantía dura contra todo el tráfico real simultáneo. No se ha medido si esto causó algún 429 real en producción.
- **El modelo barato de IA (`gemini-3.1-flash-lite`, sin razonamiento) no es consistentemente confiable** para juicios de similitud de nombres con matices (visto en el bug de la sección 5.6). Se mitigó con una regla determinística en código para el caso de padrón, pero el mismo patrón de riesgo (confianza numérica no estable) podría existir en la detección de duplicados de personas (`deteccion-duplicados.ts`) o en la resolución semántica de carrera (`normalizacion.ts`), que usan el mismo modelo para tareas de juicio similares — no se ha hecho la misma prueba de estabilidad (misma entrada, múltiples llamadas) sobre esos otros módulos todavía.
- **RLS de Postgres no se aplica en la práctica** (hallazgo de una auditoría anterior, sigue sin resolver): Prisma se conecta con un rol que tiene `BYPASSRLS`, así que toda la autorización real depende de la capa de aplicación, no de las políticas de RLS creadas en la Fase 0.
- **No hay entorno de Supabase separado para desarrollo/producción** — mismo proyecto único, con datos reales ya cargados.
- **No hay tests automatizados persistentes** en el repo, ni CI/CD.
- **La cuota diaria real de Gemini free tier no está confirmada con un número exacto** (Google no la publica; solo se ve en el panel de la cuenta) — hoy se agotó en el medio de un uso que no pareció excesivo (una sesión de trabajo normal), lo cual sugiere que el número real podría ser más bajo de lo esperado para el uso real del proyecto a medida que crezca.

## 7. Preguntas abiertas para la auditoría externa

1. Dado que ya se encontró un patrón real de confianza numérica no estable en un modelo de IA barato sin razonamiento, ¿qué otras heurísticas de este proyecto (duplicados de personas, resolución de carrera) deberían llevar el mismo tipo de verificación determinística de respaldo en vez de confiar en el número solo, antes de que aparezca el mismo tipo de bug ahí?
2. ¿Vale la pena, dado el volumn real y bajo costo (centavos/mes estimados), vincular facturación en Google AI Studio ahora para tener un límite de cuota más predecible, en vez de operar contra un límite gratuito no documentado que ya se agotó una vez en una sesión de trabajo normal?
3. ¿Es razonable seguir posponiendo el hardening de RLS (Fase 13) dado que ya hay datos reales de personas y ahora también de padrón electoral cargados en producción?
4. ¿Hay un enfoque mejor que un limitador de tasa en memoria de proceso para un entorno serverless con múltiples instancias concurrentes, sin necesariamente sumar infraestructura paga (ej. Redis)?
5. Cualquier señal de alarma en el patrón general encontrado hoy (funciones de IA que fallan de forma no manejada y corrompen el estado de un proceso más grande) que sugiera revisar otras partes del código no cubiertas en esta auditoría.

---

### Documentos de referencia (no incluidos en este informe, viven en el repo)

`CLAUDE.md` (constitución técnica del proyecto) y los 21 documentos funcionales `00-README.md` a `20-roadmap.md` en la raíz del repositorio.
