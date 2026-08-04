# Revisión crítica de la auditoría externa — CRM ATP

**Fecha:** 4 de agosto de 2026
**Rol de quien escribe:** Tech Lead / Arquitecto / Product Owner técnico de la sesión.
**Propósito:** evaluar con criterio de ingeniería, no de complacencia, las observaciones de `INFORME-AUDITORIA-EXTERNA.md` (2026-08-03) y las preguntas nuevas planteadas por Gaspar el 2026-08-04. Cada punto se resolvió leyendo el código real involucrado, no por intuición — se cita archivo y línea donde corresponde.

---

## 0. Las dos aclaraciones cambian la prioridad de todo lo demás

Antes de entrar a los 9 puntos, dos correcciones de contexto que **sí tienen efecto real sobre las decisiones de abajo**, no son solo un disclaimer:

### 0.1 — El sistema no está en producción real todavía

Esto no es un matiz menor. Cambia el cálculo de costo/beneficio de varias recomendaciones de la auditoría original, que fue escrita (por mí, en una sesión anterior) con un tono de urgencia operativa que no corresponde a la etapa real del proyecto. Ejemplo concreto y honesto: **en esta misma sesión, antes de que llegara esta aclaración, apliqué una migración de esquema (aditiva, reversible, sin tocar datos) tratando la base como si fuera de producción real** — con el cuidado correspondiente a datos reales de terceros que, según esta aclaración, todavía no existen. No fue un error grave (la migración era segura), pero es evidencia de que el tono "esto ya es sensible" se filtra en el juicio de ingeniería más de lo que debería en esta etapa. La sección 13 del roadmap (`20-roadmap.md`) ya modela esto correctamente — Fase 13 (Hardening) es explícitamente "antes de operar con datos reales" —, así que el error no es del roadmap, es de cuánto peso le di informalmente a un checklist pensado para una etapa posterior.

**Efecto en este documento**: RLS real, MFA, rotación de credenciales, separación dev/prod y simulacro de backup pasan de "hacer ya" a "confirmado: esperar a Fase 13, y no antes". No porque no importen, sino porque construir esa infraestructura ahora, sobre un esquema que todavía cambia semana a semana, es trabajo que probablemente se reharía.

### 0.2 — El marco legal (Ley 25.326) no debería frenar la construcción, pero sigue siendo real

Acá hay que ser precisos, porque "es un CRM privado, no un SaaS público" es un argumento que suena razonable pero es **legalmente insuficiente**: la Ley 25.326 no distingue por modelo de negocio ni por si el sistema es público o interno — aplica por el hecho de procesar datos personales de personas físicas en Argentina, y el punteo político cae en la categoría de "datos sensibles" (Art. 2°) sin importar cuán chico o privado sea el sistema que los guarda. La excepción del Art. 7° para organizaciones políticas que lleven un registro de sus propios afiliados/militantes (que es la que cita `16-seguridad.md` sección 5) es real, pero es una excepción **acotada** — no un argumento para restar importancia general al tratamiento del dato.

Dicho esto, **estoy de acuerdo con la preocupación de fondo**: el problema no es que la ley esté mencionada, es que el diseño no distingue entre "esto importa antes de tener datos reales de terceros" y "esto importa siempre". Ahora mismo `CLAUDE.md` sección 7 y `16-seguridad.md` no tienen ningún marcador de "estado actual: construcción, sin datos reales de terceros cargados todavía" — cualquier sesión nueva (incluida esta) lee el documento y asume que el checklist legal aplica *ya*, aunque el roadmap diga lo contrario en otro lado.

**Decisión propuesta**: no tocar el contenido legal de `16-seguridad.md` ni `08-modulo-punteo-electoral.md` sección 10 (siguen siendo correctos y van a hacer falta tal cual antes de cargar datos reales). Sí agregar una línea explícita en `CLAUDE.md` sección 10 ("Entornos") y al principio de `16-seguridad.md`: **"Estado actual: fase de construcción, sin datos reales de terceros — el checklist de la sección 13 es la condición de salida de esta etapa, no una restricción activa hoy."** Esto es документación, no una reinterpretación de la ley — la ley sigue aplicando igual el día que se cargue el primer dato real, que es exactamente lo que el roadmap ya asume.

**Prioridad**: alta pero de costo casi nulo (dos párrafos de documentación). Lo hago yo mismo al cierre de esta sesión.

---

## 1. Uso de IA — evaluación módulo por módulo

Leí el código real de los 8 módulos. Resultado: **el proyecto ya aplica el principio propuesto en la mayoría de los casos** (algo que la auditoría original no reconoció con suficiente claridad), pero hay dos lugares donde debería aplicarse *más*, no donde falta aplicarlo por primera vez.

