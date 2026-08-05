# Propuesta de rearquitectura del motor de matching de Personas — 2026-08-04

Pedido explícito de Gaspar: no ajustar umbrales ni pesos (ya se hizo durante semanas), sino criticar y rediseñar el pipeline completo de resolución de identidad. Este documento diagnostica por qué la arquitectura actual (`lib/identidad/`, ver su `README.md`) sigue generando candidatos absurdos aunque el scoring esté bien calibrado, y propone un pipeline nuevo de 6 etapas, con fundamento técnico, adaptado específicamente a nombres argentinos sin DNI.

**Estado de este documento**: propuesta para revisión, no implementada. Es una decisión arquitectónica real (afecta directamente `matching-padron.ts`, que decide `estado_padron` — quién puede votar) — corresponde pausar y validar contigo antes de escribir código, no una decisión que tomar sola en modo autónomo.

---

## 0. Veredicto: el problema es arquitectónico, no de calibración

Tenías razón en descartar "subir/bajar umbral". Con el pipeline actual, **ningún umbral arregla el problema** porque el defecto está dos etapas antes de donde vive cualquier umbral configurable:

1. La **generación de candidatos** (blocking) es una sola estrategia (similitud de trigramas sobre un campo, umbral 0.3, `LIMIT 20`) que en apellidos españoles cortos genera falsos positivos por pura morfología compartida (terminaciones `-ella`, `-ana`, `-ez`), no por parecido real.
2. No existe una **etapa de poda** entre generar candidatos y calcular el score caro. Todo lo que sobrevive al blocking (por débil que sea la señal) se scorea igual.
3. El **scoring no es "por evidencia"** aunque el README lo describe así — es una suma ponderada lineal con dos parches (`compuertas`) que *limitan* la confianza a 0.6 en vez de *descartar* el candidato. Un candidato con evidencia contradictoria (apellido explícitamente distinto) no desaparece: aterriza justo en la banda "revisión manual" (0.4–umbral), que es exactamente el ruido que te está haciendo perder tiempo.

Los dos ejemplos que diste son consecuencia directa y verificable de (1) + (3), no de un umbral mal puesto:

### Caso "Abella Irene → Dorado Antonella"

El blocking (`obtenerCandidatosPorApellido` en `deteccion-duplicados.ts:124`, o el equivalente en `matching-padron.ts:56`) hace:

```sql
similarity(unaccent(lower(apellido)), unaccent(lower('Abella'))) > 0.3
```

`pg_trgm` calcula similitud de Sørensen-Dice sobre trigramas de **caracteres**, sin ningún concepto de "palabra" ni de dónde empieza/termina un nombre. `"abella"` y `"antonella"` comparten los trigramas `ell`, `lla`, `la ` — con strings cortos (6-9 caracteres), eso alcanza para superar 0.3 sin que haya ninguna relación semántica real entre los apellidos. Es un efecto conocido de trigramas sobre strings cortos con terminaciones comunes del español (`-ella`, `-ella`, `-ana`, `-ana`), no un bug puntual: **cualquier par de apellidos españoles con la misma terminación de 3-4 letras va a generar falsos positivos de blocking**, sistemáticamente, sea cual sea el umbral entre 0.2 y 0.4.

### Caso "Abril Nicolás → Abril Soto"

Acá el blocking probablemente sí trajo un candidato razonable (comparten el token `abril`), pero lo que lo deja *visible* en pantalla es la etapa de scoring: `compartenApellidoExacto` (`motor-scoring.ts:135`) detecta que "Nicolás" ≠ "Soto" y **no descarta el candidato** — lo castiga a un techo de **0.6** (`motor-scoring.ts:271`). El piso de descarte (`PISO_CONFIANZA_REVISION`) es **0.4** (`politica-decision.ts:20`). 0.6 > 0.4, así que el candidato cae directo en la banda "revisión manual" y se le muestra al operador con una etiqueta de "coincidencia de confianza media" — a pesar de que el propio motor ya determinó internamente, con una regla explícita y correcta, que el apellido **no coincide**. La compuerta hace el diagnóstico correcto y después lo tira a la pila de "y bueno, mostralo igual".

