import {
  similitudJaroWinkler,
  coeficienteDice,
  jaccardTokens,
  tokenSortRatio,
  tokenSetRatio,
  partialRatio,
  similitudPorIniciales,
} from "./algoritmos";
import {
  tokenizarNombrePersona,
  CATALOGO_LEXICO_VACIO,
  type NombrePersonaTokenizado,
  type CatalogoLexicoIdentidad,
} from "./normalizar";

// Motor de scoring del Identity Resolution Engine — capa 3 (ver
// lib/identidad/README.md para el diagrama completo de arquitectura).
//
// No es un promedio simple de todas las señales (pedido explícito: "no
// quiero un promedio simple, quiero un modelo justificable"). Es una
// combinación lineal ponderada al estilo Fellegi-Sunter (cada señal aporta
// "evidencia" hacia la hipótesis de que son la misma persona, con un peso
// que refleja cuánta confianza merece esa señal específica), con los pesos
// calibrados empíricamente contra el benchmark sintético (ver
// scripts/benchmark-identidad.ts y BENCHMARK-RESULTADOS.md) — no elegidos a
// mano por intuición.
//
// Señales, de mayor a menor peso:
// 1. Apellido: la señal más fuerte y más estable en nombres argentinos (casi
//    siempre presente, cambia poco entre formularios de la misma persona).
// 2. Nombre de pila (incluye tolerancia a iniciales y nombre compuesto
//    parcial).
// 3. Orden/conjunto completo de tokens (token set/sort ratio): captura casos
//    donde la partición nombre/apellido de la tokenización se equivocó.
// 4. Bonus de coincidencia exacta de tokens: evidencia dura adicional.

export interface EvidenciaSenal {
  nombre: string;
  valor: number;
  peso: number;
  aporte: number;
  descripcion: string;
}

export interface ResultadoScoring {
  confianza: number;
  evidencias: EvidenciaSenal[];
  // Texto legible listo para mostrar en UI — pedido explícito de
  // explicabilidad ("no quiero una caja negra").
  explicacion: string[];
}

// Pesos calibrados en scripts/benchmark-identidad.ts (búsqueda en grilla
// sobre el corpus sintético, maximizando F1 con un piso de precisión alto
// para el umbral de auto-vinculación — ver metodología en
// BENCHMARK-RESULTADOS.md). Viven como constantes acá, no hardcodeadas
// inline, para que quede clara la trazabilidad hacia ese documento.
export const PESOS_MOTOR_IDENTIDAD = {
  apellido: 0.42,
  nombre: 0.3,
  conjuntoCompleto: 0.2,
  bonusExactos: 0.08,
} as const;

function similitudMultiAlgoritmo(a: string, b: string): number {
  if (!a || !b) return 0;
  // Máximo entre Jaro-Winkler (mejor desempeño reportado para nombres
  // propios cortos, ver investigación citada en BENCHMARK-RESULTADOS.md) y
  // Dice de bigramas (mejor cuando hay reordenamiento interno de sílabas o
  // errores que rompen el prefijo, donde Jaro-Winkler pierde su bonus). El
  // benchmark confirma que ningún algoritmo solo domina en todos los casos.
  return Math.max(similitudJaroWinkler(a, b), coeficienteDice(a, b));
}

// Similitud entre dos listas de tokens (ej. los tokens de apellido de A
// contra los de B): promedio de la mejor coincidencia de cada token del lado
// más corto contra el más largo, más tolerante que exigir igual cantidad de
// tokens de cada lado (cubre apellido compuesto/materno de más en un lado).
function similitudListaTokens(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [cortos, largos] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  let suma = 0;
  for (const token of cortos) {
    let mejor = 0;
    for (const otro of largos) {
      const s = similitudMultiAlgoritmo(token, otro);
      if (s > mejor) mejor = s;
    }
    suma += mejor;
  }
  return suma / cortos.length;
}

