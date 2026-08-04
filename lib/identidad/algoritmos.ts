// Motor de Resolución de Identidad — algoritmos de similitud de strings.
//
// Cada función acá adentro es pura, determinística y sin dependencias
// externas: mismo input, mismo output, siempre — a diferencia de una llamada
// a un modelo de IA (ver el bug real documentado en
// /REVISION-CRITICA-AUDITORIA-2026-08-04.md sección 1.2: la misma
// comparación de nombres le dio 60% de confianza a Gemini una vez y 85% la
// otra). Esa propiedad es la razón de ser de este módulo, no un detalle
// menor: una función determinística SÍ se puede testear con un caso fijo
// ("esta entrada siempre da este resultado"), cosa que un LLM no garantiza.
//
// Qué se implementó y qué no, con justificación (ver también
// lib/identidad/BENCHMARK-RESULTADOS.md para los números reales medidos):
//
// - Levenshtein, Damerau-Levenshtein, Jaro, Jaro-Winkler, Sørensen-Dice
//   (bigramas), Jaccard de tokens, Token Sort Ratio, Token Set Ratio, Partial
//   Ratio, similitud coseno de n-gramas: implementados acá.
// - RapidFuzz: es una librería de Python/Rust, no existe para Node/TS. Sus
//   tres métricas más usadas (token_sort_ratio, token_set_ratio,
//   partial_ratio) SÍ están implementadas acá a mano, con el mismo algoritmo
//   conceptual (normalizar tokens, alinear, calcular ratio sobre
//   Levenshtein) — es la forma correcta de "adoptar RapidFuzz" en este stack.
// - Soundex / Metaphone / Double Metaphone: deliberadamente NO
//   implementados. Ambos algoritmos codifican fonética del inglés (clases de
//   consonantes, vocales mudas) y están documentados en la literatura como
//   poco confiables para fonética española, que tiene un inventario de
//   fonemas distinto (sin vocales mudas, con pares que en español SÍ suenan
//   distinto pero un algoritmo pensado para inglés podría igualar mal, y
//   viceversa). Adaptar un algoritmo fonético al español específicamente
//   (colapsar b/v, ll/y, s/z/c ante e-i, g/j) es una mejora real posible pero
//   no evaluada todavía por falta de evidencia de que los algoritmos de
//   similitud de texto ya implementados sean insuficientes — queda como
//   recomendación futura en el documento de arquitectura, no implementado a
//   ciegas.
// - Fingerprint matching (estilo OpenRefine — clave de colisión por tokens
//   ordenados): implementado como `huellaDigital()` en normalizar.ts, se usa
//   como paso de blocking/dedup exacto antes de correr los algoritmos caros.

export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const filaAnterior = fila;
    fila = new Array(b.length + 1);
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(filaAnterior[j] + 1, fila[j - 1] + 1, filaAnterior[j - 1] + costo);
    }
  }
  return fila[b.length];
}

// Damerau-Levenshtein (variante "restricted"/OSA): suma la transposición de
// caracteres adyacentes como operación de costo 1 — el error de tipeo más
// común al escribir nombres a mano ("Preez" en vez de "Perez").
export function distanciaDamerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const d: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + costo);
      }
    }
  }
  return d[la][lb];
}

// Similitud normalizada (0-1) a partir de una distancia de edición.
function similitudDesdeDistancia(distancia: number, a: string, b: string): number {
  const largoMax = Math.max(a.length, b.length);
  if (largoMax === 0) return 1;
  return 1 - distancia / largoMax;
}

export function similitudLevenshtein(a: string, b: string): number {
  return similitudDesdeDistancia(distanciaLevenshtein(a, b), a, b);
}

export function similitudDamerauLevenshtein(a: string, b: string): number {
  return similitudDesdeDistancia(distanciaDamerauLevenshtein(a, b), a, b);
}

