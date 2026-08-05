# Motor de resolución de identidad — diseño desde cero, 2026-08-05

Este documento reemplaza el enfoque de `PROPUESTA-REARQUITECTURA-MATCHING-2026-08-04.md` (que quedó como iteración incremental sobre la arquitectura existente — ver nota de cierre al final). Pedido explícito: no mejorar lo que hay, diseñar desde cero como si el problema se planteara hoy por primera vez, y destruir sin miramientos cualquier parte de lo actual que no se sostenga.

## 0. El problema, dicho sin referencia a ninguna implementación

Dado un string de texto libre escrito por una persona (su propio nombre, en un formulario, sin formato garantizado), decidir contra un padrón de miles de fichas (nombre, apellido, DNI casi siempre ausente):

- es esta persona exacta,
- es probablemente esta persona (necesita confirmación humana), o
- no está en el padrón — **el resultado más común, no la excepción**.

La restricción de diseño más importante, y la que la arquitectura anterior no tomaba como primer principio: **con DNI ausente en la inmensa mayoría de los casos, la única evidencia disponible es texto libre en español rioplatense, y la tasa base de "no está" es alta.** Un motor que por defecto "encuentra algo" está mal calibrado para este dominio antes de mirar un solo algoritmo de similitud — la pregunta de diseño correcta no es "¿qué tan parecidos son estos dos nombres?", es **"¿hay evidencia real de que sean la misma entidad, o simplemente comparten letras?"**. Son preguntas distintas y la arquitectura anterior (y su primera revisión de ayer) contestaban la segunda con la esperanza de que se pareciera a la primera.

## 1. Por qué la similitud de texto sobre campos completos es la elección equivocada de base

No es un problema de qué algoritmo de similitud usar (Jaro-Winkler vs Dice vs lo que sea) — es un problema de **sobre qué unidad se mide la similitud**.

Cualquier medida de similitud **normalizada** (trigram similarity, Jaro-Winkler, Dice — todas dan un ratio 0-1) tiene una propiedad matemática ineludible: **con strings cortos, pocos caracteres de coincidencia alcanzan para un ratio alto**, sin importar el umbral que se elija. "Abella" (6 caracteres) y "Antonella" (9 caracteres) comparten un puñado de trigramas por la terminación `-ella`, y eso basta para cruzar cualquier umbral razonable entre 0.2 y 0.4 — **no es un umbral mal calibrado, es una propiedad estructural de medir similitud normalizada sobre apellidos españoles, que en promedio son cortos y comparten sufijos muy productivos** (`-ez`, `-ez`, `-ón`, `-ana`, `-ella`, `-era`). Subir el umbral tampoco es la respuesta real: sube hasta el punto de empezar a perder variantes de tipeo genuinas (que es exactamente lo que ya se probó, "durante semanas", sin resultado).

**La corrección estructural correcta no es "un umbral distinto", es cambiar de unidad de medida: de "similitud normalizada de un campo completo" a "distancia de edición absoluta entre tokens individuales".** Un tope de distancia de edición absoluta (por ejemplo, como máximo 1 operación de edición para tokens de 4-6 caracteres, 2 para tokens más largos) no tiene el defecto de volverse indulgente con strings cortos — al contrario, con strings cortos un tope absoluto es *más* estricto, porque una operación de edición pesa proporcionalmente más. "Abella" → "Antonella" requiere sustituir/insertar cuatro o cinco caracteres como mínimo: muy por encima de cualquier tope de tipeo razonable. "Fernandez" → "Ferndandez" (transposición real) requiere una sola operación: pasa. Esa es la diferencia que ningún ajuste de umbral sobre un ratio normalizado puede replicar, porque el ratio y la distancia absoluta no son la misma cantidad con un cambio de escala — son matemáticamente distintas en cómo tratan strings cortos.

Esto explica el 100% del primer ejemplo ("Abella Irene → Dorado Antonella") sin necesitar ninguna regla nueva de negocio, solo corrigiendo la aritmética de comparación.

## 2. Por qué "apellido" no puede ser una señal opcional entre varias — tiene que ser un requisito de entrada al conjunto de candidatos

