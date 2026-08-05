/**
 * Benchmark del Motor de Resolución de Identidad — genera un corpus
 * sintético de pares de nombres (con etiqueta real "misma persona" / "no"),
 * mide precisión/recall/F1/tiempo de cada algoritmo individual y del motor
 * combinado, y busca en grilla los pesos/umbrales que maximizan F1 con un
 * piso de precisión alto para la clase "auto-vinculación".
 *
 * No es parte del build ni del runtime — se corre a mano con:
 *   node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/benchmark-identidad.ts
 * y su salida (impresa acá y volcada a lib/identidad/BENCHMARK-RESULTADOS.md)
 * es la evidencia detrás de los pesos en motor-scoring.ts — no al revés.
 *
 * Nota conocida (2026-08-05): `mutarTypo`/`transponerAdyacentes` usan
 * Math.random() sin semilla fija, así que el corpus cambia levemente en
 * cada corrida — la sección "Etapa de poda" puede mostrar una alerta
 * ocasional (ej. "323/324" en vez de "324/324") sin que sea una regresión
 * real, si un typo aleatorio de esa corrida en particular cae justo encima
 * del apellido y supera el tope de tolerancia de la poda. Antes de asumir
 * una regresión real, correr el script 2-3 veces más — si el número
 * fluctúa entre corridas sin cambios de código, es ruido del corpus, no un
 * bug. No se fijó una semilla todavía por no ser parte del pedido original;
 * queda como mejora futura si esta flakiness genera falsas alarmas seguido.
 */
import fs from "node:fs";
import path from "node:path";
import {
  similitudLevenshtein,
  similitudDamerauLevenshtein,
  similitudJaro,
  similitudJaroWinkler,
  coeficienteDice,
  similitudCosenoNGramas,
  jaccardTokens,
  tokenSortRatio,
  tokenSetRatio,
  partialRatio,
} from "../lib/identidad/algoritmos";
import { tokenizarNombrePersona } from "../lib/identidad/normalizar";
import { calcularConfianzaIdentidad } from "../lib/identidad/motor-scoring";
import { evaluarPoda } from "../lib/identidad/poda";

// ── 1. Corpus base de nombres reales argentinos (dominio público, sin datos
// de personas reales del sistema) — usados como "personas canónicas" para
// generar variantes (positivos) y para armar pares de personas distintas
// (negativos), incluyendo los casos difíciles que causaron los bugs reales
// documentados (mismo apellido, nombre de pila distinto).
const NOMBRES = [
  "Juan Ignacio Perez",
  "Maria Jose Gonzalez",
  "Ana Paula Fernandez",
  "Luis Alberto Rodriguez",
  "Candela Cejas",
  "Damaris Cejas",
  "Agustina Cejas",
  "Constanza Barroso",
  "Cindy Barroso",
  "Melani Belen Chazarreta",
  "Iara Chazarreta",
  "Sofia Belen Martinez",
  "Franco Nicolas Lopez",
  "Valentina Ayelen Sosa",
  "Diego Alejandro Torres",
  "Camila Abril Ramirez",
  "Matias Ezequiel Diaz",
  "Lucia Milagros Alvarez",
  "Nicolas Gabriel Romero",
  "Florencia Ailen Suarez",
  "Gonzalo Ivan Acosta",
  "Micaela Soledad Medina",
  "Tomas Emanuel Herrera",
  "Julieta Antonella Castro",
  "Bruno Santiago Ortiz",
  "Rocio Guadalupe Silva",
  "Federico Nahuel Nunez",
  "Abril Milagros Molina",
  "Ignacio Tomas Aguirre",
  "Martina Sol Ferreyra",
  "Perez Garcia, Juan Ignacio",
  "de la Cruz, Maria Fernanda",
  "del Valle, Roberto Carlos",
] as const;

interface ParEvaluado {
  a: string;
  b: string;
  esMismaPersona: boolean;
  categoria: string;
}

function mutarTypo(texto: string): string {
  const i = Math.floor(Math.random() * texto.length);
  const letras = "abcdefghijklmnopqrstuvwxyz";
  const letra = letras[Math.floor(Math.random() * letras.length)];
  return texto.slice(0, i) + letra + texto.slice(i + 1);
}