// Similitud de Jaro — pensada específicamente para nombres propios cortos
// (a diferencia de Levenshtein, no penaliza igual una transposición que un
// carácter completamente distinto). Base de Jaro-Winkler.
export function similitudJaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;

  const ventana = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const coincideA = new Array(la).fill(false);
  const coincideB = new Array(lb).fill(false);

  let coincidencias = 0;
  for (let i = 0; i < la; i++) {
    const desde = Math.max(0, i - ventana);
    const hasta = Math.min(i + ventana + 1, lb);
    for (let j = desde; j < hasta; j++) {
      if (coincideB[j] || a[i] !== b[j]) continue;
      coincideA[i] = true;
      coincideB[j] = true;
      coincidencias++;
      break;
    }
  }
  if (coincidencias === 0) return 0;

  let transposiciones = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!coincideA[i]) continue;
    while (!coincideB[k]) k++;
    if (a[i] !== b[k]) transposiciones++;
    k++;
  }
  transposiciones = Math.floor(transposiciones / 2);

  return (
    (coincidencias / la + coincidencias / lb + (coincidencias - transposiciones) / coincidencias) / 3
  );
}

// Jaro-Winkler: Jaro + bonificación por prefijo común (hasta 4 caracteres,
// factor estándar 0.1) — la mayoría de los errores de tipeo en nombres pasan
// en el medio o al final, no al principio, así que un prefijo idéntico es
// una señal fuerte de que es el mismo nombre (ver investigación citada en
// BENCHMARK-RESULTADOS.md: es el algoritmo con mejor desempeño reportado en
// la literatura específicamente para nombres de persona).
export function similitudJaroWinkler(a: string, b: string, factorPrefijo = 0.1): number {
  const jaro = similitudJaro(a, b);
  let prefijo = 0;
  const maxPrefijo = Math.min(4, a.length, b.length);
  while (prefijo < maxPrefijo && a[prefijo] === b[prefijo]) prefijo++;
  return jaro + prefijo * factorPrefijo * (1 - jaro);
}

function bigramas(texto: string): string[] {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length < 2) return t.length === 1 ? [t] : [];
  const resultado: string[] = [];
  for (let i = 0; i < t.length - 1; i++) resultado.push(t.slice(i, i + 2));
  return resultado;
}

// Sørensen-Dice sobre bigramas de caracteres: 2×|intersección| / (|A|+|B|).
// Buen desempate cuando Jaro-Winkler da valores intermedios, porque mide
// solapamiento de secuencias de 2 caracteres en vez de alineación posicional.
export function coeficienteDice(a: string, b: string): number {
  const bigA = bigramas(a);
  const bigB = bigramas(b);
  if (bigA.length === 0 && bigB.length === 0) return a === b ? 1 : 0;
  if (bigA.length === 0 || bigB.length === 0) return 0;

  const contadorB = new Map<string, number>();
  for (const bg of bigB) contadorB.set(bg, (contadorB.get(bg) ?? 0) + 1);

  let interseccion = 0;
  for (const bg of bigA) {
    const restante = contadorB.get(bg) ?? 0;
    if (restante > 0) {
      interseccion++;
      contadorB.set(bg, restante - 1);
    }
  }
  return (2 * interseccion) / (bigA.length + bigB.length);
}

// Similitud coseno sobre el mismo vector de n-gramas (n=2) que Dice, para
// comparar contra el benchmark — en la práctica correlaciona fuerte con Dice
// para strings cortos como nombres, se incluye por completitud del pedido.
export function similitudCosenoNGramas(a: string, b: string, n = 2): number {
  function ngramas(texto: string): Map<string, number> {
    const t = texto.replace(/\s+/g, " ").trim();
    const mapa = new Map<string, number>();
    if (t.length < n) {
      if (t.length > 0) mapa.set(t, 1);
      return mapa;
    }
    for (let i = 0; i <= t.length - n; i++) {
      const g = t.slice(i, i + n);
      mapa.set(g, (mapa.get(g) ?? 0) + 1);
    }
    return mapa;
  }
  const va = ngramas(a);
  const vb = ngramas(b);
  let producto = 0;
  for (const [g, count] of va) producto += count * (vb.get(g) ?? 0);
  const normaA = Math.sqrt([...va.values()].reduce((s, v) => s + v * v, 0));
  const normaB = Math.sqrt([...vb.values()].reduce((s, v) => s + v * v, 0));
  if (normaA === 0 || normaB === 0) return 0;
  return producto / (normaA * normaB);
}