Esto es el patrón general: **las dos compuertas que existen hoy son control de daños sobre un modelo de suma ponderada, no un modelo de evidencia real.** Bajan un número que después vuelve a compararse contra otro número. Nunca eliminan al candidato del universo de "cosas que le hacemos perder tiempo a un humano".

---

## 1. Pipeline propuesto

```
Texto libre (nombre completo, cualquier formato/fuente)
        │
        ▼
┌────────────────────────────┐
│ 1. GENERACIÓN DE CANDIDATOS │  Varias estrategias independientes en paralelo,
│    (candidate generation)   │  unión de resultados, cada candidato llega
│                              │  etiquetado con QUÉ estrategia lo encontró
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│ 2. PODA RÁPIDA               │  Reglas binarias, baratas, sin similitud
│    (candidate pruning)       │  difusa costosa. Elimina lo imposible ANTES
│                              │  de gastar cómputo en compararlo en detalle.
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│ 3. COMPARACIÓN PROFUNDA      │  Los algoritmos que ya existen (Jaro-Winkler,
│    (deep comparison)         │  Dice, Token Set/Sort Ratio...) — sin cambios,
│                              │  siguen siendo buenos, el problema nunca fue
│                              │  el algoritmo de similitud en sí.
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│ 4. CLASIFICACIÓN POR         │  Reemplaza la suma ponderada + parches por
│    EVIDENCIA                 │  una tabla de decisión explícita: cada campo
│    (evidence classification) │  se clasifica en un nivel de evidencia, la
│                              │  combinación de niveles (no la suma de
│                              │  números) determina el resultado.
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│ 5. RANKING                   │  Cuántos candidatos mostrar (0, 1, varios) y
│                              │  en qué orden, según el nivel de evidencia,
│                              │  no según quién tiene 2 puntos más.
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│ 6. DECISIÓN                 │  Igual que hoy: auto / revisión / descarte.
│    (ya existe, casi sin      │  Cambia lo que entra acá (evidencia, no
│    cambios)                 │  confianza sola).
└────────────────────────────┘
```

Las etapas 3 y 6 son las que menos cambian — el problema nunca estuvo en el algoritmo de similitud de caracteres ni en el concepto de 3 vías (auto/revisión/descarte). El rediseño real está en 1, 2, 4 y 5.

---

## 2. Etapa 1 — Generación de candidatos: multi-estrategia

### Diagnóstico del blocking actual

- Una sola query, un solo campo (`apellido`, o `apellido OR nombre` en el caso del padrón — que es en sí mismo un síntoma de que el blocking no sabe distinguir qué es apellido y qué es nombre en el texto libre de origen).
- Umbral fijo 0.3 para **todos** los apellidos, sin distinguir un apellido raro (`Chazarreta`) de uno común (`Gonzalez`) — un apellido común necesita un umbral de similitud mucho más alto para que el candidato aporte información real, porque hay cientos de personas reales con apellidos parecidos por casualidad.
- `LIMIT 20` sin criterio de por qué 20 y no 10 o 50.

### Propuesta: candidatos = unión de estrategias independientes, cada una barata

En vez de una consulta, correr **varias estrategias de blocking en paralelo** (todas ya viables en SQL/Node con lo que ya tenés instalado — `pg_trgm`, índices, nada nuevo que instalar) y unir los resultados. Cada estrategia es una hipótesis distinta de "por qué este candidato podría ser la misma persona":