function contarTokensExactosCompartidos(a: NombrePersonaTokenizado, b: NombrePersonaTokenizado): number {
  const setB = new Set(b.tokens);
  return a.tokens.filter((t) => t.length >= 2 && setB.has(t)).length;
}

// Verificación estricta (no difusa) de que el nombre de pila comparte al
// menos un token real — mismo criterio ya probado en producción en
// `compartenNombre` (deteccion-duplicados.ts) y `compartenNombreDePila`
// (matching-padron.ts) antes de este rediseño. Se usa acá como compuerta,
// deliberadamente MÁS estricta que la señal difusa de similitud de nombre:
// medido con el benchmark real, una similitud difusa (Jaro-Winkler/Dice)
// entre nombres de pila cortos y sin relación puede dar valores
// sorprendentemente altos por azar (ej. "Constanza" vs "Cindy" da ~59% de
// similitud difusa solo por compartir la letra inicial y algunos caracteres
// en posiciones parecidas) — no es un umbral que se pueda subir un poco y
// confiar, hace falta una regla binaria de contención de substring.
function compartenTokenDeNombre(tokensA: string[], tokensB: string[]): boolean {
  const validosA = tokensA.filter((t) => t.length >= 3);
  const validosB = tokensB.filter((t) => t.length >= 3);
  if (validosA.length === 0 || validosB.length === 0) return true; // sin evidencia suficiente para vetar
  return validosA.some((ta) => validosB.some((tb) => ta === tb || ta.includes(tb) || tb.includes(ta)));
}

// Verificación estricta de apellido — deliberadamente NO compara solo contra
// la partición apellido/nombre del otro lado (tokenizarNombrePersona() es
// una heurística sobre texto sin coma, ver normalizar.ts: para 3 tokens sin
// coma puede partir mal — "Juan Perez Garcia" se lee como nombre="Juan
// Perez", apellido="Garcia"). Si comparara solo apellido-contra-apellido,
// "Juan Perez" vs "Juan Perez Garcia" fallaría esta verificación por un
// error de partición, no por una diferencia real. Por eso busca el/los
// tokens de apellido de CADA lado contra el conjunto COMPLETO de tokens del
// otro lado — así "perez" se encuentra igual, esté donde esté partido.
//
// Deliberadamente exige coincidencia EXACTA, no difusa (a diferencia de
// compartenTokenDeNombre) — medido con el benchmark real: "Fernandez" vs
// "Hernandez" (apellidos distintos, comunes ambos en español) da 93% de
// similitud difusa, indistinguible en la práctica de un typo genuino de un
// solo apellido ("Gonzalez"/"Gonzales"). Ningún algoritmo de similitud
// léxica puede resolver con certeza esa ambigüedad sin información adicional
// (DNI, teléfono) — es real, no un umbral mal calibrado. La respuesta
// conservadora correcta es tratar ambos casos igual: sin coincidencia
// EXACTA de al menos un token de apellido, no hay evidencia suficiente para
// auto-vincular, van a revisión manual.
function compartenApellidoExacto(a: NombrePersonaTokenizado, b: NombrePersonaTokenizado): boolean {
  const apellidoA = a.tokensApellido.filter((t) => t.length >= 4);
  const apellidoB = b.tokensApellido.filter((t) => t.length >= 4);
  if (apellidoA.length === 0 && apellidoB.length === 0) return true; // sin evidencia suficiente para vetar
  const todosA = new Set(a.tokens);
  const todosB = new Set(b.tokens);
  return apellidoA.some((t) => todosB.has(t)) || apellidoB.some((t) => todosA.has(t));
}