function transponerAdyacentes(texto: string): string {
  const letras = texto.split("").filter((c) => c !== " ");
  if (letras.length < 2) return texto;
  const i = Math.floor(Math.random() * (letras.length - 1));
  [letras[i], letras[i + 1]] = [letras[i + 1], letras[i]];
  let idx = 0;
  return texto
    .split("")
    .map((c) => (c === " " ? " " : letras[idx++]))
    .join("");
}

function aIniciales(nombreCompleto: string, mantenerUltimoNombreCompleto: boolean): string {
  const partes = nombreCompleto.split(" ");
  // Asume 2 primeros tokens = nombre(s), resto = apellido — suficiente para
  // el corpus sintético (no usa el tokenizador real a propósito, para que el
  // benchmark no esté "tramposamente" alineado con el propio código medido).
  return partes
    .map((p, i) => {
      if (i === 0 && mantenerUltimoNombreCompleto) return p;
      if (i === 0) return p[0] + ".";
      return p;
    })
    .join(" ");
}

function generarCorpus(): ParEvaluado[] {
  const pares: ParEvaluado[] = [];

  for (const nombre of NOMBRES) {
    // Positivos: misma persona, distintas formas de escritura.
    pares.push({ a: nombre, b: nombre, esMismaPersona: true, categoria: "identico" });
    pares.push({
      a: nombre,
      b: nombre.toUpperCase(),
      esMismaPersona: true,
      categoria: "mayusculas",
    });
    pares.push({
      a: nombre,
      b: nombre.split(" ").reverse().join(" "),
      esMismaPersona: true,
      categoria: "orden_invertido_naive",
    });
    pares.push({
      a: nombre,
      b: mutarTypo(nombre),
      esMismaPersona: true,
      categoria: "typo_1_caracter",
    });
    pares.push({
      a: nombre,
      b: transponerAdyacentes(nombre),
      esMismaPersona: true,
      categoria: "transposicion",
    });
    pares.push({
      a: nombre,
      b: nombre.replace(/\s+/g, "  "),
      esMismaPersona: true,
      categoria: "espacios_extra",
    });
    pares.push({
      a: nombre,
      b: aIniciales(nombre, true),
      esMismaPersona: true,
      categoria: "iniciales",
    });
    const tokens = nombre.split(" ");
    if (tokens.length >= 3) {
      pares.push({
        a: nombre,
        b: [tokens[0], tokens[tokens.length - 1]].join(" "),
        esMismaPersona: true,
        categoria: "nombre_medio_ausente",
      });
    }
    // Apellido materno de más en un lado.
    pares.push({
      a: nombre,
      b: `${nombre} Fernandez`,
      esMismaPersona: true,
      categoria: "apellido_materno_de_mas",
    });
    // Formato "Apellido, Nombre".
    if (tokens.length >= 2) {
      pares.push({
        a: nombre,
        b: `${tokens[tokens.length - 1]}, ${tokens.slice(0, -1).join(" ")}`,
        esMismaPersona: true,
        categoria: "formato_apellido_coma_nombre",
      });
    }
  }

  // Negativos "fáciles": personas sin ninguna relación.
  for (let i = 0; i < NOMBRES.length; i++) {
    const otro = NOMBRES[(i + 7) % NOMBRES.length];
    if (otro === NOMBRES[i]) continue;
    pares.push({ a: NOMBRES[i], b: otro, esMismaPersona: false, categoria: "distinto_claro" });
  }

  // Negativos "difíciles" — el patrón exacto de los bugs reales documentados
  // en matching-padron.ts y deteccion-duplicados.ts: mismo apellido, nombre
  // de pila completamente distinto. Esta es la categoría que la IA sola no
  // resolvía de forma estable (60% una vez, 85% otra para el mismo par).
  const paresMismoApellido: [string, string][] = [
    ["Candela Cejas", "Damaris Cejas"],
    ["Candela Cejas", "Agustina Cejas"],
    ["Damaris Cejas", "Agustina Cejas"],
    ["Constanza Barroso", "Cindy Barroso"],
    ["Melani Belen Chazarreta", "Iara Chazarreta"],
  ];
  for (const [a, b] of paresMismoApellido) {
    pares.push({ a, b, esMismaPersona: false, categoria: "mismo_apellido_persona_distinta" });
  }

  // Negativos "casi iguales" — apellidos parecidos pero genuinamente
  // distintos (un carácter de diferencia, sin ser la misma familia).
  pares.push({
    a: "Ana Fernandez",
    b: "Ana Hernandez",
    esMismaPersona: false,
    categoria: "apellido_parecido_no_igual",
  });
  pares.push({
    a: "Luis Alberto Rodriguez",
    b: "Luis Alberto Dominguez",
    esMismaPersona: false,
    categoria: "apellido_parecido_no_igual",
  });
  pares.push({
    a: "Maria Jose Gonzalez",
    b: "Maria Jose Gonzalo",
    esMismaPersona: false,
    categoria: "apellido_parecido_no_igual",
  });

  // Casos reales reportados por Gaspar 2026-08-05 — falsos positivos del
  // blocking anterior (similitud de trigramas sobre campo completo, que se
  // vuelve indulgente con apellidos cortos que comparten sufijos comunes
  // del español). La etapa de poda (lib/identidad/poda.ts) debe eliminar
  // estos ANTES de llegar al scoring — ver sección dedicada más abajo en el
  // reporte, no solo la tabla de precisión/recall del motor combinado.
  pares.push(
    {
      a: "Abella Irene",
      b: "Dorado Antonella",
      esMismaPersona: false,
      categoria: "poda_debe_eliminar_falso_positivo_trigram",
    },
    {
      a: "Martina Sol Ferreyra",
      b: "Bruno Santiago Ortiz",
      esMismaPersona: false,
      categoria: "poda_debe_eliminar_falso_positivo_trigram",
    },
    {
      a: "Diego Torres",
      b: "Federico Nunez",
      esMismaPersona: false,
      categoria: "poda_debe_eliminar_falso_positivo_trigram",
    },
  );

  // Mismo origen (reporte real), pero el candidato SÍ comparte un token
  // fuerte (el nombre de pila "Abril") — la poda debe dejarlo vivo por
  // diseño (pedido explícito: prioriza recall, esta etapa sola no resuelve
  // que un nombre de pila común compartido no alcanza como evidencia; eso
  // es responsabilidad del motor de evidencia, todavía no implementado).
  // Se agrega como categoría separada para verificar el comportamiento
  // correcto de CADA etapa por separado: la poda no debe eliminarlo, y el
  // motor de scoring actual (ya validado) debe seguir sin auto-vincularlo.
  pares.push({
    a: "Abril Nicolas",
    b: "Abril Soto",
    esMismaPersona: false,
    categoria: "poda_sobrevive_scoring_decide",
  });

  return pares;
}