| Estrategia | Qué compara | Por qué es una señal independiente |
|---|---|---|
| **a. Huella exacta** (`huellaDigital`, ya existe en `normalizar.ts`) | Mismo conjunto de tokens, orden y mayúsculas aparte | Ya existe, se mantiene tal cual — es el único caso donde no hace falta ni comparar, es matching exacto |
| **b. Apellido dominante, trigram con umbral dependiente de rareza** | `similarity(apellido, apellido)` pero el umbral sube si el apellido es común (ver "rareza estadística" abajo) | Sigue siendo la señal más fuerte en nombres argentinos, pero deja de tratar igual a "Chazarreta" que a "Gonzalez" |
| **c. Token fuerte compartido (índice invertido)** | ¿Algún token de 4+ caracteres del nombre completo aparece en el nombre completo del candidato? | Cubre el caso "Abril Nicolás" — el token `abril` compartido es una señal real incluso si no sabemos si es nombre o apellido en ninguno de los dos lados |
| **d. Compatibilidad de iniciales** | Iniciales de cada token, en cualquier orden, compatibles (mismo conjunto o subconjunto) | Cubre "J. Perez" vs "Juan Perez", barato de precalcular |
| **e. Distancia de huella (fingerprint) acotada** | Distancia de edición entre huellas digitales completas, tope bajo (ej. ≤2) | Cubre errores de tipeo que cambian 1-2 caracteres sin depender de qué campo es apellido |

**Importante**: el resultado de la etapa 1 no es solo "lista de IDs candidatos" — es una lista de `{ id, estrategiasQueLoEncontraron: string[] }`. Esa etiqueta **no se descarta**, se usa como evidencia en la etapa 4 (un candidato encontrado por 3 estrategias independientes es intrínsecamente más confiable que uno encontrado por 1 sola, sin necesidad de recalcularlo).

### Rareza estadística del apellido — cómo calcularla sin infraestructura nueva

No hace falta un modelo de lenguaje ni una lista externa: la rareza se calcula contra tu propia base de `Persona` (`COUNT(*) GROUP BY apellido_normalizado`, se puede cachear en `ConfiguracionSistema` o una tabla nueva chica, recalculado periódicamente o on-demand). Apellidos que aparecen en más del top-N percentil de frecuencia (los "Gonzalez"/"Fernandez"/"Rodriguez" de la base) requieren umbral de blocking más alto (ej. 0.5 en vez de 0.3) porque la probabilidad de que dos personas distintas los compartan por azar es alta — es exactamente el concepto de *m/u probabilities* de Fellegi-Sunter aplicado sin necesidad de la librería (ver sección 6).

---

## 3. Etapa 2 — Poda rápida (candidate pruning): lo que pediste explícitamente

Esta etapa **no existe hoy** y es, con el diagnóstico de la sección 0, la pieza que más impacto tiene sobre el problema concreto que reportaste. Corre **antes** de cualquier algoritmo de similitud costoso (Jaro-Winkler, Dice, etc.), sobre el universo ya acotado por la etapa 1, y descarta con reglas binarias baratas:

1. **Ningún apellido en común, ni exacto ni por trigram por encima de un umbral estricto (ej. 0.55, no el 0.3 de blocking)** Y **ningún token de 4+ caracteres compartido en absoluto** → descarte inmediato, no se calcula score. (Esto es lo que hoy filtra `compartenApellidoExacto`, pero convertido de "castigo" a "descarte real".)
2. **Iniciales incompatibles**: si ambos lados tienen al menos un token de nombre de pila de 3+ caracteres y ninguna inicial de un lado coincide con ninguna del otro → descarte.
3. **Overlap de tokens mínimo**: si Jaccard de tokens completos es 0 (cero tokens en común, ni parcial) y la huella digital tiene distancia de edición alta (>3) → descarte.
4. **Longitud del nombre completo muy dispar sin explicación** (ej. un lado tiene 1 token y el otro 5, sin ningún token compartido) → descarte.

La diferencia de fondo con las compuertas actuales: **esto pasa antes del scoring, no después, y el resultado es "no calculamos ni mostramos nada", no "calculamos, lo bajamos a 0.6 y lo mostramos igual".** Un candidato podado nunca entra a la etapa 3 ni aparece en la lista que ve el operador — no ocupa un lugar entre los 1-5 candidatos que sí valen la pena revisar.

Efecto esperado sobre tus dos ejemplos: "Abella Irene" vs "Dorado Antonella" se poda en la regla 1 (ningún apellido ni token compartido). "Abril Nicolás" vs "Abril Soto" **sobrevive la poda** (comparten el token `abril`) pero baja de nivel en la etapa 4 en vez de mostrarse como si fuera casi-un-match — ver siguiente sección.

---