El segundo ejemplo ("Abril Nicolás → Abril Soto") no es un problema de medición — "Nicolás" y "Soto" están correctamente identificados como no relacionados por cualquier medida razonable. El problema es que el candidato **igual entra a la lista que ve el operador**, porque el diseño anterior (en cualquiera de sus dos versiones) trata "comparten el token 'Abril'" como evidencia parcial que suma hacia una decisión, en vez de preguntarse primero: *¿qué tan informativo es que dos personas compartan un nombre de pila?*

En términos de teoría de la información: un nombre de pila común en la población (Abril, Juan, Ana, María...) tiene **baja distintividad** — miles de personas lo comparten, así que coincidir en él aporta casi nada sobre si son la misma persona. Un apellido, en cambio, tiene **alta distintividad relativa** en el universo de una facultad de miles de estudiantes (salvo los muy comunes, ver sección 5). Esta asimetría no es una opinión de diseño, es la misma idea que en record linkage clásico (Fellegi-Sunter) se formaliza como la probabilidad *u* (probabilidad de coincidir por azar entre dos personas no relacionadas) — un nombre de pila común tiene *u* alta, un apellido raro tiene *u* baja.

**Consecuencia de diseño directa: el apellido no es "una señal más entre varias que se combinan" — es el requisito de entrada al conjunto de candidatos.** Si no hay ninguna evidencia de apellido (ni exacta ni variante de tipeo acotada), no hay candidato, sin importar cuántos nombres de pila compartan. Esto es lo que garantiza el comportamiento que pediste explícitamente: "no quiero un sistema que siempre encuentre candidatos, quiero uno que solo muestre candidatos cuando realmente existe evidencia."

## 3. ¿Tiene sentido partir nombre/apellido al principio? — No como partición rígida y ciega

Pregunta correcta a hacerse antes de tokenizar nada: el texto libre no trae garantía de qué es nombre y qué es apellido, y la heurística posicional ("último token es apellido") falla sistemáticamente con nombres compuestos y apellidos con partícula (secciones 6 y 7). **La partición binaria nombre/apellido como primer paso del pipeline es, en sí misma, una decisión de diseño cuestionable** — obliga a acertar una clasificación difícil (¿"José" es nombre o apellido acá?) antes de tener ninguna evidencia para decidirla bien.

Alternativa: **trabajar primero con una bolsa de unidades léxicas sin rol asignado, y anotar el rol como una probabilidad derivada de datos reales, no como una regla posicional.**

Concretamente:
1. Cada Persona ya cargada en la base **es, en sí misma, un dataset de qué palabras aparecen en la columna `apellido` y cuáles en `nombre`** — miles de observaciones reales, no una heurística inventada. Una tabla derivada (recalculable con una query de agregación, sin ML) `frecuenciaRolToken(token) → { vecesComoApellido, vecesComoNombre }` permite anotar cada unidad léxica del texto libre con "en esta base, esta palabra aparece como apellido el 95% de las veces" — evidencia empírica real, auditable, explicable con un número.
2. La coma explícita (cuando existe, ej. formato del padrón "Apellido, Nombre") sigue siendo la señal más fuerte y gana por sobre la anotación estadística cuando está presente — eso ya era correcto en el diseño anterior y se conserva.
3. Sin coma y sin señal estadística fuerte (palabra ambigua, o nueva, sin frecuencia registrada), el rol queda "no determinado" — y el motor no fuerza una partición, compara la unidad contra el conjunto completo del otro lado en vez de comprometerse a un rol que puede estar mal.

Esto no es una tabla nueva de infraestructura pesada: es una vista o tabla derivada, recalculable en segundos contra `Persona`, exactamente el mismo tipo de "aprendizaje sin ML por conteo" que ya se usa hoy para calibrar el benchmark sintético — la diferencia es calibrar contra la base real en vez de against datos inventados.

## 4. ¿Debería existir un índice invertido? — Sí, y reemplaza por completo el blocking actual

El blocking actual es "una consulta SQL de similitud sobre un campo completo, con un umbral fijo, `LIMIT 20`". Es exactamente el patrón que la literatura de *record linkage* (Christen, "Data Matching", 2012; y las mismas ideas detrás de Splink/Dedupe.io, que **conceptualmente** — no como librería — sí vale la pena copiar) identifica como ingenuo: **el blocking de producción real casi nunca compara campos completos por similitud difusa; indexa tokens.**