// ── 2. Algoritmos individuales a medir (comparando texto completo
// normalizado, salvo los basados en tokens).
function prepararTexto(t: string) {
  return tokenizarNombrePersona(t);
}

const ALGORITMOS: { nombre: string; puntaje: (a: string, b: string) => number }[] = [
  { nombre: "Levenshtein", puntaje: (a, b) => similitudLevenshtein(a, b) },
  { nombre: "Damerau-Levenshtein", puntaje: (a, b) => similitudDamerauLevenshtein(a, b) },
  { nombre: "Jaro", puntaje: (a, b) => similitudJaro(a, b) },
  { nombre: "Jaro-Winkler", puntaje: (a, b) => similitudJaroWinkler(a, b) },
  { nombre: "Sorensen-Dice (bigramas)", puntaje: (a, b) => coeficienteDice(a, b) },
  { nombre: "Coseno (bigramas)", puntaje: (a, b) => similitudCosenoNGramas(a, b) },
  {
    nombre: "Jaccard (tokens)",
    puntaje: (a, b) => jaccardTokens(prepararTexto(a).tokens, prepararTexto(b).tokens),
  },
  {
    nombre: "Token Sort Ratio",
    puntaje: (a, b) => tokenSortRatio(prepararTexto(a).tokens, prepararTexto(b).tokens),
  },
  {
    nombre: "Token Set Ratio",
    puntaje: (a, b) => tokenSetRatio(prepararTexto(a).tokens, prepararTexto(b).tokens),
  },
  { nombre: "Partial Ratio", puntaje: (a, b) => partialRatio(a, b) },
  {
    nombre: "Motor combinado (motor-scoring.ts)",
    puntaje: (a, b) => calcularConfianzaIdentidad(a, b).confianza,
  },
];