## 4. Etapa 3+4 — Comparación profunda + clasificación por evidencia (no promedio)

### Los algoritmos de similitud (etapa 3) se mantienen

Jaro-Winkler, Dice, Token Set/Sort Ratio, similitud por iniciales — todo lo que hay en `algoritmos.ts` sigue siendo correcto y bien fundamentado (el benchmark real lo confirma). El pedido de "no agregar otro algoritmo de similitud" se respeta: el cambio no es qué medimos, es **cómo combinamos lo medido**.

### El cambio real: de suma ponderada a tabla de decisión por niveles de evidencia

Hoy: `confianza = Σ (valor_señal × peso_señal)`, con dos parches que bajan el techo si algo contradice. Es información perdida — dos escenarios con la misma suma numérica pueden tener significados opuestos ("apellido exacto + nombre parcial" vs "apellido parcial + nombre exacto" pueden sumar lo mismo pero son evidencia muy distinta), y el modelo no puede expresar "esto es evidencia contradictoria, no simplemente débil".

Propuesta: cada señal se clasifica primero en un **nivel discreto de evidencia**, no un número continuo:

```
EVIDENCIA_FUERTE        → coincidencia exacta o cuasi-exacta (≥0.92)
EVIDENCIA_MEDIA         → similitud alta pero no exacta (0.75-0.92)
EVIDENCIA_DEBIL         → similitud parcial, poco informativa sola (0.4-0.75)
EVIDENCIA_AUSENTE       → sin dato para comparar (ninguno de los dos trae ese campo)
EVIDENCIA_CONTRADICTORIA → los valores son explícitamente distintos y comparables
                            (no "no sé", sino "sé que no son iguales")
```

Después, la decisión sale de una **tabla de reglas explícita** sobre la combinación de niveles (apellido × nombre × conjunto completo × cuántas estrategias de blocking lo encontraron), no de sumar sus valores numéricos. Ejemplos concretos de reglas (ilustrativas, a terminar de calibrar con el benchmark real, pero el *tipo* de regla es el punto):

| Apellido | Nombre | Resultado |
|---|---|---|
| FUERTE | FUERTE | → **auto** (nivel más alto, sin ambigüedad) |
| FUERTE | MEDIA/DEBIL (comparte algo, no exacto) | → **revisión**, evidencia "media" |
| FUERTE | CONTRADICTORIA (comparten apellido, nombre de pila sin ninguna relación) | → **revisión de baja prioridad o descarte directo**, nunca cerca de auto — hoy este caso ("Constanza"/"Cindy") llega a 0.6, en el modelo de evidencia debería directamente no calificar para auto ni para "revisión destacada" |
| MEDIA (parecido, no exacto) | FUERTE | → **revisión**, nunca auto (esto es justo el caso "Fernandez"/"Hernandez" que hoy ya se maneja bien — se preserva el criterio, solo cambia la forma de expresarlo) |
| DEBIL o AUSENTE | cualquiera | → **descarte**, salvo que 2+ estrategias de blocking independientes lo hayan encontrado (evidencia estructural compensa evidencia léxica débil) |
| CONTRADICTORIA | cualquiera | → **descarte**, salvo evidencia de alias aprendida (ver etapa 6) |

La ventaja concreta sobre la suma ponderada: **"apellido contradictorio" dejaría de poder disfrazarse de "revisión de confianza media"** — sale directo como descarte o como revisión marcada explícitamente "de baja prioridad / posible coincidencia débil", nunca mezclado en la misma lista que un candidato con evidencia genuinamente ambigua.

Esto es, en esencia, la misma idea conceptual de Fellegi-Sunter (combinar evidencia por campo con razón de verosimilitud, no promediarla) pero expresada como reglas legibles en vez de log-odds — más apropiado para un equipo sin infraestructura de ML y con el mismo requisito de explicabilidad que ya tenés hoy (`explicacion: string[]`, que se mantiene igual o mejor).

---

## 5. Etapa 5 — Ranking: cuándo mostrar 0, 1 o varios candidatos