| Módulo | Estado actual | ¿Es el uso correcto de IA? |
|---|---|---|
| `normalizarNombrePropio`, `normalizarTelefono`, `normalizarEmail` (`lib/ia/normalizacion.ts`) | 100% determinístico, cero llamadas a IA a pesar de vivir en `lib/ia/` | Sí — ya cumple el principio |
| `resolverCarreraSemantica` (misma carpeta) | Determinístico primero (exacto, luego substring) — IA solo si ninguno matchea | Casi correcto — ver mejora abajo |
| Detección de duplicados de personas (`deteccion-duplicados.ts`) | DNI/teléfono exacto determinístico; nombre difuso vía IA + backstop determinístico (`compartenNombre`) agregado el 2026-08-04 tras el bug del padrón | Discutible — ver recomendación fuerte abajo |
| Matching de padrón (`matching-padron.ts`) | Mismo patrón: DNI exacto determinístico, nombre difuso vía IA + backstop (`compartenNombreDePila`) | Mismo caso, con más riesgo real (define quién vota) |
| Lectura de padrón en PDF (`lectura-padron-pdf.ts`) | Siempre IA (extracción con Gemini) | Correcto, con una mejora de eficiencia posible |
| Chatbot (`lib/ia/chatbot.ts`) | Siempre IA (tool-use conversacional) | Correcto, no hay alternativa determinística razonable |
| Insights del dashboard (`lib/ia/insights.ts`) | Siempre IA (redacción de 1-3 observaciones sobre agregados) | El uso de menor valor real del sistema — ver abajo |

### 1.1 — El principio propuesto ("nunca IA si un algoritmo clásico resuelve igual o mejor") es correcto, pero lo reformularía

Tal como está escrito, el principio es defendible pero demasiado estricto en un punto: exige que el algoritmo clásico resuelva "igual o mejor calidad", lo cual en teoría podría justificar seguir usando IA en cualquier caso donde sea *apenas* mejor, aunque el costo/riesgo sea mucho mayor. Dado el historial real de este proyecto (cuota de Anthropic agotada en medio de una carga real, cuota diaria de Gemini agotada en una sesión de trabajo normal, y **dos bugs de producción distintos** causados por confianza numérica no estable del mismo modelo liviano — ver `matching-padron.ts` líneas 82-99 y `deteccion-duplicados.ts` líneas 146-156), la calidad "un poco mejor" de la IA en tareas de comparación de strings no compensa el riesgo real y medido de inestabilidad. Reformulación propuesta:

> **Preferir un algoritmo determinístico siempre que la tarea sea estructuralmente bien definida (matching exacto, similitud de strings, generación por plantilla), reservando la IA para tareas que requieren juicio semántico o de layout que no se puede reducir a una regla fija (lectura de PDF con formato irregular, conversación en lenguaje natural).**

Esto es más estricto que la propuesta original, no más laxo — y está respaldado por bugs reales, no por preferencia teórica.

### 1.2 — Recomendación fuerte, no en la auditoría original: reemplazar la IA por similitud determinística en la comparación de nombres (duplicados de personas y matching de padrón)

Este es el punto donde más difiero de cómo se resolvió el problema hasta ahora. La auditoría del 2026-08-03 (sección 5.6 y 6, pregunta abierta 1) encontró el bug y lo resolvió agregando un **backstop determinístico sobre el resultado de la IA** (`compartenNombre`/`compartenNombreDePila`: si la IA dice que sí pero el nombre de pila no comparte ningún token, se fuerza revisión humana igual). Es una corrección válida y ya está en producción — pero es un parche sobre el síntoma, no un rediseño del enfoque.

**Argumento técnico para ir más lejos**: el proyecto ya tiene `pg_trgm` instalado y en uso real para el buscador global (Fase 10, `prisma/migrations/20260802190000_buscador_trgm_unaccent/`). La similitud de trigramas de Postgres (o una librería determinística de similitud de strings tipo Jaro-Winkler/Dice, corriendo en Node si se prefiere no depender de una extensión de Postgres para esto) resuelve exactamente el problema de "nombre con errores de tipeo, variantes de escritura, acentos" — que es el 100% de lo que hoy se le pide a la IA en estos dos módulos — de forma **reproducible, auditable y gratuita**. La única situación donde la IA aportaría algo que la similitud de string no puede es reconocer apodos no derivados fonéticamente del nombre real (ej. "Pepe" por "José") — un caso real pero minoritario, y que de todas formas hoy termina en revisión humana la mayoría de las veces porque la confianza de la IA para ese tipo de caso tiende a quedar bajo el umbral.

