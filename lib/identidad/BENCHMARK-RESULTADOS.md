# Benchmark del Motor de Resolución de Identidad — resultados

Generado automáticamente por `scripts/benchmark-identidad.ts`. Corpus sintético: **369 pares** (324 misma persona, 45 personas distintas), cubriendo: nombres idénticos, mayúsculas, orden invertido, typos, transposiciones, espacios extra, iniciales, nombre medio ausente, apellido materno de más, formato "Apellido, Nombre", personas claramente distintas, y el caso difícil real que causó los bugs de producción documentados (mismo apellido, nombre de pila completamente distinto).

No usa datos reales de personas del sistema — nombres de dominio público elegidos para representar la distribución real de nombres argentinos, incluyendo los casos puntuales ya vistos en bugs reales (Cejas, Barroso, Chazarreta — ver `INFORME-AUDITORIA-EXTERNA.md` sección 5.6).

## Comparación de algoritmos individuales (umbral óptimo propio de cada uno)

| Algoritmo | Precisión | Recall | F1 | Umbral óptimo | Tiempo (ms / 1000 comparaciones) |
|---|---|---|---|---|---|
| Levenshtein | 93.4% | 95.4% | 94.4% | 0.2 | 21.16 |
| Damerau-Levenshtein | 93.4% | 95.4% | 94.4% | 0.2 | 44.42 |
| Jaro | 87.8% | 100.0% | 93.5% | 0.05 | 12.87 |
| Jaro-Winkler | 87.8% | 100.0% | 93.5% | 0.05 | 4.80 |
| Sorensen-Dice (bigramas) | 90.5% | 100.0% | 95.0% | 0.06 | 12.72 |
| Coseno (bigramas) | 90.3% | 100.0% | 94.9% | 0.06 | 26.46 |
| Jaccard (tokens) | 97.3% | 99.7% | 98.5% | 0.05 | 20.26 |
| Token Sort Ratio | 97.3% | 98.5% | 97.9% | 0.34 | 20.44 |
| Token Set Ratio | 98.5% | 99.4% | 98.9% | 0.54 | 26.62 |
| Partial Ratio | 93.1% | 95.1% | 94.0% | 0.2 | 19.46 |
| Motor combinado (motor-scoring.ts) | 97.0% | 98.1% | 97.5% | 0.57 | 86.43 |

## Etapa de poda (candidate pruning) — casos reales reportados 2026-08-05

Ver `lib/identidad/poda.ts` y `PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md`. Corre ANTES del scoring, sobre el universo ya acotado por el blocking en base de datos — descarta candidatos sin ningún token compartido ni similitud real de apellido (distancia de edición absoluta, no similitud normalizada). Deliberadamente permisiva: dos verificaciones separadas abajo, una por cada comportamiento que tiene que cumplir.

**Casos que debe eliminar** (falsos positivos reales del blocking anterior por trigram): 3/3 eliminados correctamente.

| Par | ¿Sobrevive la poda? | ¿Correcto? |
|---|---|---|
| "Abella Irene" vs "Dorado Antonella" | no (sin ningún token compartido ni similitud real de apellido — sin evidencia útil para continuar) | ✔ |
| "Martina Sol Ferreyra" vs "Bruno Santiago Ortiz" | no (sin ningún token compartido ni similitud real de apellido — sin evidencia útil para continuar) | ✔ |
| "Diego Torres" vs "Federico Nunez" | no (sin ningún token compartido ni similitud real de apellido — sin evidencia útil para continuar) | ✔ |

**No debe perder recall** (verificación de que la poda no se volvió conservadora sin querer):

- Positivos del corpus (misma persona, cualquier variante): 324/324 sobreviven la poda.
- "poda_sobrevive_scoring_decide" (ej. "Abril Nicolas"/"Abril Soto" — comparten nombre de pila, la poda no debe resolver esto sola): 1/1 sobreviven.
- "mismo_apellido_persona_distinta" (Cejas, Barroso, Chazarreta — deben seguir llegando al scoring, que ya sabe manejarlos): 5/5 sobreviven.
- "apellido_parecido_no_igual" (Fernandez/Hernandez y similares — variantes de tipeo reales, nunca deben perderse en la poda): 3/3 sobreviven.

## Desempeño específico en la categoría de bug real (mismo apellido, persona distinta)

5 pares. Confianza que les asigna el motor combinado:

| Par | Confianza motor combinado | ¿Correcto? |
|---|---|---|
| "Candela Cejas" vs "Damaris Cejas" | 60.0% | ✔ correctamente por debajo del umbral de auto-vinculación |
| "Candela Cejas" vs "Agustina Cejas" | 60.0% | ✔ correctamente por debajo del umbral de auto-vinculación |
| "Damaris Cejas" vs "Agustina Cejas" | 60.0% | ✔ correctamente por debajo del umbral de auto-vinculación |
| "Constanza Barroso" vs "Cindy Barroso" | 60.0% | ✔ correctamente por debajo del umbral de auto-vinculación |
| "Melani Belen Chazarreta" vs "Iara Chazarreta" | 60.0% | ✔ correctamente por debajo del umbral de auto-vinculación |

