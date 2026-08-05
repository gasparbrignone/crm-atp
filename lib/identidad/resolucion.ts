import { calcularConfianzaIdentidad, type ResultadoScoring } from "./motor-scoring";
import { podarCandidatos } from "./poda";
import { CATALOGO_LEXICO_VACIO, type CatalogoLexicoIdentidad } from "./normalizar";

// Punto de entrada de más alto nivel del Motor de Resolución de Identidad —
// capa 4 (ver lib/identidad/README.md). Reemplaza la llamada a un LLM que
// hacían antes `deteccion-duplicados.ts` y `matching-padron.ts` para la
// comparación de nombres: acá adentro no hay ninguna llamada a IA, es 100%
// determinístico (ver motor-scoring.ts y algoritmos.ts para el detalle).
//
// Deliberadamente NO decide "vincular" o "no vincular" por sí mismo — eso
// sigue siendo responsabilidad de cada módulo llamador, que ya tiene su
// propia lógica de 3 vías (auto-vinculación / revisión manual / sin
// coincidencia) con el umbral configurable `umbral_confianza_duplicados`
// (ver ConfiguracionSistema). Esta función solo calcula, para cada
// candidato, qué tan probable es que sea la misma persona, y devuelve todo
// ordenado y explicado — el criterio de corte sigue viviendo donde ya vivía.

export interface CandidatoParaResolucion {
  id: string;
  nombreCompleto: string;
}

export interface CoincidenciaEvaluada {
  id: string;
  confianza: number;
  explicacion: string[];
}

export interface ResultadoMejorCoincidencia {
  mejor: CoincidenciaEvaluada | null;
  todas: CoincidenciaEvaluada[];
}

// Escalabilidad: esta función asume que `candidatos` ya viene acotado por un
// paso de blocking previo (ej. mismo prefijo de apellido vía consulta SQL —
// ver obtenerCandidatosPorApellido en deteccion-duplicados.ts y
// obtenerCandidatosPorNombre en matching-padron.ts, ambas ya hacen esto a
// nivel de base de datos antes de llegar acá). Comparar contra decenas de
// candidatos acotados por blocking es del orden de 1-2ms (ver
// BENCHMARK-RESULTADOS.md, ~0.1ms por comparación); comparar contra la base
// completa sin blocking no escalaría a miles de Personas y nunca fue lo que
// hacían tampoco las versiones anteriores basadas en IA (que ya limitaban a
// ~20 candidatos por el mismo motivo, evitar mandarle a la IA una lista
// larga). Si en el futuro el volumen de candidatos por bloque crece mucho
// (decenas de miles de personas con el mismo prefijo de apellido — poco
// realista para el volumen esperado de ATP, ver supuesto S4 de
// /01-vision-alcance.md), el blocking debería reforzarse con la extensión
// `pg_trgm` ya instalada (Fase 10, buscador global) calculando la
// similitud directamente en SQL antes de traer filas a Node.
export function evaluarCandidatos(
  nombreObjetivo: string,
  candidatos: CandidatoParaResolucion[],
  catalogoLexico: CatalogoLexicoIdentidad = CATALOGO_LEXICO_VACIO,
): ResultadoMejorCoincidencia {
  if (candidatos.length === 0) return { mejor: null, todas: [] };

  // Etapa de poda (ver lib/identidad/poda.ts) — descarta antes del scoring
  // los candidatos sin ningún token compartido ni similitud real de
  // apellido. Deliberadamente permisiva: prioriza no perder un candidato
  // dudoso por sobre no mostrar ruido, así que la mayoría de lo que
  // sobrevivía el blocking sigue llegando acá — solo elimina lo que ningún
  // humano consideraría revisar.
  const sobrevivientes = podarCandidatos(nombreObjetivo, candidatos, catalogoLexico);
  if (sobrevivientes.length === 0) return { mejor: null, todas: [] };

  const todas: CoincidenciaEvaluada[] = sobrevivientes.map((c) => {
    const resultado: ResultadoScoring = calcularConfianzaIdentidad(
      nombreObjetivo,
      c.nombreCompleto,
      catalogoLexico,
    );
    return { id: c.id, confianza: resultado.confianza, explicacion: resultado.explicacion };
  });

  todas.sort((x, y) => y.confianza - x.confianza);
  return { mejor: todas[0], todas };
}
