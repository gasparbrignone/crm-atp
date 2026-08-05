# Motor de Resolución de Identidad (Identity Resolution Engine)

Reemplaza, desde el 2026-08-04, el uso de un modelo de IA (Gemini) para decidir si dos nombres de persona corresponden al mismo individuo. Usado por `lib/ia/deteccion-duplicados.ts` (alta e importación de Personas) y `lib/ia/matching-padron.ts` (matching de padrón electoral). Motivo del cambio y evidencia completa: [`/REVISION-CRITICA-AUDITORIA-2026-08-04.md`](../../REVISION-CRITICA-AUDITORIA-2026-08-04.md) sección 1.2, y el pedido explícito de Gaspar que dio origen a este módulo.

## Por qué determinístico y no IA

El modelo barato usado antes (`gemini-3.1-flash-lite`, sin razonamiento) no calibraba de forma estable una confianza numérica para "el apellido coincide pero el nombre de pila es otra persona" — la misma comparación exacta dio 60% de confianza una vez y 85% la otra (medido en producción, ver `INFORME-AUDITORIA-EXTERNA.md` sección 5.6). Eso causó vinculaciones automáticas incorrectas reales en un padrón electoral. Una función determinística no puede tener ese problema por definición: mismo input, mismo output, siempre — y por eso, a diferencia de una llamada a un LLM, es testeable con casos fijos (ver `tests/unit/identidad/`).

Investigación de base: el enfoque general sigue el marco de **Fellegi-Sunter** para *record linkage* (comparar vectores de evidencia por campo, combinarlos en un puntaje, clasificar en 3 vías — enlazar / posible enlace / no enlazar), el estándar de facto en la literatura de entity resolution y la base de herramientas open-source como Splink. Para la elección de algoritmos de similitud de nombres específicamente, la literatura (ver búsquedas citadas en el historial de esta sesión) confirma **Jaro-Winkler como el de mejor desempeño reportado para nombres propios cortos** — resultado que el benchmark de este módulo confirma empíricamente contra datos propios (ver `BENCHMARK-RESULTADOS.md`).

## Arquitectura (4 capas)

```
Texto libre (nombre completo, cualquier fuente/formato)
        │
        ▼
┌─────────────────────┐
│  1. normalizar.ts    │  Quita acentos/mayúsculas/puntuación, tokeniza,
│                       │  detecta "Apellido, Nombre" vs "Nombre Apellido"
└─────────┬─────────────┘
          ▼
┌─────────────────────┐
│  2. algoritmos.ts    │  Levenshtein, Damerau-Levenshtein, Jaro,
│                       │  Jaro-Winkler, Dice, Coseno, Jaccard, Token
│                       │  Sort/Set/Partial Ratio, similitud por iniciales
└─────────┬─────────────┘
          ▼
┌─────────────────────┐
│ 2.5. poda.ts          │  Descarta, ANTES del scoring, candidatos sin
│      (desde 2026-08-05)│  ningún token compartido ni similitud real de
│                       │  apellido — deliberadamente permisiva
└─────────┬─────────────┘
          ▼
┌─────────────────────┐
│ 3. motor-scoring.ts  │  Combina señales en una confianza 0-1 explicable
│                       │  (no un promedio simple — ver más abajo), con 2
│                       │  compuertas determinísticas de seguridad
└─────────┬─────────────┘
          ▼
┌─────────────────────┐
│  4. resolucion.ts    │  Punto de entrada: evalúa un nombre contra una
│                       │  lista de candidatos (ya acotada por blocking en
│                       │  el módulo llamador + la poda de arriba), devuelve
│                       │  el mejor ordenado
└──────────────────────┘
```

Cada capa es independiente y testeable por separado. Ningún archivo de este módulo llama a `lib/ia/cliente-ia.ts` ni a ningún proveedor de IA. El blocking en sí (qué candidatos llegan a `evaluarCandidatos()`) vive un nivel más arriba, en los módulos llamadores — ver "Escalabilidad" más abajo.

## El motor de scoring, en detalle

`calcularConfianzaIdentidad(nombreA, nombreB)` combina 4 señales con pesos calibrados empíricamente (no elegidos a mano — ver metodología abajo):

| Señal | Peso | Qué mide |
|---|---|---|
| Apellido | 0.42 | Mejor similitud (Jaro-Winkler o Dice, lo que sea mayor) entre los tokens de apellido de cada lado |
| Nombre de pila | 0.30 | Igual, más tolerancia a iniciales ("J." vs "Juan") |
| Conjunto completo de tokens | 0.20 | Token Set/Sort Ratio, Jaccard, Partial Ratio sobre TODOS los tokens — invariante al orden, compensa una partición nombre/apellido mal adivinada |
| Tokens exactos compartidos | 0.08 | Bonus por evidencia dura, no difusa |

