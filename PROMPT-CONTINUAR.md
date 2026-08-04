Estamos desarrollando el CRM ATP (agrupación estudiantil, Facultad de Ciencias Médicas, UNR) en `c:\Users\gaspar\Desktop\crm atp`. Repo: https://github.com/gasparbrignone/crm-atp. Deploy en producción: https://crm-atp.vercel.app.

Leé primero `CLAUDE.md` en la raíz (constitución del proyecto) y `20-roadmap.md` para el estado de las fases. También tenés memoria persistente entre sesiones (carpeta `memory/` del proyecto) — ya tiene entradas sobre cómo trabaja Gaspar y lecciones de esta sesión, revisala.

## 🔴 Retomar esto primero

**Gaspar está en medio de cargar el padrón real de Consejo Directivo - Medicina** vía `/padron`. Hay un padrón en la base llamado **"CD FONO 2026"** (¡el nombre está mal, el archivo subido es el de Medicina! `id` real: buscar con `prisma.padronElectoral.findMany()`, va a aparecer con `archivoOrigenId` conteniendo "EM-06-03-26.pdf") que quedó a mitad de camino: **lote 1 de 14 procesado (53 entradas)**, lotes 2 a 14 todavía pendientes. La importación es incremental (un lote por vez, con barra de progreso) — es normal que haya que seguir apretando el botón o que el navegador reintente solo.

**Antes de asumir que algo está roto**: correr `prisma.padronElectoral.findMany({ include: { _count: { select: { entradas: true }}}})` para ver el estado real (`lotesProcesados`/`lotesTotales`), y revisar `npx vercel logs crm-atp.vercel.app` para el error real si algo falla — no asumir la causa sin mirar el log.

## Qué se rompió y arregló hoy (2026-08-02), en cadena — para no repetir los mismos errores

1. **Timeout de 300s en la importación de padrón**: la lectura de PDF + el matching corrían fila por fila en serie. Se paralelizó todo (`lib/ia/lectura-padron-pdf.ts`, `lib/servicios/padron.service.ts`) y se rediseñó como **procesamiento incremental por lote** (el cliente pide "el siguiente lote" repetidas veces — ver `ImportadorPadronPdf` y `procesarSiguienteLotePadronAction`), porque ninguna función serverless aguanta los varios minutos que puede tardar un padrón real completo.
2. **La cuenta de Anthropic se quedó sin saldo** en medio de una carga real ("credit balance is too low") → **se migró todo el proveedor de IA a Gemini** (Google AI Studio, gratis). Afecta `lib/ia/cliente-ia.ts` (nuevo, reemplaza a `cliente-anthropic.ts`) y los 4 archivos que llaman a IA: `lectura-padron-pdf.ts`, `matching-padron.ts`, `deteccion-duplicados.ts`, `normalizacion.ts`. Actualiza el supuesto S6 en `CLAUDE.md`/`01-vision-alcance.md`/`15-ia.md`/`03-arquitectura.md`/`16-seguridad.md`.
3. **Encadenado con la migración, varios bugs reales de la migración misma** (todos ya arreglados, ver commits del día — `git log --oneline` — para el detalle exacto de cada uno):
   - `gemini-2.5-flash`/`gemini-2.5-flash-lite` devuelven 404 para API keys nuevas ("no longer available to new users") → se usa `gemini-3.1-flash-lite`. **No asumir el nombre de modelo vigente de Gemini sin verificarlo contra la API real** (`client.models.list()`) — el catálogo cambia rápido.
   - Los modelos vigentes de Gemini "piensan" por defecto y esas "thoughts" salen del mismo presupuesto que `maxOutputTokens` → se desactiva siempre con `thinkingConfig: { thinkingBudget: 0 }` (constante `SIN_PENSAMIENTO` en `cliente-ia.ts`), porque ninguna tarea de este módulo necesita razonamiento profundo.
   - La cuota gratuita real de Gemini es **15 requests/minuto** para `gemini-3.1-flash-lite` (medido contra la cuenta real, no un valor de la documentación) → hay un limitador de tasa compartido en `cliente-ia.ts` (ventana deslizante) para todo el módulo de IA, no alcanza con bajar la concurrencia de un solo archivo.
   - El plan de Vercel es **Hobby (gratuito)**, no Pro — se asumió mal dos veces seguidas en direcciones opuestas (primero 800s de un supuesto plan Pro, después se sobrecorrigió a 60s). El número real confirmado contra la documentación oficial de Vercel: **300s de default y de máximo en Hobby con Fluid Compute**, no configurable más alto. Ver `export const maxDuration` en `app/(app)/padron/[id]/importar/page.tsx`.
   - El matching de padrón (`lib/ia/matching-padron.ts`) vinculaba automático por **nombres de pila compartidos** ignorando el apellido (ej. "Abraham, Ana Paula" vinculado a una "Ana Paula Ascúa" sin relación real, con confianza 0.95) — se corrigió para anclar la búsqueda de candidatos solo en apellido.
   - El mismo matching marcaba como "pendiente" (revisión manual) descartes donde la propia IA ya decía explícitamente "no es la misma persona" — según `09-modulo-padron-electoral.md` sección 5, eso debe ser `sin_coincidencia` directamente, sin revisión. Corregido.

