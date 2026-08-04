// Normalización y tokenización de nombres de persona — capa 1 del Motor de
// Resolución de Identidad (ver /lib/identidad/README.md para la arquitectura
// completa). Todo lo de acá es determinístico y puro.

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
export function tokenizarNombrePersona(textoOriginal: string): NombrePersonaTokenizado {
  const tieneComa = textoOriginal.includes(",");
  const [parteA, parteB] = textoOriginal.split(",");

  let tokensApellido: string[];
  let tokensNombre: string[];

  if (tieneComa && parteB !== undefined) {
    // Las partículas ("de la Cruz", "del Valle") se conservan como parte del
    // apellido cuando hay coma explícita — es la señal más confiable de
    // dónde termina el apellido, no vale la pena adivinar mejor que eso acá.
    tokensApellido = separarTokens(parteA);
    tokensNombre = separarTokens(parteB);
  } else {
    const todos = separarTokens(textoOriginal);
    if (todos.length <= 2) {
      tokensNombre = todos.slice(0, 1);
      tokensApellido = todos.slice(1);
    } else {
      // 3+ tokens sin coma: se asume 1 nombre + resto apellido si el
      // resultado parece razonable, salvo 4+ tokens donde es más común
      // "nombre + segundo nombre + apellido + apellido materno" —
      // conservador: los últimos dos tokens son apellido cuando hay 4 o más.
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