**No es un promedio simple.** Además de la suma ponderada, hay **tres compuertas determinísticas** que limitan la confianza sin importar cuán alto sume el resto:

1. **`compartenTokenDeNombre`** — si el apellido coincide pero el nombre de pila no comparte ningún token real (ni exacto ni por contención) con el candidato. Sin esto, "Constanza Barroso" vs "Cindy Barroso" (mismo apellido, nombre de pila sin relación — el bug real de producción de 2026-08-03) daba 77% de confianza. **Actualizado 2026-08-05**: el techo bajó de 0.6 (banda de revisión) a 0.35 (por debajo del piso, "sin coincidencia") — decisión de producto de Gaspar tras ver el volumen real de revisión manual de un padrón sin DNI cargado: sin DNI, este caso es una ambigüedad que ningún dato adicional puede resolver, así que forzar revisión ahí es puro costo sin beneficio real.
2. **`compartenApellidoExacto`** — si ningún token de apellido de un lado aparece EXACTO en el conjunto completo de tokens del otro lado (pero el nombre de pila SÍ coincide, a diferencia de la compuerta anterior). Sin esto, "Ana Fernandez" vs "Ana Hernandez" (nombre idéntico, apellidos distintos pero con 93% de similitud difusa) daba 91% de confianza. Encontrado por el propio test suite antes de llegar a producción. Techo: 0.6, sigue yendo a revisión manual (a diferencia de la compuerta 1, acá el nombre de pila coincidente SÍ es evidencia real de un posible typo de apellido, vale la pena que un humano lo mire).
3. **`compuerta_apellido_sin_evidencia`** (agregada 2026-08-05, ver `PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md`) — si el apellido no tiene ninguna relación real con el candidato (ni siquiera parecida), sin importar qué tan fuerte sea el nombre de pila compartido. Bug real de producción: "Abril, Nicolás Germán" (padrón) vs un candidato con nombre de pila "Abril" pero apellido real "Ibarra" (sin relación) quedaba en banda de revisión por el nombre de pila compartido solo. Techo: 0.35 (sin coincidencia).

Las tres compuertas están documentadas in-line en `motor-scoring.ts` con el caso real que las motivó, y tienen tests de regresión dedicados en `tests/unit/identidad/motor-scoring.test.ts`.

## Cómo se calibraron los pesos y umbrales — metodología, no intuición

`scripts/benchmark-identidad.ts` genera un corpus sintético (~365 pares, mutando programáticamente una lista base de nombres argentinos de dominio público — incluye a propósito los casos reales de los bugs de producción: Cejas, Barroso, Chazarreta), mide precisión/recall/F1/tiempo de cada algoritmo individual y del motor combinado, y busca el umbral de 3 vías (auto-vinculación / revisión manual / sin coincidencia) que maximiza F1 con **piso de precisión casi perfecta** en la banda de auto-vinculación — el costo de un falso positivo ahí es alto (vincula automáticamente a alguien que no corresponde). Resultado completo, actualizado cada vez que se corre el script: [`BENCHMARK-RESULTADOS.md`](./BENCHMARK-RESULTADOS.md).

Correr de nuevo tras cualquier cambio a `algoritmos.ts` o `motor-scoring.ts`:

```bash
node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/benchmark-identidad.ts
```

**Umbral configurado en producción**: `umbral_confianza_duplicados` en `ConfiguracionSistema` (editable desde Configuración, Fase 12), sembrado en `prisma/seed.ts` en 0.65 — un poco por encima del óptimo medido (0.61), como margen de seguridad adicional sobre el techo de 0.6 de las compuertas.

## Algoritmos evaluados y descartados, con justificación

Ver el encabezado de `algoritmos.ts` para el detalle completo. Resumen:

- **Implementados**: Levenshtein, Damerau-Levenshtein, Jaro, Jaro-Winkler, Sørensen-Dice, similitud coseno de n-gramas, Jaccard de tokens, Token Sort/Set/Partial Ratio (equivalentes de RapidFuzz reimplementados a mano, porque RapidFuzz es una librería de Python/Rust sin equivalente directo en Node), similitud por iniciales, huella digital estilo OpenRefine (fingerprint matching, para blocking/dedup exacto).
- **Descartados, con evidencia**: Soundex/Metaphone/Double Metaphone — algoritmos de fonética inglesa, documentados en la literatura como poco confiables para fonética española; sin evidencia de que los algoritmos ya implementados sean insuficientes, no se justificó el esfuerzo de adaptar uno al español. Queda como recomendación futura si aparece evidencia real de que hace falta.