Hoy `evaluarCandidatos` siempre devuelve **todos** los candidatos que sobrevivieron el blocking, ordenados por confianza — el módulo llamador decide mostrar 1 (`mejor`) o el conjunto para "ambiguo". El problema es que "ambiguo" hoy es simplemente "no llegó al umbral de auto", sin distinguir *por qué*.

Propuesta de ranking basado en nivel de evidencia, no en la posición numérica:

- **Ninguna evidencia FUERTE ni MEDIA en ningún candidato** → 0 candidatos mostrados, resultado "sin coincidencia" / alta nueva. (Esto ya pasa hoy si nada supera el piso 0.4 — se mantiene, pero ahora el piso es un nivel de evidencia, no un número arbitrario.)
- **Exactamente un candidato en el nivel de evidencia más alto alcanzado, y el siguiente candidato queda un nivel completo por debajo** → mostrar **1**, es la única revisión que vale la pena.
- **Dos o más candidatos empatados en el nivel de evidencia más alto alcanzado** → mostrar esos (normalmente 2-3, nunca los 20 del blocking crudo), porque ahí sí hace falta el ojo humano para desempatar entre opciones genuinamente similares.
- **Nunca mostrar un candidato que la poda (etapa 2) ya descartó**, sin importar en qué posición hubiera quedado por score numérico solo.

Esto responde directo a tu pregunta: "¿cuándo uno, cuándo dos, cuándo ninguno?" — la respuesta no es un número de corte fijo, es "cuántos candidatos comparten el nivel de evidencia más alto que se alcanzó para ese nombre".

---

## 6. Modelo probabilístico — qué copiar conceptualmente de Fellegi-Sunter/Splink/Dedupe.io (no las librerías)

Confirmado, ninguna de esas librerías aplica directo (Splink es Python/Spark, Dedupe.io es Python) — pero las ideas centrales sí se pueden adoptar en TypeScript sin dependencias nuevas:

1. **Blocking multi-estrategia con unión de resultados** — ya cubierto en la etapa 1, es literalmente la recomendación estándar de Fellegi-Sunter moderno y de Splink (que llama a esto "blocking rules", en plural, y las combina con OR).
2. **m/u probabilities**: para cada campo, estimar dos probabilidades — *m* (probabilidad de que el campo coincida dado que SON la misma persona) y *u* (probabilidad de que coincida por azar dado que NO lo son). Un apellido común tiene *u* alta (coincide por azar seguido) → aporta poca evidencia aunque coincida. Un apellido raro tiene *u* baja → coincidir es evidencia fuerte. Hoy el motor pesa "apellido" siempre igual (0.42) sin importar si es "Gonzalez" o "Chazarreta" — la rareza estadística de la etapa 1 es el punto de entrada para incorporar esto sin necesitar el aparato matemático completo de log-odds.
3. **Clasificación en 3 (o más) niveles con revisión humana en el medio** — ya es el diseño actual (auto/revisión/descarte), se mantiene, se refina con niveles de evidencia en vez de bandas numéricas.

**Recomendación**: no migrar a log-odds/Bayes formal todavía. El volumen de ATP (S4: miles, no decenas de miles) y la falta de un dataset de verdad-terreno grande no lo justifican hoy — la tabla de decisión por niveles de evidencia (sección 4) captura el 80% del beneficio conceptual con muchísima menos complejidad y sigue siendo 100% explicable, que es un requisito de producto explícito tuyo. Queda como evolución futura si `VeredictoIdentidad` acumula volumen real (ver etapa siguiente) y aparece evidencia de que la tabla de reglas ya no alcanza.

---

## 7. Aprendizaje desde `VeredictoIdentidad` (dato que ya se está capturando y no se usa)

Hoy `VeredictoIdentidad` guarda cada decisión humana (aceptar/rechazar una sugerencia) pero nada la lee de vuelta. Propuestas concretas, ninguna requiere ML:

1. **Diccionario de pares de apellidos confusables, aprendido, no hardcodeado.** Hoy "Fernandez"/"Hernandez" está resuelto por una regla escrita a mano en el código (`compartenApellidoExacto`). Con suficientes veredictos de "rechazado" sobre el mismo par de apellidos, ese par pasa a una tabla (`ParApellidoConfusable` o similar) que topea la confianza automáticamente — generaliza el patrón sin tener que anticipar cada par a mano.
2. **Diccionario de alias/apodos confirmados.** Si un humano confirma que "Beto" y "Alberto" son la misma persona dos o tres veces, ese par entra a una tabla de alias que la etapa de comparación de nombre de pila consulta antes de caer a similitud léxica pura — resuelve casos que ningún algoritmo de edición de caracteres puede resolver (no hay similitud de string entre "Beto" y "Alberto").
3. **Recalibración periódica del umbral real**, no solo el sintético. `scripts/benchmark-identidad.ts` ya calibra contra un corpus sintético — se puede extender (script nuevo, no reemplaza el existente) para recalcular precisión/recall reales contra `VeredictoIdentidad` acumulado, y alertar si el umbral configurado en producción se desvía mucho del óptimo medido contra decisiones humanas reales.
4. **Nada de esto es Machine Learning** en el sentido de un modelo entrenado opaco — son tablas de excepciones aprendidas por conteo simple, revisables y auditables por un humano en cualquier momento (coherente con el principio de "la IA nunca es la fuente de verdad" de `CLAUDE.md`, aunque esto ni siquiera es IA).

---

## 8. Nombres argentinos específicamente

El tokenizador actual (`normalizar.ts:48`) parte por posición (primer token = nombre, últimos 1-2 = apellido si no hay coma) sin ningún conocimiento de los patrones reales del español rioplatense. Esto rompe en varios casos reales que listaste:

- **Nombres compuestos frecuentes** ("Juan José", "María José", "María Belén", "Juan Ignacio", "Ana Paula", "José María", "Juan Cruz", "María del Carmen"): hoy cada palabra es un token independiente, así que "Juan José Pérez" con 3 tokens sin coma se parte nombre=`["Juan"]`, apellido=`["José", "Pérez"]` — **José termina metido en el apellido por error**. Propuesta: un diccionario chico y editable (mismo patrón que catálogos configurables, `04-modelo-datos.md` sección 18) de nombres compuestos frecuentes en Argentina, consultado en la tokenización para tratarlos como una sola unidad antes de aplicar la heurística posicional.
- **Partículas de apellido** ("de la Cruz", "del Valle", "Di Santo", "Mc Donald", "O'Connor"): hoy se conservan bien **solo cuando hay coma explícita** (`normalizar.ts:58`); sin coma, la heurística posicional las puede cortar mal (ej. "Juan de la Cruz" sin coma, con la regla de "4+ tokens → últimos 2 son apellido", corta mal: apellido=`["la","cruz"]`, pierde "de"). Propuesta: lista de partículas conocidas (`de`, `del`, `de la`, `di`, `mc`, `o'`, `van`, `von`) que, si aparecen, fuerzan a que el apellido empiece ahí en vez de aplicar la cuenta posicional fija.
- Ninguno de estos casos necesita fonética inglesa (Soundex/Metaphone) — coincide con la decisión ya documentada en `algoritmos.ts` de no implementarlos. El problema real de nombres argentinos es de **segmentación** (dónde corta nombre/apellido), no de fonética.

---

## 9. Falsos positivos vs. falsos negativos — el balance que pediste

Tu criterio ("prefiero revisión manual sobre pérdida de personas reales, pero la revisión tiene que ser útil") se traduce directo en el diseño de arriba:

- **Etapa 1 (generación) se mantiene generosa** — varias estrategias en paralelo, para no perder candidatos reales (recall alto acá es barato, todavía no gastamos cómputo caro).
- **Etapa 2 (poda) es donde se gana precisión sin costo** — reglas binarias que cuestan nada de calcular, eliminan lo que ningún humano consideraría revisar. Es la etapa que hoy no existe y la que más devuelve por el esfuerzo de implementarla.
- **Etapa 4 (evidencia) reemplaza "confianza numérica" por "por qué es candidato"** — un candidato con evidencia contradictoria dura (apellido explícitamente distinto) nunca vuelve a aparecer en la misma bandeja que uno con evidencia genuinamente ambigua. Eso es lo que hoy hace que la revisión manual se sienta inútil: todo cae en la misma lista sin distinguir "esto es un desempate real" de "esto no debería estar acá".