**Propuesta concreta**: reemplazar la llamada a Gemini en `buscarCoincidenciaAsistidaPorIa` y `buscarPersonaParaEntradaPadron` por un cálculo de similitud determinística (ej. `pg_trgm` sobre nombre+apellido concatenado, o una librería como `string-similarity` en Node) con un umbral configurable (reusa la clave `umbral_confianza_duplicados` que ya existe en `ConfiguracionSistema`). Mantener el mismo contrato de salida (`coincidencia` / `ambiguo` / `sin_candidatos`) para no tocar el resto del pipeline. Esto:

- Elimina el bug de raíz (una función determinística no puede dar 60% una vez y 85% otra vez para el mismo input — es matemáticamente imposible).
- Libera cuota de IA (recurso ya demostrado escaso) para las tareas que de verdad la necesitan.
- Hace testeable con un test unitario simple algo que hoy es imposible de testear de forma determinística (no se puede escribir un test que le pida a un LLM "confianza exactamente 0.83").
- Responde directamente la pregunta abierta 1 de la auditoría original ("¿qué otras heurísticas deberían llevar el mismo tipo de verificación?") con una respuesta mejor que "agregar otro backstop": **no depender del número de la IA en absoluto para esta subtarea.**

**Impacto**: alto (elimina una clase entera de bug, no solo el caso ya visto). **Prioridad**: alta, pero no bloqueante — el backstop actual ya mitiga el riesgo conocido, así que esto es una mejora estructural para hacer con tiempo, no una corrección de emergencia. **Decisión**: reemplazar en ambos módulos en un mismo cambio (comparten el mismo problema), con tests unitarios que cubran los casos reales ya documentados en los comentarios del código (Barroso/Cejas/Chazarreta) como regresión.

### 1.3 — `resolverCarreraSemantica`: agregar un escalón de similitud determinística antes de la IA

Mismo argumento que 1.2 pero de menor impacto (el catálogo de carreras tiene 4-10 valores, no miles): agregar una comparación de similitud de string contra el catálogo completo (que es chico, se puede comparar contra todos los valores sin problema de performance) como paso intermedio entre el match exacto/substring actual y la llamada a la IA. Dado el tamaño del catálogo, es razonable esperar que esto resuelva la enorme mayoría de los casos reales ("Enfermeria" sin tilde, "medicina" en minúscula, typos de una letra) sin gastar cuota. **Prioridad media** — bajo impacto porque el catálogo es chico y el costo actual ya es bajo, pero el cambio es barato de hacer.

### 1.4 — Lectura de PDF: justificado, con una optimización de costo posible

Genuinamente no hay alternativa determinística razonable para leer un PDF con layout irregular o escaneado — es la tarea más "IA-nativa" del sistema. La optimización posible (no urgente): para PDFs con texto seleccionable "limpio" (no escaneado), intentar primero un parser determinístico basado en posición/columnas antes de recurrir a IA, y usar IA solo cuando ese parser no logra extraer filas con confianza razonable. Dado que la cuota de IA ya causó dos incidentes reales (Anthropic sin saldo, Gemini con cuota diaria agotada), cualquier reducción de volumen de llamadas en la tarea más cara del sistema (lectura de padrones completos, decenas de páginas) tiene valor real. **Prioridad media**, no bloqueante — evaluar cuando vuelva a cargarse un padrón real y haya volumen para medir cuánto ahorraría.

### 1.5 — Insights del dashboard: el uso de menor valor, pero no hace daño

Redactar 1-3 observaciones sobre agregados estadísticos es la tarea donde un motor de reglas ("si la variación es mayor a X%, generar este texto") lograría el 80% del valor a costo cero y sin riesgo de alucinación. No lo marco como prioridad porque el radio de daño de un insight mal redactado es bajísimo (es texto informativo, cacheado 5 minutos, sin acción automática asociada) y el volumen de uso es chico. **Prioridad baja** — candidato natural para reemplazar por reglas el día que la cuota de IA vuelva a ser un problema, no antes.

### 1.6 — Chatbot: correcto, sin cambios de fondo

No hay forma razonable de resolver "preguntas en lenguaje natural sobre datos combinados arbitrariamente" con reglas fijas — es exactamente el tipo de tarea para la que un LLM con tool-use acotado es la herramienta correcta. Sin objeciones acá.

---

## 2. Principio "la IA nunca es la fuente de verdad" — de acuerdo, documentarlo explícitamente

**Análisis**: el principio ya existe, pero **de forma implícita y fragmentada**, reinventado en cada módulo en vez de declarado una sola vez:

- `deteccion-duplicados.ts` línea 13: "REGLA NO NEGOCIABLE: esto nunca fusiona nada solo."
- `matching-padron.ts`: una entrada sin candidato queda `sin_coincidencia`, el alta siempre es decisión humana.
- `chatbot.ts` línea 50: "Nunca inventes un número... decilo explícitamente [si no tenés acceso]."
- `15-ia.md` sección 9: la IA nunca infiere opiniones políticas (versión acotada del principio, solo para el eje político).
- `01-vision-alcance.md` sección 8, principio 2: "La IA asiste, la persona decide" — este es el más cercano a una declaración general, pero vive en el documento de visión, no en la arquitectura técnica, y no está enunciado con el nivel de precisión ("fuente de verdad", "verificable determinísticamente o por intervención humana") que Gaspar propone ahora.

**De acuerdo, con matiz**: el principio ya está *practicado* consistentemente (no encontré ningún módulo que lo viole), pero no está *declarado* en un solo lugar con la fuerza de una regla de arquitectura. Eso importa concretamente porque **el patrón de bug real de este proyecto (2026-08-02 y 2026-08-03) fue exactamente "una función de IA falla o da un número inestable y eso corrompe un proceso más grande"**, encontrado y corregido tres veces por separado (padrón, importación CSV, alta de persona) antes de generalizarse. Si el principio hubiera estado escrito como regla de diseño obligatoria para todo `lib/ia/` desde el principio, probablemente se habría aplicado de entrada en las tres funciones en vez de descubrirse por auditoría reactiva.

**Decisión propuesta**: agregar a `CLAUDE.md` sección 3 (o una nueva subsección "Principios de diseño de IA") texto explícito:

> La IA nunca es la fuente de verdad del sistema. Asiste, resume, clasifica o propone — nunca decide de forma autónoma sobre datos de negocio. Toda función en `lib/ia/` que use un resultado de IA para decidir algo con efecto en la base de datos debe poder responder: "¿qué pasa si la IA falla, tarda, o da una respuesta inestable?" — la respuesta nunca puede ser "el proceso se corrompe silenciosamente" ni "se aplica igual sin verificación". Preferir, cuando exista, una verificación determinística de respaldo sobre el resultado de la IA antes que confiar en un número de confianza reportado por el modelo.

Y reflejarlo también en `15-ia.md` sección 1 (Objetivo del módulo), que hoy no lo menciona en absoluto pese a ser el documento funcional específico de IA.

**Impacto**: alto a largo plazo (previene la clase de bug ya vista tres veces), costo bajo (documentación). **Prioridad**: alta. Lo aplico en esta sesión.

---

## 3. Chatbot: que justifique sus respuestas — de acuerdo, y el trabajo ya está 80% hecho sin usarse

**Hallazgo concreto, no estaba en la auditoría original**: el dato para justificar respuestas **ya existe y ya se persiste**, pero se descarta en la UI:

- `lib/ia/chatbot.ts` devuelve `consultasEjecutadas: ConsultaEjecutada[]` (herramienta invocada, argumentos, resultado crudo) en cada respuesta.
- `lib/servicios/chatbot.service.ts` línea 129-131 lo serializa y lo guarda en `ChatbotMensaje.consultasEjecutadas` (columna que existe en el schema desde la Fase 9).
- **Ningún archivo en `app/(app)/chatbot/` lee ese campo.** Se guarda en la base y no se vuelve a usar nunca.

Es decir: el chatbot *ya* registra "cómo llegó a esa conclusión" con datos reales (la herramienta exacta y el resultado exacto que usó), y ese trabajo se está tirando. Exponerlo no es una funcionalidad nueva que haya que diseñar desde cero, es conectar un dato que ya está ahí.

**De acuerdo con la observación, con una precisión sobre el diseño**: no propongo que el chatbot "explique su razonamiento" en el sentido de pedirle a la IA que verbalice por qué — eso reintroduce el mismo problema del punto 1 y 2 (una explicación generada por IA no es más verificable que la respuesta original). Propongo mostrar los **datos crudos ya capturados** (qué herramienta, con qué filtros, qué devolvió) en un desplegable tipo "Ver de dónde salió este dato", coherente con el principio del punto 2: la verificación es determinística (el resultado real de una consulta a la base), no una segunda opinión de la misma IA.

**Impacto**: alto para confianza del usuario en el módulo (crítico en un sistema con datos sensibles), costo bajo (UI sobre un dato que ya existe). **Prioridad**: alta.

---

## 4. Observabilidad — en desacuerdo con una fase dedicada; de acuerdo con un recorte chico y específico