**Riesgo de calidad conocido, sin solución de código todavía**: Gemini casi nunca reporta `confianzaExtraccion` por debajo de 1 (a diferencia de Claude), lo que debilita la red de seguridad de "marcar filas dudosas para revisión visual". También hubo al menos una alucinación puntual de nombre (letras duplicadas) en una fila real de padrón, ya corregida a mano en la base. Si aparecen más casos así, considerar si vale la pena un modelo más caro solo para esta tarea puntual (ya se probó `gemini-flash-latest` con razonamiento activado — mismo resultado, 3x más lento, no vale la pena).

## Fase 8 — IA: duplicados y normalización → **completa**

- Detección de duplicados (`buscarPersonaCoincidente`) ya conectada al alta manual desde `/personas/nueva` (`app/(app)/personas/actions.ts`): si hay candidato(s), se muestra la sugerencia antes de crear, con opciones "Es la misma persona" (→ fusión) / "Ninguna es la misma" (crea igual, registra el descarte en `HistorialCambio`).
- Flujo de fusión de duplicados completo: `fusionarPersonas()` en `lib/servicios/personas.service.ts` (aplica RN-2, incluyendo el manejo de colisiones cuando la definitiva y la descartada tienen `Participacion`/`PunteoPersona` para la misma Actividad/usuario — mismo criterio que RN-4). UI de comparación campo a campo en `app/(app)/personas/fusionar/[definitivaId]/[descartadaId]/`, accesible desde la sugerencia automática y también manualmente desde cualquier ficha (`BuscarDuplicadoFusion` en la pestaña "Datos generales").
- Pendiente, no bloqueante: el proceso periódico de fondo sobre toda la base (mencionado en el roadmap) no existe todavía — no hay infraestructura de cron en el proyecto.

## Fase 10 — Buscador global → construida

`Ctrl/Cmd+K` desde cualquier pantalla (`components/buscador/BuscadorGlobal.tsx`). Búsqueda difusa con `pg_trgm`/`unaccent` sobre Persona, Actividad y PadronEntrada (`lib/servicios/busqueda.service.ts`), migración de extensiones/índices GIN aplicada a mano (`prisma/migrations/20260802190000_buscador_trgm_unaccent/`, ver nota técnica de Prisma CLI abajo). El punteo queda deliberadamente fuera del índice.

## Historial de Persona → construido