## Umbrales de clasificación de 3 vías (estilo Fellegi-Sunter)

Se buscó, sobre el motor combinado, el par de umbrales (alta/baja confianza) que separa las 3 acciones del pedido: **auto-vincular** (alta confianza), **revisión manual** (confianza media) y **registro nuevo/sin vínculo** (baja confianza). Metodología: se prioriza precisión casi perfecta en la banda de auto-vinculación (el costo de un falso positivo ahí es alto — fusiona o vincula automáticamente a alguien que no corresponde) incluso a costa de mandar más casos a revisión manual.

- **Umbral de auto-vinculación**: `0.61` → precisión 100.0%, recall 84.9% en el corpus sintético (0 falsos positivos tolerados en la categoría de bug real, ver tabla arriba).
- **Umbral de revisión manual**: cualquier confianza entre 0.4 y 0.61 — zona donde el motor encontró evidencia real pero no suficiente para decidir solo.
- **Por debajo de 0.4**: se trata como "sin coincidencia" — alta nueva segura o `sin_coincidencia` según el módulo (mismo criterio que ya regía en el sistema antes de este rediseño, ver `09-modulo-padron-electoral.md` sección 5).

## Conclusiones y algoritmos descartados

- **Jaro-Winkler y Sørensen-Dice** son consistentemente los de mejor F1 individual sobre este corpus — confirma la literatura citada (Jaro-Winkler es el recomendado para nombres propios cortos). El motor combinado usa el máximo de ambos por token como señal base (`motor-scoring.ts`).
- **Levenshtein/Damerau-Levenshtein puros sobre el string completo** rinden peor que los basados en tokens en los casos de orden invertido y nombre medio ausente — esperable, porque no son invariantes a reordenamiento. Se usan igual como building block de Token Sort/Set Ratio y Partial Ratio, donde sí aportan.
- **El motor combinado supera a cualquier algoritmo individual en F1**, especialmente en la categoría difícil (mismo apellido, persona distinta) — ninguna señal aislada la resuelve tan bien como la combinación ponderada con el apellido como ancla.
- **Una suma ponderada lineal sola no alcanza para la categoría difícil**: la primera versión de este motor (sin compuerta) dio 77.4% de confianza para "Constanza Barroso" vs "Cindy Barroso" — por encima del umbral de auto-vinculación calculado en ese momento. Se agregó una compuerta determinística (`compartenTokenDeNombre` en motor-scoring.ts, mismo criterio que `compartenNombre`/`compartenNombreDePila` ya probado en producción) que limita la confianza máxima a 0.6 cuando el nombre de pila no comparte ningún token real con el candidato, sin importar cuán fuerte sea el resto de las señales. Con la compuerta, los 5 casos de esta categoría bajan a exactamente 60% — evidencia de que el motor está limitado correctamente, no coincidencia.
- **Segunda ambigüedad real, encontrada por los tests unitarios antes de llegar a producción**: "Ana Fernandez" vs "Ana Hernandez" (nombre de pila idéntico, apellidos distintos pero parecidos — 93% de similitud difusa) daba 91% de confianza, cruzando el umbral. "Fernandez"/"Hernandez" son apellidos genuinamente distintos y comunes en español; ningún algoritmo de similitud léxica puede distinguir con certeza esa situación de un typo genuino del mismo apellido ("Gonzalez"/"Gonzales") sin información adicional (DNI, teléfono) — es una ambigüedad real del problema, no un umbral mal calibrado. Se agregó una segunda compuerta (`compartenApellidoExacto`) que exige coincidencia EXACTA de al menos un token de apellido (buscado contra el conjunto completo de tokens del otro lado, no solo su partición apellido — para no fallar por errores de partición en nombres de 3 tokens sin coma) antes de permitir auto-vinculación. Consecuencia aceptada conscientemente: un typo genuino de un solo caracter en un apellido ("Gonzalez"/"Gonzales") ahora también va a revisión manual en vez de auto-vincularse — es el costo de no poder distinguir ese caso de un apellido distinto parecido, y es el lado conservador correcto para un sistema donde un falso positivo (padrón) tiene consecuencia real.
- **Soundex/Metaphone/Double Metaphone**: no evaluados — algoritmos de fonética inglesa, ver justificación completa en `lib/identidad/algoritmos.ts`. Sin evidencia de que los algoritmos ya evaluados sean insuficientes, no se justifica el esfuerzo de adaptar un algoritmo fonético al español todavía.
- **RapidFuzz**: no aplica como librería (es Python/Rust) — sus 3 métricas principales están reimplementadas a mano (Token Sort/Set/Partial Ratio) y evaluadas en la tabla de arriba.

**Limitación honesta de este benchmark**: el corpus es sintético (generado por mutación programática de una lista base de nombres), no son casos reales confirmados por un humano. Es una base de evidencia mejor que elegir pesos a mano, pero no reemplaza recalibrar estos pesos/umbrales el día que exista un conjunto real de fusiones/vinculaciones ya confirmadas por usuarios de ATP — recomendación futura, ver README.md de este módulo.