**Análisis**: hoy no existe ninguna observabilidad más allá de `console.error`/`console.warn` dispersos y los logs crudos de Vercel (`vercel logs`, sin retención ni dashboard). El pedido lista 9 ítems (métricas, tiempos de respuesta, errores, consumo de IA, uso diario, estadísticas internas, rendimiento, consultas lentas, calidad de datos).

**En desacuerdo con crear una fase o módulo dedicado a esto ahora.** Razón: observabilidad de infraestructura (tiempos de respuesta, consultas lentas, uso de memoria, rendimiento general) es una inversión que se justifica por **volumen y por tener un SLA que cumplir** — ninguna de las dos cosas aplica hoy (decenas de usuarios, sin usuarios reales todavía, sin compromiso de disponibilidad). Construir un panel de métricas de performance ahora es optimizar un sistema que todavía no tiene carga real que optimizar, un desperdicio de esfuerzo clásico.

**De acuerdo con un recorte específico**: el **consumo de IA** es la única dimensión de esta lista que ya causó incidentes reales y repetidos (cuenta de Anthropic sin saldo, cuota diaria de Gemini agotada, ambos en medio de trabajo real). Ahí sí hay una necesidad concreta, no especulativa: sin visibilidad de cuánto se está gastando de cuota *mientras* se gasta, cada incidente se descubre recién cuando algo falla. Propuesta acotada: un contador simple (tabla `UsoIA` con fecha, función, éxito/error, o incluso más liviano: un log estructurado por llamada en `cliente-ia.ts` con un formato consistente que se pueda filtrar en Vercel Logs) — no un dashboard nuevo, no una fase nueva.

**Decisión propuesta**: no agregar una fase de observabilidad al roadmap. Sí agregar, como tarea chica dentro del trabajo de IA existente, un log estructurado de uso en `cliente-ia.ts` (una línea por llamada: modelo, función que la originó, éxito/error/tipo de error). Revisar el resto de la lista (tiempos de respuesta, consultas lentas, etc.) recién en Fase 13, y solo si para ese momento hay señales reales de que algo es lento — no antes.

**Impacto**: medio (visibilidad real sobre el recurso más frágil del sistema). **Prioridad**: media. **Costo**: bajo.

---

## 5. Calidad de datos — en desacuerdo con un módulo nuevo; de acuerdo con integrarlo donde ya se mira

**Análisis**: hoy la calidad de datos se resuelve en el punto de entrada (normalización al guardar, detección de duplicados al alta/importación) pero no hay ninguna vista que muestre el estado agregado de la base ("¿cuántas personas sin teléfono? ¿cuántos duplicados sin resolver quedaron de la última importación?").

**En desacuerdo con una fase o módulo propio**: el dashboard administrativo (Fase 3, ya construido, `11-dashboards.md`) es exactamente el lugar donde un administrador ya va a buscar "estado general del sistema" — crear una sección nueva y separada para "calidad de datos" fragmenta ese lugar único de verdad en dos pantallas que un administrador tiene que recordar visitar por separado. Es scope creep disfrazado de buena práctica: el problema real (visibilidad) no requiere un módulo nuevo, requiere 3-4 tarjetas más en una pantalla que ya existe.

**Decisión propuesta**: agregar al dashboard admin existente (no crear uno nuevo) un bloque "Salud de datos" con: personas sin teléfono ni email, personas con `estadoFicha` inconsistente si las hay, entradas de padrón en `pendiente` sin resolver hace más de N días, importaciones con errores sin revisar. Esto es prácticamente gratis de calcular (son counts con `where`) y encaja en la arquitectura de KPIs que el dashboard ya tiene.

**Impacto**: medio. **Prioridad**: media — útil pero no urgente sin datos reales de volumen todavía (punto 0.1).

---

## 6. ADR (Architecture Decision Records) — en desacuerdo con crear la carpeta, con una alternativa concreta

**Análisis**: ADRs formales (contexto/alternativas/decisión/consecuencias por archivo) resuelven un problema de **coordinación entre varias personas que deciden de forma asincrónica y necesitan un registro compartido y buscable**. Este proyecto no tiene ese problema: hay un único Product Owner (Gaspar) y una única "persona" que implementa (sesiones sucesivas de Claude Code), y **el proyecto ya tiene, de hecho, una cultura de documentar el "por qué" mejor que la mayoría de los proyectos que sí usan ADRs formalmente**:

- Los mensajes de commit ya son, en la práctica, micro-ADRs (`git log --oneline`: "Fix: matching de padrón vinculaba automático personas con nombre de pila totalmente distinto", con el detalle completo en el cuerpo del commit).
- Los comentarios en el código ya explican decisiones con el contexto completo (ver los ejemplos citados en la sección 1 de este documento — `matching-padron.ts` líneas 82-99 es, en los hechos, un ADR completo dentro de un comentario).
- `CLAUDE.md` sección 7 ("Supuestos activos") ya cumple exactamente la función de un registro de decisiones de producto/arquitectura versionado, con fecha y motivo de corrección (ver S6, corregido 2026-08-02 con la razón documentada).

Agregar `docs/ADR/` sumaría un **segundo lugar** donde buscar el mismo tipo de información, con el riesgo real (en un proyecto de este tamaño, sin proceso que lo fuerce) de que quede desactualizado mientras los comentarios inline y los commits siguen siendo la fuente real que se mantiene.

**Decisión propuesta**: no crear `docs/ADR/`. En cambio, ampliar explícitamente el alcance de `CLAUDE.md` sección 7 (renombrar mentalmente de "Supuestos activos" a también cubrir decisiones de arquitectura pura, no solo supuestos de producto) para las 3-4 decisiones que hoy están dispersas y sí valdría la pena centralizar: proveedor de IA (ya está, S6), plan de Vercel Hobby (ya está, sección 10), RLS bypasseado por Prisma (no está documentado como decisión en ningún lado con fecha/motivo — solo aparece como "riesgo conocido" en el informe de auditoría), sin entorno separado dev/prod (idem).

**Impacto**: bajo. **Prioridad**: baja — es una mejora de higiene documental, no de producto.

---

## 7. Tests automatizados — de acuerdo parcialmente, con alcance acotado y una inconsistencia real encontrada

**Análisis del estado real**: `tests/{unit,integration,e2e}` está en la estructura de carpetas documentada en `CLAUDE.md`, pero **no existe un solo archivo de test en todo el repositorio**. Más llamativo: `playwright` está instalado como dependencia (`package.json`) y **no se usa en ningún lado** — cero archivos `.spec.ts`, cero configuración de Playwright. Es una dependencia fantasma: o se adopta, o se debería quitar del `package.json` para no mentir sobre el estado real del proyecto.

**No estoy de acuerdo con "escribir tests para todo ya"**: el esquema y el alcance funcional todavía están cambiando fase a fase (recién ahora Fase 11, con Fase 12 y 13 pendientes) — una batería E2E amplia hoy se reescribiría varias veces antes de estabilizarse, que es exactamente el tipo de costo hundido que hace que los equipos abandonen sus suites de tests.

**Sí estoy de acuerdo con empezar, acotado a donde ya duele**: hay lógica específica que (a) es pura o casi pura (fácil de testear sin mockear media base de datos), y (b) **ya causó bugs reales de regresión silenciosa** cuando se tocó sin red de seguridad — literalmente el mismo patrón de bug apareció dos veces (padrón 2026-08-02, duplicados de personas 2026-08-04) en la misma familia de funciones. Esa es la señal más fuerte posible de "esto necesita un test que impida que vuelva a pasar":

- `lib/ia/normalizacion.ts`: `normalizarNombrePropio`, `normalizarTelefono`, `normalizarEmail` — funciones puras, cero dependencias.
- `compartenNombre` (`deteccion-duplicados.ts`) y `compartenNombreDePila` (`matching-padron.ts`) — las funciones que específicamente arreglan el bug ya visto dos veces; sin test, nada impide que una futura sesión las "simplifique" y reintroduzca el bug.
- Invariantes de negocio con impacto en integridad de datos: RN-3 (un solo contacto principal por tipo) y RN-4 (una participación por persona/actividad) en `personas.service.ts`/`participaciones.service.ts` — son las reglas más citadas en la documentación como "no negociables", y hoy dependen enteramente de que el código se siga leyendo con cuidado, sin ninguna verificación automática.

**Decisión propuesta**: iniciar una suite de **unit tests** (recomiendo Vitest, más liviano que Playwright para este alcance — Playwright es para E2E de navegador, no para esto) cubriendo específicamente los ítems de arriba. No tocar Playwright todavía: o se decide adoptarlo con al menos un smoke test real (login + navegación básica) antes de que termine esta sesión, o se quita del `package.json` para no dejar una dependencia fantasma. Difiero E2E amplio a después de Fase 12 (cuando la superficie de UI deje de cambiar tan rápido).

**Impacto**: alto en los puntos acotados (previene una clase de bug ya vista dos veces), bajo si se intenta cubrir todo. **Prioridad**: alta para el alcance acotado, explícitamente baja/diferida para todo lo demás.

---

## 8. Separación Dev/Producción — de acuerdo en esperar, con un argumento adicional más fuerte que "no hay usuarios"