// Similitud CONSERVADORA entre dos tokens — a diferencia de
// similitudMultiAlgoritmo (que toma el MÁXIMO de Jaro-Winkler y Dice, para
// favorecer recall al detectar que dos strings SÍ se parecen), acá se toma
// el MÍNIMO de los dos. Motivo, encontrado con el benchmark real: Jaro
// pondera fuerte el término `coincidencias/largoMenor`, así que dos
// palabras de longitud muy distinta que comparten apenas 2 caracteres
// pueden dar un Jaro-Winkler ~60% (ej. "nicolas" vs "soto" comparten las
// letras "o" y "s" en posiciones dentro de la ventana de Jaro) sin ninguna
// relación real — Dice de bigramas, en cambio, da 0% para ese mismo par
// (ningún bigrama de 2 caracteres en común). Para decidir "¿hay evidencia
// real de que estas dos palabras estén relacionadas?" (a diferencia de "¿se
// parecen por ALGUNA medida?"), exigir que AMBAS métricas coincidan es más
// conservador y evita el falso positivo que dio el máximo.
function similitudConservadora(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.min(similitudJaroWinkler(a, b), coeficienteDice(a, b));
}

// Mejor similitud DIFUSA (conservadora) entre los tokens de apellido de un
// lado y del otro — DIRECTA (apellido-contra-apellido), no "contra el
// conjunto completo de tokens" como compartenApellidoExacto.
//
// Segunda vuelta de este diseño (bug real 2026-08-05, ver
// tokenizarPersonaEstructurada() en normalizar.ts): la primera versión
// buscaba contra el conjunto COMPLETO de tokens del otro lado, mismo patrón
// que compartenApellidoExacto — necesario ahí porque compartenApellidoExacto
// existe para tolerar que la PROPIA tokenización de alguno de los dos lados
// se equivoque de partición (texto libre sin coma). Pero buscar "contra
// todo" tiene un costo que compartenApellidoExacto no paga porque exige
// coincidencia EXACTA: con similitud DIFUSA, un candidato cuyo NOMBRE DE
// PILA coincide con el APELLIDO de la consulta (caso real: "Abril, Nicolás
// Germán" contra un candidato realmente apellidado "Ibarra" pero con
// nombre de pila "Abril") pasaba esta compuerta por una autocoincidencia
// exacta de "abril" contra "abril" — dos personas SIN relación real de
// apellido, con un simple nombre de pila en común.
//
// La razón por la que ahora sí se puede comparar apellido-contra-apellido
// DIRECTO sin heredar el problema de partición: desde
// tokenizarPersonaEstructurada(), todo candidato real (siempre viene de
// `Persona.nombre`/`Persona.apellido`, columnas estructuradas de la base)
// tiene su partición CONOCIDA, no adivinada — ya no hace falta tolerar un
// error de partición del candidato, porque no puede haber uno.
function mejorSimilitudApellido(a: NombrePersonaTokenizado, b: NombrePersonaTokenizado): number {
  const apellidoA = a.tokensApellido.filter((t) => t.length >= 3);
  const apellidoB = b.tokensApellido.filter((t) => t.length >= 3);
  if (apellidoA.length === 0 && apellidoB.length === 0) return 1; // sin evidencia suficiente para vetar
  if (apellidoA.length === 0 || apellidoB.length === 0) return 0;

  let mejor = 0;
  for (const ta of apellidoA) {
    for (const tb of apellidoB) mejor = Math.max(mejor, similitudConservadora(ta, tb));
  }
  return mejor;
}

