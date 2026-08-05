// Normalización y tokenización de nombres de persona — capa 1 del Motor de
// Resolución de Identidad (ver /lib/identidad/README.md para la arquitectura
// completa). Todo lo de acá es determinístico y puro.

// Catálogo léxico configurable (nombres compuestos frecuentes y partículas
// de apellido argentinas) — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// sección 6. Deliberadamente NO hardcodeado acá (pedido explícito de
// Gaspar): esta capa sigue siendo pura y sin dependencias externas, recibe
// el catálogo como dato desde quien la llama. Quien lo carga desde la base
// real (tabla LexicoNombrePropio) es lib/servicios/lexico-identidad.service.ts
// — nunca esta capa. Cada secuencia ya viene tokenizada y normalizada
// (minúscula, sin acentos), en el orden en que debe fusionarse.
export interface CatalogoLexicoIdentidad {
  nombresCompuestos: string[][];
  particulasApellido: string[][];
}

export const CATALOGO_LEXICO_VACIO: CatalogoLexicoIdentidad = {
  nombresCompuestos: [],
  particulasApellido: [],
};

// Fusiona corridas de tokens que coinciden con una secuencia del catálogo en
// una sola unidad léxica (string con espacios adentro) — así "de la Cruz"
// nunca se separa en tres tokens independientes que la heurística
// posicional de más abajo pueda cortar mal, y "Juan José" nunca deja que
// "José" caiga por error en el apellido. `exigirTokenSiguiente` es para
// partículas: una partícula sin ningún apellido detrás ("de" solo, al final
// del texto) no tiene sentido fusionarla sola.
function fusionarSecuenciasConocidas(
  tokens: string[],
  secuencias: string[][],
  exigirTokenSiguiente: boolean,
): string[] {
  if (secuencias.length === 0 || tokens.length === 0) return tokens;
  // Más largas primero: si "de la" y "de" estuvieran ambas en el catálogo,
  // preferir la coincidencia más específica.
  const ordenadas = [...secuencias]
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);

  const resultado: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let fusiono = false;
    for (const secuencia of ordenadas) {
      const largo = secuencia.length;
      if (i + largo > tokens.length) continue;
      if (exigirTokenSiguiente && i + largo >= tokens.length) continue;
      let coincide = true;
      for (let k = 0; k < largo; k++) {
        if (tokens[i + k] !== secuencia[k]) {
          coincide = false;
          break;
        }
      }
      if (!coincide) continue;

      if (exigirTokenSiguiente) {
        resultado.push([...secuencia, tokens[i + largo]].join(" "));
        i += largo + 1;
      } else {
        resultado.push(secuencia.join(" "));
        i += largo;
      }
      fusiono = true;
      break;
    }
    if (!fusiono) {
      resultado.push(tokens[i]);
      i++;
    }
  }
  return resultado;
}

// Aplica la fusión léxica completa: primero partículas de apellido (que
// exigen un token detrás para tener sentido), después nombres compuestos.
// Orden importante: una partícula fusionada primero deja al nombre
// compuesto trabajar sobre unidades ya correctas si ambos catálogos
// coincidieran en una posición ambigua (caso raro, pero determinístico).
function aplicarCatalogoLexico(tokens: string[], catalogo: CatalogoLexicoIdentidad): string[] {
  const conParticulas = fusionarSecuenciasConocidas(tokens, catalogo.particulasApellido, true);
  return fusionarSecuenciasConocidas(conParticulas, catalogo.nombresCompuestos, false);
}

export interface NombrePersonaTokenizado {
  // Texto normalizado completo (para algoritmos que comparan strings enteros).
  textoCompleto: string;
  // Todos los tokens, sin distinguir nombre/apellido (el orden en la fuente
  // de datos no es confiable — ver /15-ia.md y el pedido de rediseño: puede
  // venir "Apellido, Nombre" o "Nombre Apellido" según la fuente).
  tokens: string[];
  // Mejor estimación de qué tokens son apellido — señal más fuerte que
  // "nombre" para blocking, porque en Argentina el apellido paterno casi
  // siempre está presente y es menos variable que el conjunto de nombres.
  tokensApellido: string[];
  tokensNombre: string[];
}