## Escalabilidad

Este módulo asume que la lista de `candidatos` que recibe `evaluarCandidatos()` ya viene acotada por dos pasos previos, en este orden:

1. **Blocking por índice invertido de tokens** (`PersonaToken`, ver `lib/servicios/persona-token.service.ts`) — reemplaza, desde 2026-08-05, el blocking anterior por similitud de trigramas sobre el campo `apellido` completo (`PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md`: ese enfoque se volvía indulgente con apellidos cortos que comparten sufijos comunes del español por pura morfología compartida, sin relación real). `obtenerCandidatosPorApellido` (`deteccion-duplicados.ts`) y `obtenerCandidatosPorNombre` (`matching-padron.ts`) consultan `PersonaToken` por coincidencia exacta de token más variantes de tipeo acotadas por distancia de edición absoluta, nunca similitud normalizada de campo completo.
2. **Poda** (`lib/identidad/poda.ts`, capa 2.5) — descarta, antes del scoring, cualquier candidato sin ningún token compartido ni similitud real de apellido. Deliberadamente permisiva (prioriza recall).

Comparar contra los candidatos ya acotados por estos dos pasos es del orden de 0.1ms por comparación (ver tabla de tiempos en `BENCHMARK-RESULTADOS.md`) — miles de comparaciones por segundo, sin depender de cuota ni de latencia de red de un proveedor externo.

`PersonaToken` se mantiene sincronizado al crear/editar una Persona (`crearPersona`/`actualizarPersona` en `personas.service.ts`, vía `sincronizarTokensPersona`); las Personas que ya existían antes de esta tabla se poblaron con `scripts/backfill-persona-token.ts` (permanente, re-ejecutable si hiciera falta).

## Dónde entra la IA (y dónde no)

**En ningún lugar de este módulo decide la IA.** El único rol que le queda a la IA en el flujo de identidad es, potencialmente, ayudar a un humano a interpretar un caso de "revisión manual" ya clasificado por este motor (explicar en lenguaje natural por qué dos nombres se parecen o no) — una función de asistencia sobre una decisión que de todos modos toma una persona, nunca un reemplazo del cálculo de confianza. No está implementado en esta iteración (no hay evidencia de que la explicación ya generada por `calcularConfianzaIdentidad` — el arreglo `explicacion`, ya en español, ya legible — sea insuficiente); queda como recomendación futura si el feedback real de uso lo pide.

## Limitaciones honestas

- El corpus de calibración es sintético, no son casos reales confirmados por un humano de ATP. Es mejor evidencia que elegir pesos a mano, pero no reemplaza recalibrar el día que exista un conjunto real de fusiones/vinculaciones ya confirmadas.
- Hay una ambigüedad real e irreductible que ningún algoritmo de similitud léxica puede resolver solo: un apellido con un caracter de diferencia puede ser un typo del mismo apellido ("Gonzalez"/"Gonzales") o un apellido genuinamente distinto y parecido ("Fernandez"/"Hernandez") — sin DNI, teléfono, u otro dato adicional, no hay forma de saberlo con certeza. La decisión de diseño de este motor es tratar ambos casos igual (revisión manual, nunca auto-vinculación), priorizando precisión sobre recall en la banda automática — correcto para un sistema donde un falso positivo tiene consecuencia real (padrón: quién puede votar), aceptando como costo consciente que algunos typos genuinos generen más revisión manual de la estrictamente necesaria.

## Recomendaciones futuras

1. Recalibrar pesos/umbrales contra un dataset real de decisiones humanas confirmadas (fusiones aceptadas/rechazadas, vinculaciones de padrón confirmadas/revertidas) una vez que exista volumen suficiente.
2. Si aparece evidencia real de que la similitud léxica no alcanza para algún patrón de nombres específico del padrón de FCM-UNR, evaluar un algoritmo fonético adaptado al español (no Soundex/Metaphone tal cual).
3. Si el volumen de Personas crece mucho más allá del supuesto S4, mover el blocking a `pg_trgm` en SQL antes que agrandar el candidate set traído a Node.
4. Superficie de UI: mostrar el desglose de `explicacion` (ya estructurado, ver `EvidenciaSenal`) como una lista de checks en vez de solo el string plano `motivo` — hoy el dato ya existe pero se muestra como texto corrido en `CandidatoAmbiguo`/`ResultadoMatchingPadron`, no como checklist visual.
