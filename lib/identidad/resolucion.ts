import { calcularConfianzaIdentidadEntreTokenizados, type ResultadoScoring } from "./motor-scoring";
import { podarCandidatos } from "./poda";
import {
  tokenizarNombrePersona,
  tokenizarPersonaEstructurada,
  CATALOGO_LEXICO_VACIO,
  type CatalogoLexicoIdentidad,
} from "./normalizar";

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
  // Opcionales — cuando el candidato viene de una fila estructurada de
  // Persona (el caso real siempre en este sistema), pasar `nombre` y
  // `apellido` acá evita que el motor tenga que volver a ADIVINAR la
  // partición nombre/apellido a partir de `nombreCompleto` con la
  // heurística de texto libre. Ver el comentario extenso en
  // tokenizarPersonaEstructurada() (lib/identidad/normalizar.ts) sobre el
  // bug real 2026-08-05 que esto corrige: sin la partición confiable, dos
  // personas distintas que comparten un nombre de pila común (ej. "Abril")
  // podían terminar pareciendo tener evidencia real de apellido.
  nombre?: string;
  apellido?: string;
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
  // Cuando quien llama YA conoce el nombre/apellido de la consulta por
  // separado (ej. deteccion-duplicados.ts arma `nombreObjetivo` a partir de
  // un formulario con `datos.nombre`/`datos.apellido` estructurados), pasar
  // acá evita la misma adivinanza de partición que se corrigió para el
  // candidato (ver tokenizarPersonaEstructurada() en normalizar.ts) — sin
  // esto, "Juan Perez" como consulta libre podía no reconocer a "Juan Perez
  // Garcia" (candidato con apellido materno de más) como el mismo apellido,
  // por el mismo motivo de partición. matching-padron.ts no tiene este dato
  // (la entrada del padrón es texto libre real, sin nombre/apellido
  // separados de antemano) y sigue sin pasarlo — se apoya en la coma del
  // formato "Apellido, Nombre" del padrón, que ya es una partición
  // confiable dentro de tokenizarNombrePersona().
  objetivoEstructurado?: { nombre: string; apellido: string },
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

  const tokenizadoObjetivo = objetivoEstructurado
    ? tokenizarPersonaEstructurada(objetivoEstructurado.nombre, objetivoEstructurado.apellido, catalogoLexico)
    : tokenizarNombrePersona(nombreObjetivo, catalogoLexico);

  const todas: CoincidenciaEvaluada[] = sobrevivientes.map((c) => {
    const tokenizadoCandidato =
      c.nombre !== undefined && c.apellido !== undefined
        ? tokenizarPersonaEstructurada(c.nombre, c.apellido, catalogoLexico)
        : tokenizarNombrePersona(c.nombreCompleto, catalogoLexico);
    const resultado: ResultadoScoring = calcularConfianzaIdentidadEntreTokenizados(
      tokenizadoObjetivo,
      tokenizadoCandidato,
    );
    return { id: c.id, confianza: resultado.confianza, explicacion: resultado.explicacion };
  });

  todas.sort((x, y) => y.confianza - x.confianza);
  return { mejor: todas[0], todas };
}