// Núcleo del motor: compara dos nombres YA TOKENIZADOS (ver
// lib/identidad/normalizar.ts) y devuelve una confianza 0-1 con desglose
// explicable. Separado de calcularConfianzaIdentidad() para que un caller
// que YA conoce la partición nombre/apellido real de un lado (ej. un
// candidato de la base, con columnas `Persona.nombre`/`Persona.apellido`
// estructuradas) pueda tokenizarlo con `tokenizarPersonaEstructurada()` en
// vez de volver a adivinar el orden con la heurística de texto libre — ver
// el comentario extenso en esa función sobre el bug real 2026-08-05 que
// motivó esta separación (dos personas distintas con un nombre de pila en
// común terminaban pareciendo tener evidencia real de apellido, porque el
// candidato se volvía a tokenizar como si fuera texto libre de origen
// incierto, descartando la partición confiable que ya teníamos).
export function calcularConfianzaIdentidadEntreTokenizados(
  a: NombrePersonaTokenizado,
  b: NombrePersonaTokenizado,
): ResultadoScoring {
  const evidencias: EvidenciaSenal[] = [];

  // 1. Apellido — señal ancla.
  const simApellido = similitudListaTokens(a.tokensApellido, b.tokensApellido);
  evidencias.push({
    nombre: "apellido",
    valor: simApellido,
    peso: PESOS_MOTOR_IDENTIDAD.apellido,
    aporte: simApellido * PESOS_MOTOR_IDENTIDAD.apellido,
    descripcion:
      simApellido >= 0.9
        ? "mismo apellido"
        : simApellido >= 0.6
          ? "apellido parecido (posible variante de tipeo)"
          : "apellido no coincide",
  });

  // 2. Nombre de pila — con tolerancia a iniciales (ver
  // similitudPorIniciales) combinada con la mejor similitud token a token.
  const simNombreDirecta = similitudListaTokens(a.tokensNombre, b.tokensNombre);
  const simNombreIniciales = similitudPorIniciales(a.tokensNombre, b.tokensNombre);
  const simNombre = Math.max(simNombreDirecta, simNombreIniciales);
  evidencias.push({
    nombre: "nombre",
    valor: simNombre,
    peso: PESOS_MOTOR_IDENTIDAD.nombre,
    aporte: simNombre * PESOS_MOTOR_IDENTIDAD.nombre,
    descripcion:
      simNombre >= 0.9
        ? "primer nombre idéntico o inicial coincidente"
        : simNombre >= 0.6
          ? "nombre de pila parecido"
          : "nombre de pila no coincide",
  });

  // 3. Conjunto completo de tokens — order-invariant, cubre errores de
  // partición nombre/apellido de la tokenización (ej. nombre compuesto mal
  // partido) y sirve de verificación cruzada independiente de 1 y 2.
  const simConjunto = Math.max(
    tokenSetRatio(a.tokens, b.tokens),
    tokenSortRatio(a.tokens, b.tokens),
    jaccardTokens(a.tokens, b.tokens),
    partialRatio(a.textoCompleto, b.textoCompleto),
  );
  evidencias.push({
    nombre: "conjunto_completo",
    valor: simConjunto,
    peso: PESOS_MOTOR_IDENTIDAD.conjuntoCompleto,
    aporte: simConjunto * PESOS_MOTOR_IDENTIDAD.conjuntoCompleto,
    descripcion:
      simConjunto >= 0.9
        ? "mismo conjunto de palabras (orden distinto no afecta)"
        : "conjunto de palabras solo parcialmente coincidente",
  });

  // 4. Bonus por tokens exactos compartidos — evidencia dura adicional que
  // no depende de ningún umbral de similitud difusa.
  const exactos = contarTokensExactosCompartidos(a, b);
  const totalTokens = Math.max(a.tokens.length, b.tokens.length, 1);
  const simExactos = Math.min(1, exactos / totalTokens);
  evidencias.push({
    nombre: "tokens_exactos",
    valor: simExactos,
    peso: PESOS_MOTOR_IDENTIDAD.bonusExactos,
    aporte: simExactos * PESOS_MOTOR_IDENTIDAD.bonusExactos,
    descripcion:
      exactos > 0
        ? `${exactos} palabra(s) idéntica(s) compartida(s)`
        : "sin palabras idénticas compartidas",
  });

  let confianza = Math.min(1, evidencias.reduce((s, e) => s + e.aporte, 0));

  // Compuerta determinística de nombre mínimo — sin esto, un apellido exacto
  // (peso 0.42, la señal más alta) más ruido difuso en el resto alcanza para
  // cruzar el umbral de auto-vinculación aunque el nombre de pila sea otra
  // persona completamente distinta. Medido con el benchmark real: SIN esta
  // compuerta, "Constanza Barroso" vs "Cindy Barroso" (mismo apellido,
  // nombre de pila sin relación — el patrón exacto del bug de producción de
  // 2026-08-03) da 77.4% de confianza, por encima del umbral de
  // auto-vinculación calculado (73%), porque la similitud DIFUSA entre
  // "constanza" y "cindy" da ~59% solo por azar de caracteres compartidos —
  // no alcanza con un umbral difuso más alto, hace falta la verificación
  // estricta de contención de substring (compartenTokenDeNombre), el mismo
  // criterio ya probado en producción. Una suma ponderada lineal sola
  // SIEMPRE puede fallar así sea cual sea el peso del apellido — nada le
  // impide a una señal fuerte sola empujar el total por encima del umbral
  // sin una regla de veto explícita.
  const TECHO_SIN_NOMBRE_SUFICIENTE = 0.6;
  if (!compartenTokenDeNombre(a.tokensNombre, b.tokensNombre) && confianza > TECHO_SIN_NOMBRE_SUFICIENTE) {
    confianza = TECHO_SIN_NOMBRE_SUFICIENTE;
    evidencias.push({
      nombre: "compuerta_nombre_minimo",
      valor: simNombre,
      peso: 0,
      aporte: 0,
      descripcion:
        "el apellido coincide pero el nombre de pila no comparte ningún token real — confianza limitada para forzar revisión manual, nunca auto-vinculación",
    });
  }

  // Segunda compuerta, encontrada por el propio test suite (no por un bug de
  // producción, esta vez — el proceso funcionó como debía: el test escrito
  // ANTES de confiar en el motor encontró el problema antes de que llegara a
  // producción). "Ana Fernandez" vs "Ana Hernandez" — nombre de pila
  // IDÉNTICO más apellidos a un solo caracter de distancia (Jaro-Winkler
  // ~93%) dan 91% de confianza combinada, cruzando el umbral de
  // auto-vinculación — pero "Fernandez" y "Hernandez" son apellidos
  // genuinamente distintos y comunes en español, no una variante de tipeo
  // del mismo apellido, y ningún algoritmo de similitud léxica puede
  // distinguir con certeza esa ambigüedad de un typo genuino
  // ("Gonzalez"/"Gonzales") sin información adicional (DNI, teléfono). La
  // respuesta conservadora: la auto-vinculación exige coincidencia EXACTA de
  // apellido (ver compartenApellidoExacto), cualquier similitud meramente
  // "parecida" pasa a revisión manual sin importar cuán bien coincida el
  // resto — mismo criterio de precisión-sobre-recall que la compuerta de
  // nombre de arriba.
  if (!compartenApellidoExacto(a, b) && confianza > TECHO_SIN_NOMBRE_SUFICIENTE) {
    confianza = TECHO_SIN_NOMBRE_SUFICIENTE;
    evidencias.push({
      nombre: "compuerta_apellido_no_exacto",
      valor: simApellido,
      peso: 0,
      aporte: 0,
      descripcion:
        "el apellido es parecido pero no coincide de forma exacta — confianza limitada para forzar revisión manual (apellidos distintos pueden parecerse por azar)",
    });
  }

  // Tercera compuerta — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
  // secciones 2 y 9: el apellido no es "una señal más que suma", es el
  // requisito real de que exista evidencia de identidad. Un nombre de pila
  // compartido (baja distintividad — miles de personas lo comparten) puede
  // empujar la confianza combinada hasta la banda de revisión aunque el
  // apellido no tenga NINGUNA relación real con el candidato. Caso real
  // reportado 2026-08-05: "Abril Nicolás" vs "Abril Soto" comparte el token
  // "Abril" (nombre de pila idéntico + bonus de conjunto completo) y llegaba
  // a ~57% de confianza — dentro de la banda de revisión — aunque "Nicolás"
  // y "Soto" no tienen ninguna similitud real. Distinta de la compuerta
  // anterior (que actúa sobre apellidos PARECIDOS pero no exactos, evidencia
  // real aunque débil, y solo se activa por encima de 0.6): acá el apellido
  // no aporta evidencia EN ABSOLUTO, así que el candidato no debería llegar
  // ni a revisión manual — se fuerza por debajo del piso de descarte
  // (`PISO_CONFIANZA_REVISION` en politica-decision.ts), no solo por debajo
  // del umbral de auto-vinculación.
  //
  // Usa `mejorSimilitudApellido` (apellido-contra-apellido DIRECTO — ver el
  // comentario extenso en esa función sobre por qué esto ya no hereda el
  // problema de partición que motivó la versión anterior "contra el
  // conjunto completo del otro lado": esa versión anterior, a su vez,
  // permitía que un candidato cuyo NOMBRE DE PILA coincide con el APELLIDO
  // de la consulta pasara la compuerta por una autocoincidencia — el bug
  // real reportado 2026-08-05 ("Abril, Nicolás Germán" contra un candidato
  // realmente apellidado "Ibarra" pero con nombre de pila "Abril" seguía
  // en banda de revisión, 56%, porque "abril" se encontraba a sí mismo en
  // el conjunto completo del candidato). Umbral 0.5 y techo 0.35 calibrados
  // contra scripts/benchmark-identidad.ts.
  const SIN_RELACION_APELLIDO = 0.5;
  const TECHO_SIN_EVIDENCIA_APELLIDO = 0.35;
  const simApellidoRobusta = mejorSimilitudApellido(a, b);
  if (simApellidoRobusta < SIN_RELACION_APELLIDO && confianza > TECHO_SIN_EVIDENCIA_APELLIDO) {
    confianza = TECHO_SIN_EVIDENCIA_APELLIDO;
    evidencias.push({
      nombre: "compuerta_apellido_sin_evidencia",
      valor: simApellidoRobusta,
      peso: 0,
      aporte: 0,
      descripcion:
        "el apellido no tiene ninguna relación real con el candidato — un nombre de pila compartido no es evidencia suficiente por sí solo, se descarta",
    });
  }

  const explicacion = evidencias
    .filter((e) => e.valor > 0 || e.peso === 0)
    .sort((x, y) => y.aporte - x.aporte)
    .map((e) =>
      e.peso === 0 && e.aporte === 0 && e.nombre.startsWith("compuerta_")
        ? `⚠ ${e.descripcion}`
        : `${e.valor >= 0.6 ? "✔" : "•"} ${e.descripcion} (${Math.round(e.valor * 100)}%)`,
    );

  if (explicacion.length === 0) explicacion.push("✘ ninguna señal de coincidencia encontrada");

  return { confianza, evidencias, explicacion };
}

// Punto de entrada del motor para texto libre (cualquier orden/formato,
// origen incierto — ej. una fila de padrón o un formulario): tokeniza
// ambos lados con la heurística de tokenizarNombrePersona() y delega en
// calcularConfianzaIdentidadEntreTokenizados(). Si alguno de los dos lados
// ya tiene nombre/apellido conocidos por separado (ej. un candidato de la
// base), usar tokenizarPersonaEstructurada() + calcularConfianzaIdentidadEntreTokenizados()
// directamente en vez de esta función — ver comentario en esa función.
export function calcularConfianzaIdentidad(
  nombreCompletoA: string,
  nombreCompletoB: string,
  catalogoLexico: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): ResultadoScoring {
  const a = tokenizarNombrePersona(nombreCompletoA, catalogoLexico);
  const b = tokenizarNombrePersona(nombreCompletoB, catalogoLexico);
  return calcularConfianzaIdentidadEntreTokenizados(a, b);
}