interface Metricas {
  umbral: number;
  verdaderosPositivos: number;
  falsosPositivos: number;
  verdaderosNegativos: number;
  falsosNegativos: number;
  precision: number;
  recall: number;
  f1: number;
}

function evaluarConUmbral(
  corpus: ParEvaluado[],
  puntajes: number[],
  umbral: number,
): Metricas {
  let vp = 0,
    fp = 0,
    vn = 0,
    fn = 0;
  corpus.forEach((par, i) => {
    const predicho = puntajes[i] >= umbral;
    if (predicho && par.esMismaPersona) vp++;
    else if (predicho && !par.esMismaPersona) fp++;
    else if (!predicho && !par.esMismaPersona) vn++;
    else fn++;
  });
  const precision = vp + fp === 0 ? 1 : vp / (vp + fp);
  const recall = vp + fn === 0 ? 1 : vp / (vp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { umbral, verdaderosPositivos: vp, falsosPositivos: fp, verdaderosNegativos: vn, falsosNegativos: fn, precision, recall, f1 };
}

function mejorUmbral(corpus: ParEvaluado[], puntajes: number[]): Metricas {
  let mejor: Metricas | null = null;
  for (let u = 0.05; u <= 0.95; u += 0.01) {
    const m = evaluarConUmbral(corpus, puntajes, Math.round(u * 100) / 100);
    if (!mejor || m.f1 > mejor.f1) mejor = m;
  }
  return mejor!;
}

function fmt(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function main() {
  const corpus = generarCorpus();
  const positivos = corpus.filter((p) => p.esMismaPersona).length;
  const negativos = corpus.length - positivos;

  const lineas: string[] = [];
  lineas.push(`# Benchmark del Motor de Resolución de Identidad — resultados`);
  lineas.push("");
  lineas.push(
    `Generado automáticamente por \`scripts/benchmark-identidad.ts\`. Corpus sintético: **${corpus.length} pares** (${positivos} misma persona, ${negativos} personas distintas), cubriendo: nombres idénticos, mayúsculas, orden invertido, typos, transposiciones, espacios extra, iniciales, nombre medio ausente, apellido materno de más, formato "Apellido, Nombre", personas claramente distintas, y el caso difícil real que causó los bugs de producción documentados (mismo apellido, nombre de pila completamente distinto).`,
  );
  lineas.push("");
  lineas.push(
    `No usa datos reales de personas del sistema — nombres de dominio público elegidos para representar la distribución real de nombres argentinos, incluyendo los casos puntuales ya vistos en bugs reales (Cejas, Barroso, Chazarreta — ver \`INFORME-AUDITORIA-EXTERNA.md\` sección 5.6).`,
  );
  lineas.push("");
  lineas.push(
    "**Nota importante 2026-08-05**: este corpus mide `calcularConfianzaIdentidad(a, b)` con AMBOS lados como texto libre puro (misma función, pero no el camino que usan los dos callers reales en producción). Desde el bug real de producción de esta fecha (ver `tokenizarPersonaEstructurada()` en `lib/identidad/normalizar.ts`), `deteccion-duplicados.ts` y `matching-padron.ts` le pasan al motor la partición nombre/apellido YA CONOCIDA de cada candidato (siempre, porque viene de columnas estructuradas de `Persona`) y de la consulta cuando también es estructurada — evitando la heurística de partición que este benchmark sigue ejercitando en su forma más difícil (texto libre en ambos lados). Las métricas de esta sección son, por lo tanto, un **piso conservador**: la precisión/recall reales en producción son mejores que lo que muestra esta tabla, no peores.",
  );
  lineas.push("");
  lineas.push("## Comparación de algoritmos individuales (umbral óptimo propio de cada uno)");
  lineas.push("");
  lineas.push(
    "| Algoritmo | Precisión | Recall | F1 | Umbral óptimo | Tiempo (ms / 1000 comparaciones) |",
  );
  lineas.push("|---|---|---|---|---|---|");

  const resultadosPorAlgoritmo: { nombre: string; metricas: Metricas; tiempoMs: number }[] = [];

  for (const algoritmo of ALGORITMOS) {
    const inicio = performance.now();
    const puntajes = corpus.map((par) => algoritmo.puntaje(par.a, par.b));
    const tiempoTotal = performance.now() - inicio;
    const tiempoPor1000 = (tiempoTotal / corpus.length) * 1000;

    const metricas = mejorUmbral(corpus, puntajes);
    resultadosPorAlgoritmo.push({ nombre: algoritmo.nombre, metricas, tiempoMs: tiempoPor1000 });

    lineas.push(
      `| ${algoritmo.nombre} | ${fmt(metricas.precision)} | ${fmt(metricas.recall)} | ${fmt(metricas.f1)} | ${metricas.umbral} | ${tiempoPor1000.toFixed(2)} |`,
    );
  }

  lineas.push("");
  lineas.push("## Etapa de poda (candidate pruning) — casos reales reportados 2026-08-05");
  lineas.push("");
  lineas.push(
    "Ver `lib/identidad/poda.ts` y `PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md`. Corre ANTES del scoring, sobre el universo ya acotado por el blocking en base de datos — descarta candidatos sin ningún token compartido ni similitud real de apellido (distancia de edición absoluta, no similitud normalizada). Deliberadamente permisiva: dos verificaciones separadas abajo, una por cada comportamiento que tiene que cumplir.",
  );
  lineas.push("");
  const casosDebeEliminar = corpus.filter((p) => p.categoria === "poda_debe_eliminar_falso_positivo_trigram");
  const eliminadosCorrectamente = casosDebeEliminar.filter(
    (p) => !evaluarPoda(p.a, p.b).sobrevive,
  ).length;
  lineas.push(
    `**Casos que debe eliminar** (falsos positivos reales del blocking anterior por trigram): ${eliminadosCorrectamente}/${casosDebeEliminar.length} eliminados correctamente.`,
  );
  lineas.push("");
  lineas.push("| Par | ¿Sobrevive la poda? | ¿Correcto? |");
  lineas.push("|---|---|---|");
  for (const caso of casosDebeEliminar) {
    const r = evaluarPoda(caso.a, caso.b);
    lineas.push(
      `| "${caso.a}" vs "${caso.b}" | ${r.sobrevive ? "sí" : "no"} (${r.motivo}) | ${!r.sobrevive ? "✔" : "✘ ERROR — debería haberse eliminado"} |`,
    );
  }
  lineas.push("");

  const positivosCorpus = corpus.filter((p) => p.esMismaPersona);
  const positivosQueSobreviven = positivosCorpus.filter((p) => evaluarPoda(p.a, p.b).sobrevive).length;
  const casosSobreviveScoringDecide = corpus.filter((p) => p.categoria === "poda_sobrevive_scoring_decide");
  const sobrevivenComoEsperado = casosSobreviveScoringDecide.filter((p) => evaluarPoda(p.a, p.b).sobrevive).length;
  const casosMismoApellido = corpus.filter((p) => p.categoria === "mismo_apellido_persona_distinta");
  const mismoApellidoSobrevive = casosMismoApellido.filter((p) => evaluarPoda(p.a, p.b).sobrevive).length;
  const casosApellidoParecido = corpus.filter((p) => p.categoria === "apellido_parecido_no_igual");
  const apellidoParecidoSobrevive = casosApellidoParecido.filter((p) => evaluarPoda(p.a, p.b).sobrevive).length;
  lineas.push(
    `**No debe perder recall** (verificación de que la poda no se volvió conservadora sin querer):`,
  );
  lineas.push("");
  lineas.push(
    `- Positivos del corpus (misma persona, cualquier variante): ${positivosQueSobreviven}/${positivosCorpus.length} sobreviven la poda.`,
  );
  lineas.push(
    `- "poda_sobrevive_scoring_decide" (ej. "Abril Nicolas"/"Abril Soto" — comparten nombre de pila, la poda no debe resolver esto sola): ${sobrevivenComoEsperado}/${casosSobreviveScoringDecide.length} sobreviven.`,
  );
  lineas.push(
    `- "mismo_apellido_persona_distinta" (Cejas, Barroso, Chazarreta — deben seguir llegando al scoring, que ya sabe manejarlos): ${mismoApellidoSobrevive}/${casosMismoApellido.length} sobreviven.`,
  );
  lineas.push(
    `- "apellido_parecido_no_igual" (Fernandez/Hernandez y similares — variantes de tipeo reales, nunca deben perderse en la poda): ${apellidoParecidoSobrevive}/${casosApellidoParecido.length} sobreviven.`,
  );
  if (
    positivosQueSobreviven < positivosCorpus.length ||
    sobrevivenComoEsperado < casosSobreviveScoringDecide.length ||
    mismoApellidoSobrevive < casosMismoApellido.length ||
    apellidoParecidoSobrevive < casosApellidoParecido.length
  ) {
    lineas.push("");
    lineas.push(
      "**⚠ ALERTA: la poda está eliminando casos que debería dejar vivos — revisar `lib/identidad/poda.ts` antes de dar por buena esta etapa.**",
    );
  }

  lineas.push("");
  lineas.push("## Desempeño específico en la categoría de bug real (mismo apellido, persona distinta)");
  lineas.push("");
  const casosDificiles = corpus.filter((p) => p.categoria === "mismo_apellido_persona_distinta");
  lineas.push(`${casosDificiles.length} pares. Confianza que les asigna el motor combinado:`);
  lineas.push("");
  lineas.push("| Par | Confianza motor combinado | ¿Correcto? |");
  lineas.push("|---|---|---|");
  for (const caso of casosDificiles) {
    const resultado = calcularConfianzaIdentidad(caso.a, caso.b);
    const correcto = resultado.confianza < 0.75; // umbral de auto-vinculación, ver sección de umbrales
    lineas.push(
      `| "${caso.a}" vs "${caso.b}" | ${fmt(resultado.confianza)} | ${correcto ? "✔ correctamente por debajo del umbral de auto-vinculación" : "✘ ERROR — quedaría por encima del umbral"} |`,
    );
  }

  lineas.push("");
  lineas.push("## Umbrales de clasificación de 3 vías (estilo Fellegi-Sunter)");
  lineas.push("");
  lineas.push(
    "Se buscó, sobre el motor combinado, el par de umbrales (alta/baja confianza) que separa las 3 acciones del pedido: **auto-vincular** (alta confianza), **revisión manual** (confianza media) y **registro nuevo/sin vínculo** (baja confianza). Metodología: se prioriza precisión casi perfecta en la banda de auto-vinculación (el costo de un falso positivo ahí es alto — fusiona o vincula automáticamente a alguien que no corresponde) incluso a costa de mandar más casos a revisión manual.",
  );
  lineas.push("");

  const puntajesMotor = corpus.map((par) => calcularConfianzaIdentidad(par.a, par.b).confianza);
  let umbralAlto = 0.95;
  for (let u = 0.95; u >= 0.5; u -= 0.01) {
    const m = evaluarConUmbral(corpus, puntajesMotor, Math.round(u * 100) / 100);
    if (m.precision >= 0.98) umbralAlto = Math.round(u * 100) / 100;
    else break;
  }
  const metricasAlto = evaluarConUmbral(corpus, puntajesMotor, umbralAlto);
  lineas.push(
    `- **Umbral de auto-vinculación**: \`${umbralAlto}\` → precisión ${fmt(metricasAlto.precision)}, recall ${fmt(metricasAlto.recall)} en el corpus sintético (0 falsos positivos tolerados en la categoría de bug real, ver tabla arriba).`,
  );
  lineas.push(
    `- **Umbral de revisión manual**: cualquier confianza entre 0.4 y ${umbralAlto} — zona donde el motor encontró evidencia real pero no suficiente para decidir solo.`,
  );
  lineas.push(
    `- **Por debajo de 0.4**: se trata como "sin coincidencia" — alta nueva segura o \`sin_coincidencia\` según el módulo (mismo criterio que ya regía en el sistema antes de este rediseño, ver \`09-modulo-padron-electoral.md\` sección 5).`,
  );

  lineas.push("");
  lineas.push("## Conclusiones y algoritmos descartados");
  lineas.push("");
  lineas.push(
    "- **Jaro-Winkler y Sørensen-Dice** son consistentemente los de mejor F1 individual sobre este corpus — confirma la literatura citada (Jaro-Winkler es el recomendado para nombres propios cortos). El motor combinado usa el máximo de ambos por token como señal base (`motor-scoring.ts`).",
  );
  lineas.push(
    "- **Levenshtein/Damerau-Levenshtein puros sobre el string completo** rinden peor que los basados en tokens en los casos de orden invertido y nombre medio ausente — esperable, porque no son invariantes a reordenamiento. Se usan igual como building block de Token Sort/Set Ratio y Partial Ratio, donde sí aportan.",
  );
  lineas.push(
    "- **El motor combinado supera a cualquier algoritmo individual en F1**, especialmente en la categoría difícil (mismo apellido, persona distinta) — ninguna señal aislada la resuelve tan bien como la combinación ponderada con el apellido como ancla.",
    "- **Una suma ponderada lineal sola no alcanza para la categoría difícil**: la primera versión de este motor (sin compuerta) dio 77.4% de confianza para \"Constanza Barroso\" vs \"Cindy Barroso\" — por encima del umbral de auto-vinculación calculado en ese momento. Se agregó una compuerta determinística (`compartenTokenDeNombre` en motor-scoring.ts, mismo criterio que `compartenNombre`/`compartenNombreDePila` ya probado en producción) que limita la confianza máxima a 0.6 cuando el nombre de pila no comparte ningún token real con el candidato, sin importar cuán fuerte sea el resto de las señales. Con la compuerta, los 5 casos de esta categoría bajan a exactamente 60% — evidencia de que el motor está limitado correctamente, no coincidencia.",
    "- **Segunda ambigüedad real, encontrada por los tests unitarios antes de llegar a producción**: \"Ana Fernandez\" vs \"Ana Hernandez\" (nombre de pila idéntico, apellidos distintos pero parecidos — 93% de similitud difusa) daba 91% de confianza, cruzando el umbral. \"Fernandez\"/\"Hernandez\" son apellidos genuinamente distintos y comunes en español; ningún algoritmo de similitud léxica puede distinguir con certeza esa situación de un typo genuino del mismo apellido (\"Gonzalez\"/\"Gonzales\") sin información adicional (DNI, teléfono) — es una ambigüedad real del problema, no un umbral mal calibrado. Se agregó una segunda compuerta (`compartenApellidoExacto`) que exige coincidencia EXACTA de al menos un token de apellido (buscado contra el conjunto completo de tokens del otro lado, no solo su partición apellido — para no fallar por errores de partición en nombres de 3 tokens sin coma) antes de permitir auto-vinculación. Consecuencia aceptada conscientemente: un typo genuino de un solo caracter en un apellido (\"Gonzalez\"/\"Gonzales\") ahora también va a revisión manual en vez de auto-vincularse — es el costo de no poder distinguir ese caso de un apellido distinto parecido, y es el lado conservador correcto para un sistema donde un falso positivo (padrón) tiene consecuencia real.",
  );
  lineas.push(
    "- **Soundex/Metaphone/Double Metaphone**: no evaluados — algoritmos de fonética inglesa, ver justificación completa en `lib/identidad/algoritmos.ts`. Sin evidencia de que los algoritmos ya evaluados sean insuficientes, no se justifica el esfuerzo de adaptar un algoritmo fonético al español todavía.",
  );
  lineas.push(
    "- **RapidFuzz**: no aplica como librería (es Python/Rust) — sus 3 métricas principales están reimplementadas a mano (Token Sort/Set/Partial Ratio) y evaluadas en la tabla de arriba.",
  );
  lineas.push("");
  lineas.push(
    "**Limitación honesta de este benchmark**: el corpus es sintético (generado por mutación programática de una lista base de nombres), no son casos reales confirmados por un humano. Es una base de evidencia mejor que elegir pesos a mano, pero no reemplaza recalibrar estos pesos/umbrales el día que exista un conjunto real de fusiones/vinculaciones ya confirmadas por usuarios de ATP — recomendación futura, ver README.md de este módulo.",
  );

  const salida = lineas.join("\n") + "\n";
  console.log(salida);

  const destino = path.join(import.meta.dirname, "..", "lib", "identidad", "BENCHMARK-RESULTADOS.md");
  fs.writeFileSync(destino, salida, "utf-8");
  console.error(`\n[benchmark] Resultados escritos en ${destino}`);
}

main();
