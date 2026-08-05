import { distanciaDamerauLevenshtein } from "./algoritmos";
import {
  tokenizarNombrePersona,
  CATALOGO_LEXICO_VACIO,
  type CatalogoLexicoIdentidad,
} from "./normalizar";

// Etapa de poda (candidate pruning) del Motor de Resolución de Identidad —
// corre ANTES del scoring (motor-scoring.ts), sobre el universo ya acotado
// por el blocking en base de datos (ver obtenerCandidatosPorApellido en
// lib/ia/deteccion-duplicados.ts y obtenerCandidatosPorNombre en
// lib/ia/matching-padron.ts). Ver PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// para el diagnóstico completo y el fundamento de este diseño.
//
// Qué resuelve que el scoring solo no resolvía: el blocking actual usa
// similitud de trigramas (pg_trgm) sobre CAMPOS COMPLETOS, que se vuelve
// indulgente con apellidos españoles cortos por compartir sufijos comunes
// ("-ella", "-ana", "-ez") sin relación real entre las palabras (caso real:
// "Abella" vs "Antonella" cruza el umbral de blocking por trigramas
// compartidos de la terminación, no por ningún parecido genuino). Esta etapa
// vuelve a evaluar cada candidato con una medida DISTINTA — distancia de
// edición ABSOLUTA entre tokens individuales, no similitud normalizada de
// campo completo — y descarta antes de gastar el scoring completo en un
// candidato sin ninguna evidencia real.
//
// Deliberadamente PERMISIVA (pedido explícito, no ajustar hacia
// conservador): el objetivo es eliminar únicamente lo "prácticamente
// imposible", nunca lo dudoso — prioriza recall. Dos motivos alcanzan para
// que un candidato sobreviva, cualquiera de los dos:
//   1. Comparte al menos un token "fuerte" (3+ caracteres) EXACTO en el
//      conjunto completo de tokens de ambos lados — sin importar si ese
//      token es nombre o apellido en la partición heurística de cada lado
//      (cubre el caso real "Abril Nicolás" vs "Abril Soto": comparten
//      "abril" — sobrevive la poda, y es el motor de scoring, no esta
//      etapa, el que debe decidir más adelante que un nombre de pila común
//      compartido solo no alcanza para nada más que revisión de baja
//      prioridad o descarte — ver plan de evidencia, todavía no
//      implementado en esta etapa).
//   2. Algún token de apellido de un lado tiene una similitud real (distancia
//      de edición absoluta acotada, no un ratio normalizado) contra algún
//      token del conjunto completo del otro lado — cubre variantes de
//      tipeo genuinas del apellido ("Gonzalez"/"Gonzales",
//      "Fernandez"/"Hernandez" — este último debe sobrevivir la poda, la
//      decisión de "nunca auto-vincular con apellido no exacto" sigue
//      viviendo en el scoring, no acá).
// Solo si NINGUNA de las dos se cumple, se elimina — es exactamente el caso
// real "Abella Irene" vs "Dorado Antonella": cero tokens compartidos, y
// ninguna similitud real entre "irene"/"antonella" ni entre
// "abella"/"antonella" (la distancia de edición real entre estas dos
// últimas es 4, muy por encima del tope de tipeo tolerado para su
// longitud — a diferencia de la similitud de trigramas del blocking, que sí
// las dejaba pasar).

export interface ResultadoPoda {
  sobrevive: boolean;
  motivo: string;
}

const LARGO_MINIMO_TOKEN_FUERTE = 3;

// Tope de distancia de edición ABSOLUTA (no un ratio normalizado — ver
// diagnóstico arriba de por qué un ratio normalizado es la causa raíz del
// problema con strings cortos). Deliberadamente ajustado (1-2 operaciones,
// no más) para capturar variantes de tipeo genuinas sin abrir la puerta a
// apellidos realmente distintos que comparten una terminación común — el
// mismo tipo de tope que la propuesta de rediseño fija para la etapa de
// evidencia futura, reutilizado acá con el mismo criterio.
function distanciaMaximaTolerada(largoMasLargo: number): number {
  if (largoMasLargo <= 6) return 1;
  if (largoMasLargo <= 10) return 2;
  return 3;
}