Propuesta: una tabla de índice invertido, poblada al crear/editar cada Persona (no un cálculo on-the-fly costoso):

```
PersonaToken
  personaId   (FK)
  token       (unidad léxica normalizada — puede ser una partícula+palabra fusionada, ver sección 6)
  esApellido  (probabilidad/flag derivado de frecuenciaRolToken)
  esRaro      (derivado de cuántas Personas más comparten ese token — sección 5)

  índice sobre `token`
```

Generación de candidatos = tomar las unidades léxicas del nombre consultado, buscarlas en `PersonaToken` (coincidencia exacta primero; después, por cada token sin coincidencia exacta, buscar variantes dentro del tope de distancia de edición absoluta de la sección 1 — esto sí puede apoyarse en `pg_trgm` como preselección barata seguida de un filtro de distancia real en la aplicación, o directamente una función SQL de distancia de edición si el volumen lo permite sin problema de rendimiento a la escala de ATP, ver `04-modelo-datos.md`/S4), y agrupar por `personaId` contando cuántas unidades léxicas coincidieron y con qué fuerza (exacta vs variante).

Esto es, en el fondo, la misma idea que "búsqueda aproximada de texto" resuelve con un índice invertido (como Lucene/Elasticsearch hacen fuzzy matching: indexan términos, no comparan documentos completos por similitud de campo) — no es una técnica nueva ni exótica, es alinear el diseño con cómo se resuelve este problema en sistemas de producción reales, en vez del atajo de una sola consulta de similitud sobre un campo.

**Ventaja sobre "agregar más estrategias de blocking en paralelo"** (que era la propuesta de ayer): con un índice invertido no hace falta orquestar 5 consultas distintas y unir resultados — es una sola estructura de datos que ya responde "qué personas comparten qué unidades léxicas, con qué fuerza", y de ahí salen naturalmente todas las señales que ayer se planteaban como estrategias separadas (huella exacta = todas las unidades coinciden; token fuerte compartido = al menos una coincide; iniciales = ya se puede derivar de las unidades indexadas).

## 5. Rareza estadística — no como "estrategia adicional", como parte del índice mismo

Cada fila de `PersonaToken` puede llevar, derivado de un `COUNT(*) GROUP BY token`, cuántas Personas más en la base comparten ese token. Esto no es una tabla aparte ni un proceso adicional — es una columna calculada sobre los mismos datos del índice invertido. Su uso: un apellido que comparten 40 personas en la base (`Gonzalez`, `Fernandez`) necesita evidencia de nombre de pila más fuerte para promover un candidato a "auto"; un apellido que aparece una sola vez en toda la base (`Chazarreta`) es, por sí solo, casi suficiente. Esto reemplaza el peso fijo `0.42` para "apellido" del diseño anterior (que trataba a todos los apellidos igual, sin importar cuán distintivos son) por algo que responde exactamente a la pregunta correcta: *¿qué tan sorprendente es que dos personas compartan este dato?*

## 6. Nombres argentinos — resuelto en la capa de canonicalización léxica, antes de tokenizar por espacios

Este es el punto donde el diseño anterior fallaba estructuralmente para los casos que listaste, no por falta de un algoritmo sino por hacer la tokenización ingenua (separar por espacios) demasiado temprano.

Propuesta: una capa de canonicalización léxica que corre **antes** de separar por espacios, con dos diccionarios chicos y curados (editable, coherente con "catálogos configurables" de `CLAUDE.md`):