La pestaña "Historial" de la ficha de Persona ya muestra una línea de tiempo real (`components/personas/HistorialPersona.tsx`) en vez del texto fijo que había antes. Nota: cada campo modificado en un guardado genera su propia fila de `HistorialCambio` (no un evento agrupado por operación, como describe `17-auditoria-historial.md` sección 8) — se muestran tal cual, sin reagrupar.

## Fase 9 — Chatbot e insights de IA → **bloqueada, a propósito**

El roadmap la bloquea explícitamente hasta que el checklist legal del módulo de Punteo (sección 10 de `08-modulo-punteo-electoral.md`) se revise con ATP — riesgo de fuga de datos si se construye antes. Es un paso humano, no de código. El módulo de Punteo en sí (Fase 5) ya está construido (`lib/servicios/punteo.service.ts`, con el modelo de privacidad de dos capas y auditoría de acceso ajeno), solo falta esa revisión legal para considerar la fase cerrada.

## Cómo trabajar de ahora en más (pedido directo de Gaspar)

Autonomía real: probar, medir y desplegar por cuenta propia (Vercel CLI, conexión a la base real), sin pedir clicks manuales — reservar las preguntas para decisiones de producto/alcance no resueltas en la documentación, con opciones concretas y una recomendación. Beep (`[console]::beep(800,250)` en loop) solo cuando de verdad está bloqueado esperando una decisión suya, no para avisos rutinarios.

**Antes de cualquier escritura masiva contra la base de producción real**, el modo automático bloquea y pide confirmación — normal, no un error.

**Verificar antes de asumir** (la lección más cara de hoy): límites de duración de función, nombres de modelos de IA vigentes, límites de rate — buscarlos en la fuente real (WebFetch a documentación oficial, o una llamada real a la API) antes de configurar código en base a un número "que suena razonable". Ver memoria `feedback-verificar-antes-de-asumir`.

## Notas técnicas recurrentes

- **Prisma CLI cuelga con `DIRECT_URL`** (`migrate dev`/`migrate status`/`migrate deploy`, puerto 5432). Camino alternativo probado varias veces: crear la carpeta de migración a mano (`prisma/migrations/<timestamp-UTC>_<nombre>/migration.sql`), aplicar con un script temporal que usa `prisma.$executeRawUnsafe()` **statement por statement, listados explícitos en un array (NO parsear el archivo .sql por `.split(";")`, rompe con statements que tienen comentarios `--` antes)**, más un `INSERT` manual en `_prisma_migrations` (checksum = SHA-256 del contenido del archivo), después `npx prisma generate`. Borrar el script temporal al terminar.
- **Scripts de prueba/debug**: en `scripts/`, correr con `node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/archivo.ts dotenv_config_path=.env.local`, y **borrar después** de usarlos.
- CLI de Vercel autenticada y linkeada (`crm-atp/crm-atp`). `npx vercel logs crm-atp.vercel.app` para errores reales — pero el comando **no hace streaming en vivo real**, devuelve un snapshot reciente cada vez que se lo llama (hay que volver a invocarlo, no confiar en que un solo Monitor lo va a seguir capturando eventos nuevos indefinidamente).
- `GEMINI_API_KEY` ya cargada en `.env.local` y en Vercel (production/preview/development).

## Qué hacer al retomar, en orden

1. Confirmar el estado real del padrón en curso (`lotesProcesados`/`lotesTotales` del padrón "CD FONO 2026" con el PDF de Medicina) antes de asumir nada — seguir la carga incremental hasta que Gaspar la termine.
2. Una vez completa la lectura, dejarlo revisar el matching en `/padron/[id]` antes de activar.
3. Si aparecen más vínculos automáticos raros o más entradas "pendiente" sin sentido, diagnosticar con datos reales antes de parchear (ya se corrigieron dos bugs de este tipo hoy).
4. Fases con trabajo pendiente real: Fase 11 (Notificaciones) y Fase 12 (Auditoría global/exportaciones/configuración avanzada) no están construidas todavía — candidatas naturales para seguir si no hay nada más urgente.