**Análisis**: coincido con reevaluar esto y con la conclusión de esperar, pero por una razón adicional que la auditoría original no señaló con suficiente peso: el flujo de migraciones de este proyecto **ya es manual y fricciones o** por un problema documentado de Prisma con el pooler de Supabase (`CLAUDE.md` sección 3.0 — cada migración con SQL específico de Supabase requiere escribir el SQL a mano, aplicarlo con un script temporal, e insertarlo a mano en `_prisma_migrations`). Agregar un segundo entorno *ahora* significaría duplicar ese proceso manual y propenso a error en cada cambio de schema, en un momento en que el schema todavía cambia con frecuencia (esta misma sesión agregó una migración nueva). El costo de mantener dos entornos sincronizados a mano, mientras el esquema es inestable, es desproporcionado frente al beneficio (que hoy es bajo, porque no hay datos reales de terceros en riesgo).

**Decisión propuesta**: confirmar la postergación a Fase 13, y agregar explícitamente como criterio de entrada "el esquema debe estar razonablemente estable" además de "antes de operar con datos reales" — son dos condiciones independientes, y ambas deberían cumplirse antes de pagar el costo de un segundo entorno.

**Impacto**: medio (evita duplicar fricción operativa real). **Prioridad**: confirmado baja por ahora, sin cambios al roadmap (Fase 13 ya lo contempla correctamente).

---

## 9. Backups — de acuerdo en diferir el simulacro, en desacuerdo con diferir la verificación

**Análisis**: hay dos actividades distintas mezcladas en el pedido original: (a) **verificar** qué nivel de backup/point-in-time-recovery incluye el plan de Supabase actualmente contratado, y (b) **probar** una restauración real. La (b) tiene sentido esperar a Fase 13 — no hay nada real que perder hoy, y un simulacro de restauración tiene su propio riesgo operativo si se hace sobre el único proyecto de Supabase existente sin un entorno separado (ver punto 8). La (a) es pura verificación de lectura, de costo casi nulo, y **no depende de tener datos reales** — es información que conviene tener ahora para poder planificar Fase 13 con datos reales en vez de descubrir en ese momento que el plan contratado no incluye lo que se asumía (exactamente el tipo de error — "asumir en vez de verificar contra la fuente real" — que ya costó caro dos veces este proyecto con límites de Vercel y modelos de Gemini, ver memoria `feedback-verificar-antes-de-asumir`).

**Decisión propuesta**: hacer la verificación (a) ahora, sin esperar — es de bajo costo y consistente con la lección ya aprendida de este mismo proyecto. Diferir el simulacro de restauración (b) a Fase 13, junto con la separación de entornos.

**Impacto**: bajo costo, previene una sorpresa tardía. **Prioridad**: la verificación, media (hacerla esta sesión si es posible sin fricción); el simulacro, confirmado diferido.

---

## Hallazgos nuevos, no mencionados en la auditoría original

1. **`.env.example` tenía una referencia obsoleta a `ANTHROPIC_API_KEY`** en vez de `GEMINI_API_KEY`, casi un día completo después de la migración de proveedor de IA (2026-08-02). Ya corregido en esta sesión. Es evidencia concreta de por qué el punto 12 del pedido de Gaspar (revisar toda la documentación) es válido: la deriva entre código y documentación ya está pasando, no es hipotética.

2. **`consultasEjecutadas` del chatbot se persiste y nunca se lee** (detallado en el punto 3) — patrón general a vigilar: instrumentación que se agrega "para el futuro" y después nadie conecta a la UI. Vale la pena, al cerrar cualquier feature, verificar explícitamente que todo campo nuevo agregado al modelo de datos tenga al menos un lugar que lo lea.

3. **El catálogo `Etiqueta` está completamente modelado (schema, filtro en el listado de Personas) pero no tiene ninguna UI de creación/asignación en ningún lado del código** — no hay un solo `prisma.etiqueta.create` ni `prisma.personaEtiqueta.create` en todo el repositorio. `05-modulo-personas.md` sección 5 lo describe como funcionalidad ya esperada, y `20-roadmap.md` Fase 1 solo excluye explícitamente "etiquetado avanzado", lo cual implica que el etiquetado básico debería existir. Es un vacío funcional real que no está trackeado como pendiente en ningún lado — quedó silenciosamente sin construir. Recomiendo agregarlo explícitamente a la lista de pendientes de Fase 1/12 en el roadmap en vez de dejarlo implícito.