// Jaccard sobre conjuntos de tokens (palabras completas, no caracteres) —
// la señal correcta para "mismo conjunto de palabras en cualquier orden",
// que es exactamente el problema de "Perez Juan" vs "Juan Perez".
export function jaccardTokens(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1;
  const interseccion = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : interseccion / union;
}

// Token Sort Ratio (equivalente al de RapidFuzz/FuzzyWuzzy): ordena los
// tokens alfabéticamente en ambos strings antes de comparar — hace que el
// orden Nombre/Apellido vs Apellido/Nombre deje de importar.
export function tokenSortRatio(tokensA: string[], tokensB: string[]): number {
  const a = [...tokensA].sort().join(" ");
  const b = [...tokensB].sort().join(" ");
  return similitudLevenshtein(a, b);
}

// Token Set Ratio (equivalente al de RapidFuzz/FuzzyWuzzy): separa tokens
// compartidos de los exclusivos de cada lado, y compara las combinaciones —
// tolera que un lado tenga tokens de más (ej. un segundo nombre que el otro
// no tiene) sin penalizar tanto como Token Sort Ratio.
export function tokenSetRatio(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const interseccion = [...setA].filter((t) => setB.has(t)).sort();
  const soloA = [...setA].filter((t) => !setB.has(t)).sort();
  const soloB = [...setB].filter((t) => !setA.has(t)).sort();

  const base = interseccion.join(" ");
  const combA = [base, soloA.join(" ")].filter(Boolean).join(" ");
  const combB = [base, soloB.join(" ")].filter(Boolean).join(" ");

  return Math.max(
    similitudLevenshtein(base, combA),
    similitudLevenshtein(base, combB),
    similitudLevenshtein(combA, combB),
  );
}

// Partial Ratio (equivalente al de RapidFuzz/FuzzyWuzzy): busca la mejor
// alineación del string más corto DENTRO del más largo — útil para
// "Juan Perez" vs "Juan Perez Garcia" (apellido materno de más), donde el
// string corto está genuinamente contenido en el largo.
export function partialRatio(a: string, b: string): number {
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length === 0) return largo.length === 0 ? 1 : 0;
  if (corto.length === largo.length) return similitudLevenshtein(corto, largo);

  let mejor = 0;
  for (let i = 0; i <= largo.length - corto.length; i++) {
    const ventana = largo.slice(i, i + corto.length);
    const s = similitudLevenshtein(corto, ventana);
    if (s > mejor) mejor = s;
    if (mejor === 1) break;
  }
  return mejor;
}

// Comparación por iniciales: para el caso "Juan I Perez" vs "Juan Ignacio
// Perez" — un token de una sola letra en un lado que coincide con la
// primera letra del token correspondiente del otro lado cuenta como
// coincidencia parcial (0.75, no 1 — es evidencia real pero más débil que
// una coincidencia exacta).
export function similitudPorIniciales(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const [cortos, largos] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  let puntaje = 0;
  const usados = new Set<number>();
  for (const token of cortos) {
    let mejorIndice = -1;
    let mejorValor = 0;
    for (let i = 0; i < largos.length; i++) {
      if (usados.has(i)) continue;
      const candidato = largos[i];
      let valor = 0;
      if (token === candidato) valor = 1;
      else if (token.length === 1 && candidato.startsWith(token)) valor = 0.75;
      else if (candidato.length === 1 && token.startsWith(candidato)) valor = 0.75;
      if (valor > mejorValor) {
        mejorValor = valor;
        mejorIndice = i;
      }
    }
    if (mejorIndice >= 0) {
      usados.add(mejorIndice);
      puntaje += mejorValor;
    }
  }
  return puntaje / Math.max(tokensA.length, tokensB.length);
}