// Quita diacríticos, pasa a minúscula, colapsa espacios y quita puntuación
// que no es parte del nombre (comas, puntos de abreviatura, guiones sueltos).
export function normalizarTextoIdentidad(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function separarTokens(texto: string): string[] {
  return normalizarTextoIdentidad(texto)
    .split(" ")
    .filter((t) => t.length > 0);
}

// Tokeniza un campo YA estructurado (ej. Persona.nombre o Persona.apellido,
// que vienen separados desde el formulario/base — no texto libre ambiguo),
// aplicando el catálogo léxico configurable pero SIN la heurística
// posicional de tokenizarNombrePersona (que es para cuando no se sabe qué
// parte del texto es nombre y cuál apellido — acá ya se sabe, por eso no
// hace falta adivinar). Usado por
// lib/servicios/persona-token.service.ts para poblar el índice invertido.
export function tokenizarCampoEstructurado(
  texto: string,
  catalogo: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): string[] {
  return aplicarCatalogoLexico(separarTokens(texto), catalogo);
}

// Tokeniza una Persona cuyo nombre y apellido YA SE CONOCEN por separado
// (vienen de columnas estructuradas de la base, `Persona.nombre` /
// `Persona.apellido` — nunca de texto libre ambiguo) — bug real 2026-08-05:
// hasta esta función, `evaluarCandidatos` (resolucion.ts) colapsaba
// `${candidato.nombre} ${candidato.apellido}` en un solo string y lo volvía
// a partir con la heurística de `tokenizarNombrePersona()` (pensada para
// texto libre de origen incierto), TIRANDO la partición ya confiable que
// veníamos de la base para volver a adivinarla. La heurística re-derivada
// coincide con la real casi siempre (2 tokens: nombre+apellido, el caso más
// común), pero cuando no coincide produce un bug serio y específico en el
// matching de padrón: si el nombre de pila de un candidato (ej. "Abril")
// es también, casualmente, el apellido real de la persona del padrón que se
// está buscando, el motor terminaba comparando el apellido real de la
// consulta contra el nombre de pila mal-etiquetado de otra persona — dos
// personas DISTINTAS con un nombre de pila en común terminaban pareciendo
// tener "evidencia real de apellido". Usar la partición ya conocida en vez
// de re-derivarla elimina esa clase de error de raíz para cualquier
// candidato que venga de una fila estructurada de `Persona` (que es
// siempre el caso real en este sistema — el único lado que necesita
// heurística es el texto libre de origen incierto, ej. una fila de
// padrón o un formulario).
export function tokenizarPersonaEstructurada(
  nombre: string,
  apellido: string,
  catalogo: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): NombrePersonaTokenizado {
  const tokensNombre = tokenizarCampoEstructurado(nombre, catalogo);
  const tokensApellido = tokenizarCampoEstructurado(apellido, catalogo);
  const tokens = separarTokens(`${nombre} ${apellido}`);

  return {
    textoCompleto: tokens.join(" "),
    tokens,
    tokensApellido,
    tokensNombre,
  };
}

// El padrón universitario (ver /09-modulo-padron-electoral.md) trae el
// nombre como "Apellido, Nombre" — si el texto original tiene una coma, esa
// posición es una señal fuerte y confiable de dónde termina el apellido.
// Sin coma, se asume la convención más común en fuentes argentinas
// (CSV/Excel/Sheets de contactos): "Nombre Apellido", con el último token (o
// los últimos dos si hay 4+ tokens, para cubrir apellido compuesto/materno)
// como apellido. Es una heurística, no una certeza — por eso el motor de
// scoring (motor-scoring.ts) igual compara contra el conjunto completo de
// tokens además de la partición nombre/apellido, para no depender
// ciegamente de haber adivinado bien el orden.
export function tokenizarNombrePersona(
  textoOriginal: string,
  catalogo: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): NombrePersonaTokenizado {
  const tieneComa = textoOriginal.includes(",");
  const [parteA, parteB] = textoOriginal.split(",");

  let tokensApellido: string[];
  let tokensNombre: string[];

  if (tieneComa && parteB !== undefined) {
    // Las partículas ("de la Cruz", "del Valle") se conservan como parte del
    // apellido cuando hay coma explícita — es la señal más confiable de
    // dónde termina el apellido, no vale la pena adivinar mejor que eso acá.
    // Igual se pasa por el catálogo léxico, por si el apellido en sí trae un
    // nombre compuesto raro del otro lado de la coma (caso infrecuente, pero
    // sin costo adicional cubrirlo).
    tokensApellido = aplicarCatalogoLexico(separarTokens(parteA), catalogo);
    tokensNombre = aplicarCatalogoLexico(separarTokens(parteB), catalogo);
  } else {
    // Fusión léxica ANTES de la heurística posicional (ver
    // aplicarCatalogoLexico): "Juan José Pérez" pasa a ser 2 unidades
    // ("juan jose", "perez"), no 3 tokens sueltos — así el nombre compuesto
    // nunca cae por error en el apellido, y "de la Cruz" nunca se corta a
    // mitad de la partícula.
    const todos = aplicarCatalogoLexico(separarTokens(textoOriginal), catalogo);
    if (todos.length <= 2) {
      tokensNombre = todos.slice(0, 1);
      tokensApellido = todos.slice(1);
    } else {
      // 3+ unidades sin coma: se asume 1 nombre + resto apellido si el
      // resultado parece razonable, salvo 4+ unidades donde es más común
      // "nombre + segundo nombre + apellido + apellido materno" —
      // conservador: las últimas dos unidades son apellido cuando hay 4 o
      // más.
      const cantidadApellido = todos.length >= 4 ? 2 : 1;
      tokensNombre = todos.slice(0, todos.length - cantidadApellido);
      tokensApellido = todos.slice(todos.length - cantidadApellido);
    }
  }

  const tokens = separarTokens(textoOriginal);

  return {
    textoCompleto: tokens.join(" "),
    tokens,
    tokensApellido: tokensApellido.filter((t) => t.length > 0),
    tokensNombre: tokensNombre.filter((t) => t.length > 0),
  };
}

// Huella digital estilo OpenRefine (fingerprint matching, ver algoritmos.ts):
// tokens únicos, ordenados alfabéticamente, sin acentos/mayúsculas — dos
// nombres con exactamente el mismo conjunto de palabras (en cualquier orden,
// sin duplicados) generan la misma huella. Se usa como paso de dedup exacto
// y como clave de blocking barata antes de correr los algoritmos de
// similitud, más cara.
export function huellaDigital(textoOriginal: string): string {
  const tokens = separarTokens(textoOriginal);
  return [...new Set(tokens)].sort().join(" ");
}

// Clave de blocking por apellido — primeros 4 caracteres del primer token de
// apellido, normalizado. Acota candidatos en la base de datos antes de
// correr comparaciones costosas (ver resolucion.ts) sin excluir variantes
// razonables de tipeo dentro del mismo prefijo.
export function claveBloqueoApellido(tokensApellido: string[]): string | null {
  const primero = tokensApellido[0];
  if (!primero || primero.length < 2) return null;
  return primero.slice(0, 4);
}