1. **Partículas de apellido**: `de`, `del`, `de la`, `di`, `van`, `von`, `mc`, `mac`, más el patrón `o'` / `d'` (apóstrofe). Cuando una de estas aparece, se fusiona con la(s) palabra(s) siguiente(s) en **una sola unidad léxica** antes de tokenizar — "de la Cruz" nunca se separa en tres tokens independientes, es una unidad. Esto resuelve "De la Cruz", "Del Valle", "Di Santo", "Mc Donald", "O'Connor" con una regla léxica simple, sin heurística posicional que pueda adivinar mal.
2. **Nombres compuestos frecuentes**: "Juan José", "María Belén", "José María", "Juan Cruz", "Ana Paula", "María del Carmen" (que además cruza con la regla de partículas), etc. — lista curada inicialmente a mano (nombres de pila compuestos son un conjunto acotado y conocido en Argentina, no hace falta inventar una lista completa desde cero, hay fuentes públicas de nombres frecuentes) y, igual que en la sección 3, **enriquecible con datos reales**: dos palabras que aparecen consecutivas en la columna `nombre` de la base con mucha frecuencia relativa son candidatas a fusionarse como unidad compuesta, sin necesitar mantenerla 100% a mano para siempre.

El resultado de esta capa es lo que entra a la bolsa de unidades léxicas de la sección 3 — no palabras sueltas por espacio, unidades léxicas ya conscientes de la gramática de nombres propios argentinos.

## 7. ¿Debería existir un grafo? — No para esto, sí para un problema distinto y futuro

Un grafo de identidad (nodos = registros, aristas = pares confirmados como la misma persona, resolviendo componentes conexas) es la herramienta correcta cuando el problema es **deduplicar en bloque un conjunto grande contra sí mismo** (todas las Personas entre sí, o todo el padrón importado de una sola vez contra la base completa) — no cuando el problema es "una consulta puntual contra un índice ya construido", que es el caso real acá (alta de una Persona, o una fila del padrón, contra la base existente, una por una). Construir y mantener un grafo para esto sería una complejidad de infraestructura que el problema no pide.

**Dónde sí valdría la pena en el futuro**: si algún día se quisiera correr una pasada de "deduplicación masiva" sobre toda la base de Personas de una vez (detectar todos los duplicados históricos acumulados, no solo prevenir nuevos), ahí un enfoque de componentes conexas sobre pares candidatos sí es la herramienta estándar de la literatura (evita duplicados transitivos: A-B parecidos, B-C parecidos, pero A-C no comparados directamente). No es parte de este rediseño, queda anotado como una funcionalidad distinta y posterior si hace falta (no hay evidencia hoy de que haga falta — mismo criterio de "no implementar sin evidencia" que ya rige en `lib/identidad/README.md`).

## 8. ¿Debería desaparecer el scoring? — El número único que decide, sí. La medición graduada por campo, no.

Distinción importante que el pedido original merece que se conteste con precisión:

- **Lo que desaparece**: una confianza continua 0-1 calculada como suma ponderada de señales, usada como el criterio de decisión final. Ese mecanismo es el que permite que "evidencia contradictoria" y "evidencia genuinamente ambigua" terminen en el mismo número y la misma bandeja de revisión — es la raíz del problema reportado, y no se salva agregando más términos a la suma ni más compuertas encima.
- **Lo que se mantiene, necesariamente**: para saber si un token es "variante de tipeo" hace falta *medir* algo (distancia de edición) — eso no es scoring en el sentido de "número que decide", es clasificación de un campo en un estado discreto (`EXACTO` / `VARIANTE_TIPEO` / `AUSENTE`) usando una medición como insumo. La diferencia de fondo: la medición nunca se suma con otras mediciones para producir un número final que cruza un umbral — se usa para etiquetar un estado, y son los **estados** (no los números) los que entran a una tabla de reglas explícita.

Dicho de otra forma: **"¿qué tan parecidos son" deja de ser la pregunta que decide algo. "¿Qué combinación de coincidencias exactas/variantes/ausencias tenemos" es la que decide.**

## 9. Tabla de decisión resultante

Con generación de candidatos que ya exige evidencia de apellido para siquiera entrar (sección 2), la tabla de decisión es más simple que cualquier versión anterior — ya no necesita manejar el caso "apellido totalmente distinto" porque ese caso nunca llega acá, quedó fuera en la generación:

| Apellido (según índice) | Nombre de pila | Rareza del apellido | Resultado |
|---|---|---|---|
| EXACTO | EXACTO / ALIAS conocido / inicial compatible | Raro o común | **auto** |
| EXACTO | AUSENTE o sin relación | Raro (pocas personas más lo comparten) | **revisión** (el apellido raro ya es fuerte, pero cero evidencia de nombre amerita confirmación humana, nunca auto sin ningún cruce) |
| EXACTO | AUSENTE o sin relación | Común (muchas personas lo comparten) | **descarte o revisión de baja prioridad** (mismo apellido común sin ningún otro cruce es poca evidencia real) |
| VARIANTE_TIPEO (tope de edición acotado) | EXACTO | Cualquiera | **revisión** (nunca auto — mismo criterio ya validado hoy para "Fernandez"/"Hernandez": una variante de apellido nunca alcanza sola para auto-vincular) |
| VARIANTE_TIPEO | AUSENTE o débil | Cualquiera | **descarte** |
| Ninguna evidencia de apellido | — | — | *(nunca llega acá — no generó candidato)* |

## 10. Ranking — cuántos candidatos mostrar

Igual principio que la propuesta de ayer, pero ahora la pregunta es más simple porque el conjunto de entrada ya es pequeño y relevante por construcción: mostrar todos los candidatos que comparten el nivel más alto de la tabla de la sección 9 que se haya alcanzado para esa consulta, nada por debajo. En la enorme mayoría de los casos reales (apellido específico, no un apellido masivo) esto va a ser 0 o 1 candidato — 2+ candidatos empatados en el nivel más alto debería ser genuinamente infrecuente (dos personas con exactamente el mismo apellido Y el mismo nivel de coincidencia de nombre), y cuando pase, es precisamente el caso donde vale la pena que un humano mire.

## 11. Balance falsos positivos / falsos negativos, explícito

- **Falso negativo que se acepta conscientemente**: una persona real que escribió mal su apellido más allá del tope de distancia de edición (ej. 3+ caracteres distintos) no se encuentra automáticamente. Esto es preferible a abrir el tope y volver a generar ruido — coincide con tu criterio explícito ("prefiero perder un candidato dudoso antes que mostrar diez candidatos absurdos"). El costo real es bajo: la alternativa cuando no hay match es alta de ficha nueva (ya es el comportamiento normal y esperado, no un error) o revisión humana ocasional si el operador reconoce el nombre.
- **Falso negativo que NO se acepta**: variantes de tipeo reales dentro del tope de distancia de edición absoluta se siguen encontrando — la sección 1 diseñó el tope explícitamente para capturar esto sin las consecuencias colaterales del enfoque anterior.
- **Falso positivo que se elimina de raíz**: cualquier candidato sin evidencia real de apellido (sección 2) o basado en similitud normalizada engañosa sobre strings cortos (sección 1) — los dos mecanismos exactos que producían tus dos ejemplos.

## 12. Qué se destruye por completo (no se conserva ni como referencia)

Siendo explícito, como pediste:

1. **El blocking por similitud de campo completo con `pg_trgm`** (`obtenerCandidatosPorApellido`, `obtenerCandidatosPorNombre`) — se reemplaza enteramente por el índice invertido de tokens (sección 4). `pg_trgm` puede seguir siendo útil como preselección barata *dentro* de la búsqueda de variantes por token, pero nunca como el criterio final de inclusión sobre un campo completo.
2. **El motor de scoring por suma ponderada** (`PESOS_MOTOR_IDENTIDAD`, `calcularConfianzaIdentidad` tal como está) — se reemplaza por la clasificación discreta por campo + tabla de decisión (secciones 8-9). No sobrevive como "una opción más" — el diseño nuevo no tiene ningún lugar donde sumar números de señales distintas para producir una confianza única.
3. **Las dos compuertas actuales** (`compartenTokenDeNombre`, `compartenApellidoExacto` con techo 0.6) — ya no hacen falta como mecanismo de "bajar un número", porque el requisito de apellido está en la generación de candidatos (sección 2), no como corrección posterior sobre un score ya calculado.
4. **La tokenización por partición posicional nombre/apellido como primer paso** (`tokenizarNombrePersona` tal como parte hoy) — se reemplaza por bolsa de unidades léxicas + anotación de rol probabilística (secciones 3 y 6). El concepto de "conservar la coma como señal fuerte cuando existe" sí se conserva, todo lo demás de esa función no.
5. **El piso fijo `PISO_CONFIANZA_REVISION = 0.4`** — deja de tener sentido como concepto (no hay confianza numérica única de la cual ser piso); su función ("no molestar al operador con ruido sin evidencia real") la cumple directamente el requisito de apellido en la generación de candidatos.