function tokenFuerteCompartido(tokensA: string[], tokensB: string[]): string | null {
  const candidatosB = new Set(tokensB.filter((t) => t.length >= LARGO_MINIMO_TOKEN_FUERTE));
  for (const token of tokensA) {
    if (token.length >= LARGO_MINIMO_TOKEN_FUERTE && candidatosB.has(token)) return token;
  }
  return null;
}

function apellidoConSimilitudReal(tokensApellido: string[], tokensOtroLado: string[]): string | null {
  for (const apellido of tokensApellido) {
    if (apellido.length < LARGO_MINIMO_TOKEN_FUERTE) continue;
    for (const otro of tokensOtroLado) {
      if (otro.length < LARGO_MINIMO_TOKEN_FUERTE) continue;
      if (apellido === otro) continue; // ya lo cubre tokenFuerteCompartido
      const largoMasLargo = Math.max(apellido.length, otro.length);
      const distancia = distanciaDamerauLevenshtein(apellido, otro);
      if (distancia <= distanciaMaximaTolerada(largoMasLargo)) return `${apellido}~${otro}`;
    }
  }
  return null;
}

// Evalúa si un candidato sobrevive la poda antes de pasar al scoring
// completo. `encontradoPorMasDeUnaEstrategia` es un parámetro de extensión
// para cuando el blocking multi-estrategia (etapa futura del rediseño) esté
// implementado — hoy el blocking es una sola estrategia por caller, así que
// siempre llega en `false`/`undefined`, sin efecto todavía, pero la firma ya
// queda lista para no tener que volver a tocar los callers después.
export function evaluarPoda(
  nombreObjetivo: string,
  nombreCandidato: string,
  opciones: {
    encontradoPorMasDeUnaEstrategia?: boolean;
    catalogoLexico?: CatalogoLexicoIdentidad;
  } = {},
): ResultadoPoda {
  if (opciones.encontradoPorMasDeUnaEstrategia) {
    return {
      sobrevive: true,
      motivo: "encontrado por más de una estrategia de blocking independiente — sobrevive salvo contradicción muy fuerte",
    };
  }

  const catalogo = opciones.catalogoLexico ?? CATALOGO_LEXICO_VACIO;
  const a = tokenizarNombrePersona(nombreObjetivo, catalogo);
  const b = tokenizarNombrePersona(nombreCandidato, catalogo);

  const tokenFuerte = tokenFuerteCompartido(a.tokens, b.tokens);
  if (tokenFuerte) {
    return { sobrevive: true, motivo: `comparten el token "${tokenFuerte}"` };
  }

  const parApellido =
    apellidoConSimilitudReal(a.tokensApellido, b.tokens) ?? apellidoConSimilitudReal(b.tokensApellido, a.tokens);
  if (parApellido) {
    return {
      sobrevive: true,
      motivo: `posible variante de tipeo de apellido ("${parApellido.replace("~", '" / "')}")`,
    };
  }

  return {
    sobrevive: false,
    motivo: "sin ningún token compartido ni similitud real de apellido — sin evidencia útil para continuar",
  };
}

// Filtra una lista de candidatos con `evaluarPoda`, preservando el orden.
// Los candidatos que no sobreviven quedan completamente fuera — nunca
// llegan al scoring ni pueden aparecer en la lista que ve el operador,
// independientemente de qué score numérico hubieran obtenido.
export function podarCandidatos<T extends { nombreCompleto: string }>(
  nombreObjetivo: string,
  candidatos: T[],
  catalogoLexico: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): T[] {
  return candidatos.filter(
    (c) => evaluarPoda(nombreObjetivo, c.nombreCompleto, { catalogoLexico }).sobrevive,
  );
}