---

## 10. Qué eliminar por completo

Siendo explícito con lo que pediste ("si algo debería eliminarse, decilo"):

1. **Las dos compuertas actuales tal como están escritas** (`compartenTokenDeNombre`, `compartenApellidoExacto` con techo 0.6) — no porque el criterio esté mal (está bien, y se preserva como regla en la tabla de evidencia de la etapa 4), sino porque el mecanismo de "bajar un número que después se vuelve a comparar contra otro número" es estructuralmente el problema. Se reemplazan por descartes reales en la etapa de poda, o por niveles explícitos en la tabla de evidencia — nunca por un "techo" que deja el candidato flotando en la banda de revisión.
2. **El blocking de una sola estrategia sobre un solo campo** (`obtenerCandidatosPorApellido`, `obtenerCandidatosPorNombre`) — se reemplaza por la unión de estrategias de la etapa 1. El SQL de similitud con `pg_trgm` no se descarta, sigue siendo una de las 5 estrategias, pero deja de ser la única.
3. **La confianza como número único devuelto al llamador** (`ResultadoScoring.confianza: number`) — se reemplaza (o se acompaña) por el nivel de evidencia como tipo explícito, para que un llamador no pueda volver a comparar dos números y perder la distinción entre "evidencia media" y "evidencia contradictoria empujada hacia abajo" que hoy pueden dar el mismo 0.6.

Lo que **no** cambia y por qué: `algoritmos.ts` completo (los algoritmos de similitud en sí nunca fueron el problema, el benchmark los valida), el patrón de 3 vías auto/revisión/descarte (es el correcto para este dominio), la explicabilidad (`explicacion: string[]`, se mantiene y mejora), y la decisión de no usar IA para esto (sigue vigente, nada de esta propuesta la revisa).

---

## 11. Plan de implementación por etapas (si lo aprobás)

Para no reescribir todo de una y poder validar cada paso contra el benchmark real antes de avanzar:

1. **Etapa 2 (poda) primero, sola.** Es la de mayor impacto sobre el problema concreto que reportaste, la más barata de implementar (reglas binarias, sin tocar el scoring existente), y se puede insertar entre el blocking actual y `evaluarCandidatos()` sin tocar ningún otro archivo. Debería eliminar la mayoría del ruido tipo "Abella/Dorado" de forma inmediata.
2. **Etapa 1 (multi-estrategia)** después, una estrategia nueva a la vez, cada una validada contra el benchmark antes de sumar la siguiente.
3. **Etapa 4 (evidencia por tabla de decisión)** en paralelo al benchmark — requiere más cuidado porque cambia el tipo de retorno que consumen `deteccion-duplicados.ts` y `matching-padron.ts`.
4. **Etapa 7 (aprendizaje)** al final, porque depende de que exista volumen real de `VeredictoIdentidad` — hoy es reciente (Etapa 5 del rediseño anterior, sembrada hoy mismo), todavía no hay historia suficiente para aprender nada.

Cada etapa cierra con: correr `scripts/benchmark-identidad.ts` actualizado con casos sintéticos que representen tus dos ejemplos reales (agregarlos al corpus como regresión), y los tests existentes de `tests/unit/identidad/`.

## 12. Preguntas abiertas para vos

1. ¿Aprobás arrancar por la etapa de poda (punto 1 del plan) de forma autónoma, dado que es aditiva y no cambia ningún tipo de retorno existente? Es el cambio de menor riesgo y mayor impacto inmediato.
2. Diccionario de nombres compuestos y partículas argentinas (sección 8): ¿lo armamos como catálogo configurable en base de datos (coherente con "catálogos configurables, no hardcodeados" de `CLAUDE.md`) o alcanza con una constante en código para esta escala, revisable en PR?
3. ¿Confirmás la prioridad "recall alto en generación, precisión alta en poda/evidencia" tal como la interpreté en la sección 9, o hay algún módulo (ej. padrón, por su peso en quién vota) donde preferís el balance más conservador que el resto?