4. **"Lista de espera" en Actividades está documentada como disparador de notificación (`13-notificaciones.md` sección 3: "se liberó un cupo... la siguiente persona en la lista de espera") pero no está construida.** Corrección tras releer `07-modulo-participaciones.md` sección 3.3 con más cuidado: no es un gap de modelo de datos (`EstadoParticipacion` deliberadamente no tiene `en_espera`, para no complejizar el enum — el "excedente de cupo" está pensado como indicador de UI, no un estado nuevo), es un gap de implementación: ni el indicador visual ni la notificación de cupo liberado existen en el código todavía. Lo detecté al implementar Fase 11 esta misma sesión y tuve que omitir ese disparador específico por no tener dónde engancharlo. Ya documentado como pendiente explícito en ambos módulos (`07-modulo-participaciones.md` sección 3.3, `13-notificaciones.md`).

---

## Documentos que conviene actualizar, y por qué

| Documento | Cambio propuesto | Motivo |
|---|---|---|
| `CLAUDE.md` sección 3 | Agregar el principio explícito "la IA nunca es la fuente de verdad" (punto 2) | Hoy es implícito y se redescubrió por bug 3 veces |
| `CLAUDE.md` sección 7 y 10 | Agregar marcador "estado actual: construcción, sin datos reales de terceros" (punto 0.1/0.2) | Evita que el tono del checklist de producción se aplique antes de tiempo |
| `15-ia.md` sección 1 | Referenciar el principio de IA-asistente desde el documento funcional, no solo desde `CLAUDE.md` | Es el documento que cualquier sesión relee "al iniciar una fase de IA" — hoy no lo menciona |
| `05-modulo-personas.md` / `20-roadmap.md` | Marcar explícitamente el etiquetado básico como pendiente real, no implícito (hallazgo nuevo 3) | Evitar que siga sin trackearse |
| `07-modulo-participaciones.md` / `13-notificaciones.md` | Decisión explícita sobre lista de espera: construirla o quitar la mención (hallazgo nuevo 4) | Documentación describe algo que no existe en el modelo de datos |

---

## Resumen de prioridades

**Alta, hago ahora mismo (documentación, costo bajo):** 0.2, 2.
**Alta, próxima tarea de código (costo medio, alto impacto):** 1.2 (reemplazo determinístico en duplicados/padrón), 3 (exponer justificación del chatbot), 7 acotado (tests de las funciones ya afectadas por bugs reales).
**Media:** 1.3, 1.4, 4 (log de uso de IA, no dashboard), 5 (tarjetas en dashboard existente, no módulo nuevo), 9.a (verificación de backup).
**Baja / diferido a Fase 13, confirmado con argumento reforzado:** RLS real, MFA, rotación de credenciales, 8, 9.b.
**No recomendado implementar:** módulo de calidad de datos separado, carpeta `docs/ADR/`, fase de observabilidad de infraestructura general.

---

## Actualización 2026-08-04 (misma sesión) — el punto 1.2 se implementó, con alcance mayor al descripto acá

A partir de un pedido explícito posterior de Gaspar ("rediseño completo del motor de identidad, sin depender de un LLM"), el punto 1.2 de este documento se implementó por completo — no como reemplazo puntual de dos llamadas a Gemini, sino como un módulo nuevo (`lib/identidad/`, ver su `README.md`) con investigación de mejores prácticas (Fellegi-Sunter, record linkage), benchmark propio con corpus sintético (`scripts/benchmark-identidad.ts`, resultados en `lib/identidad/BENCHMARK-RESULTADOS.md`), y tests de regresión (`tests/unit/identidad/`) para los bugs reales citados arriba.

El proceso de calibración encontró, con evidencia (no intuición), **dos fallas reales en el diseño inicial del motor antes de integrarlo**:

1. Sin una compuerta explícita, una suma ponderada lineal sola dejaba pasar "Constanza Barroso" vs "Cindy Barroso" (77% de confianza) — el mismo bug que esta sección ya sabía que existía, reproducido en el motor nuevo hasta que se agregó la compuerta.
2. El propio test suite (antes de tocar producción) encontró un caso NUEVO no contemplado en el punto 1.2 original: "Ana Fernandez" vs "Ana Hernandez" (nombre idéntico, apellidos distintos pero 93% de similitud difusa) daba 91% de confianza. Es una ambigüedad real e irreductible para cualquier algoritmo de similitud léxica, no un umbral mal calibrado — la respuesta fue una segunda compuerta que exige coincidencia EXACTA de apellido para auto-vinculación, aceptando conscientemente que typos genuinos de un solo caracter en un apellido también van a revisión manual.

Ambos casos quedan como test de regresión permanente. Detalle completo, incluyendo la metodología de calibración y las limitaciones honestas del enfoque, en `lib/identidad/README.md`.