Lo único que sobrevive básicamente intacto: los algoritmos de distancia de edición ya implementados en `algoritmos.ts` (Levenshtein/Damerau-Levenshtein) — se siguen necesitando, solo que se usan para clasificar tokens individuales en estados discretos, no para alimentar una suma ponderada sobre campos completos. Todo lo demás de `algoritmos.ts` (Jaro-Winkler, Dice, Token Set/Sort Ratio, similitud coseno) deja de tener un rol central: eran necesarios cuando la unidad de comparación era el campo completo; con comparación token-a-token y tope de distancia absoluta, dejan de aportar lo que aportaban.

## 13. Comparación explícita con el estado del arte de record linkage / entity resolution

- **Blocking real de producción** (Christen 2012; mismo principio detrás de Splink/Dedupe.io, sin usar las librerías): indexar por predicados baratos y combinarlos con OR — acá el predicado es "comparte un token de apellido, exacto o a distancia de edición acotada". Es exactamente el estándar aceptado, y es lo que el diseño anterior (blocking por similitud de campo completo) no estaba haciendo, a pesar del nombre.
- **Fellegi-Sunter, la idea que sí vale la pena copiar sin la maquinaria de log-odds**: no toda coincidencia de campo pesa igual — depende de cuán sorprendente es. Acá se traduce directo en "rareza del apellido" (sección 5), calculada por conteo simple contra la base real, no un modelo entrenado.
- **Por qué no un modelo probabilístico completo (log-odds, Bayes)**: el volumen de ATP (miles, no decenas de miles — supuesto S4) y la ausencia de un dataset de verdad-terreno grande no lo justifican, y agregaría una capa de opacidad que choca con el requisito explícito de explicabilidad total. La tabla de decisión discreta (sección 9) es auditable línea por línea por una persona sin trasfondo estadístico — un requisito real de este proyecto, no un nice-to-have.
- **Por qué no ML/embeddings/LLM**: además de estar explícitamente descartado, ninguno de los problemas diagnosticados (secciones 1 y 2) es un problema de "necesitamos un modelo más sofisticado" — son errores de qué unidad se mide y qué evidencia es obligatoria. Un embedding no resuelve "un ratio normalizado es indulgente con strings cortos"; una regla de distancia absoluta sí.

## 14. Preguntas abiertas para vos

1. La tabla `PersonaToken` (índice invertido) es un cambio de modelo de datos real (tabla nueva, población al crear/editar Persona, y una migración para poblarla con las ~5356 fichas del padrón real ya cargado) — ¿confirmás que es el camino que querés antes de que diseñe el plan de implementación con detalle de migración?
2. Los diccionarios de partículas y nombres compuestos (sección 6): ¿arrancamos con una lista curada a mano razonablemente completa para nombres argentinos, o preferís que primero derive una lista candidata de la base real (`Persona.nombre`) para que la revises antes de cargarla?
3. Los topes de distancia de edición absoluta (sección 1) — propongo 1 para tokens de 4-6 caracteres, 2 para 7+, pero es un número a calibrar contra el benchmark real, no una intuición. ¿Corro `scripts/benchmark-identidad.ts` adaptado a este diseño nuevo antes de fijar los topes, o preferís fijarlos ahora y ajustar con datos reales una vez en uso?

---

**Nota de cierre sobre el documento de ayer** (`PROPUESTA-REARQUITECTURA-MATCHING-2026-08-04.md`): queda como registro histórico de una iteración intermedia, no como plan vigente — pedido explícito de hoy fue no partir de ahí. La diferencia de fondo entre ambos documentos: ayer se agregaban etapas nuevas (poda, multi-estrategia) *alrededor* de la arquitectura existente (blocking por campo + score ponderado); hoy se cuestiona si esas dos piezas centrales debían existir en absoluto, y la respuesta es que no en la forma en que estaban.
