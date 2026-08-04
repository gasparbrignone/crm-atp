import { prisma } from "@/lib/prisma/client";
import { evaluarCandidatos } from "@/lib/identidad/resolucion";

// Matching de PadronEntrada contra Persona — /09-modulo-padron-electoral.md
// sección 5: DNI exacto primero (señal determinística), después nombre
// difuso usando el mismo Motor de Resolución de Identidad determinístico que
// la detección de duplicados de personas (/lib/identidad/, ver su README) —
// ya NO llama a ningún modelo de IA desde el 2026-08-04 (ver justificación
// completa en /REVISION-CRITICA-AUDITORIA-2026-08-04.md sección 1.2: acá el
// riesgo de depender de un número de confianza inestable de un LLM era
// incluso mayor que en duplicados de personas, porque este resultado define
// `estado_padron` — quién puede votar). A diferencia de la detección de
// duplicados de Fase 2 (que puede dar de alta una Persona sola cuando no hay
// candidatos), acá una entrada sin candidatos queda `sin_coincidencia`: el
// alta de una ficha nueva a partir del padrón es siempre una decisión humana
// explícita en la revisión manual (sección 6), nunca automática — el padrón
// no es la fuente de verdad de quién existe, solo de quién puede votar.

export type ResultadoMatchingPadron =
  | { tipo: "vinculado_automatico"; personaId: string; confianza: number }
  | { tipo: "pendiente"; motivo: string; candidatos: CandidatoPadron[] }
  | { tipo: "sin_coincidencia" };

export interface CandidatoPadron {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

async function buscarPorDni(dni: string) {
  return prisma.persona.findFirst({ where: { dni, estadoFicha: { not: "fusionada" } } });
}

// El padrón trae el nombre como "Apellido, Nombre" — se usa solo el
// apellido como ancla de la búsqueda de candidatos, nunca los nombres de
// pila sueltos. Un nombre de pila común (Ana, María, Luis...) no es
// distintivo y generaba candidatos completamente ajenos con el mismo primer
// nombre pero apellido distinto (bug real 2026-08-02: "Abraham, Ana Paula"
// se vinculó automático a una persona apellidada "Ascúa" solo porque
// compartían los nombres de pila "Ana"/"Paula"). El apellido sigue
// buscándose contra ambos campos de la persona candidata, por si el orden
// viniera invertido en algún caso.
async function obtenerCandidatosPorNombre(nombreCompleto: string): Promise<CandidatoPadron[]> {
  const apellidoOriginal = (nombreCompleto.split(",")[0] ?? "").trim();
  const tokensApellido = apellidoOriginal.split(/\s+/).filter((t) => t.length >= 3);
  if (tokensApellido.length === 0) return [];

  const candidatos = await prisma.persona.findMany({
    where: {
      estadoFicha: { not: "fusionada" },
      OR: tokensApellido.flatMap((t) => [
        { apellido: { contains: t, mode: "insensitive" as const } },
        { nombre: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    select: { id: true, nombre: true, apellido: true, dni: true },
    take: 20,
  });

  return candidatos;
}

// Piso por debajo del cual el motor considera que no hay evidencia real de
// coincidencia — coherente con la banda de "revisión manual" calibrada en
// lib/identidad/BENCHMARK-RESULTADOS.md (0.4-umbral). Por debajo de este
// piso es `sin_coincidencia` (descarte seguro, sin fricción de revisión
// innecesaria — el mismo criterio que ya regía acá desde el bug real
// 2026-08-02 de revisiones sin sentido por coincidencias espurias de un
// token corto y común); entre el piso y el umbral configurado es `pendiente`
// (hay evidencia real pero no alcanza para decidir solo).
const CONFIANZA_MINIMA_PARA_REVISION = 0.4;

export async function buscarPersonaParaEntradaPadron(
  entrada: { dni: string; nombreCompletoOriginal: string },
  umbral: number,
): Promise<ResultadoMatchingPadron> {
  const porDni = await buscarPorDni(entrada.dni);
  if (porDni) {
    return { tipo: "vinculado_automatico", personaId: porDni.id, confianza: 1 };
  }

  const candidatos = await obtenerCandidatosPorNombre(entrada.nombreCompletoOriginal);
  if (candidatos.length === 0) return { tipo: "sin_coincidencia" };

  // Motor de Resolución de Identidad determinístico (ver
  // /lib/identidad/README.md) — reemplaza la llamada a Gemini que hacía este
  // paso hasta el 2026-08-04. El nombre del padrón puede venir en cualquier
  // orden ("Apellido, Nombre" o "Nombre Apellido"); tokenizarNombrePersona()
  // (lib/identidad/normalizar.ts) ya maneja ambos formatos.
  const { mejor } = evaluarCandidatos(
    entrada.nombreCompletoOriginal,
    candidatos.map((c) => ({ id: c.id, nombreCompleto: `${c.nombre} ${c.apellido}` })),
  );

  if (!mejor || mejor.confianza < CONFIANZA_MINIMA_PARA_REVISION) {
    return { tipo: "sin_coincidencia" };
  }
  if (mejor.confianza < umbral) {
    return {
      tipo: "pendiente",
      motivo: `Coincidencia de confianza media (${Math.round(mejor.confianza * 100)}%): ${mejor.explicacion.join("; ")}`,
      candidatos,
    };
  }

  // No hace falta un chequeo adicional de "comparten nombre de pila" acá: la
  // compuerta determinística equivalente ya vive dentro del motor de scoring
  // (compartenTokenDeNombre en motor-scoring.ts) y ya topeó `mejor.confianza`
  // a 0.6 en ese caso — si llegamos hasta acá con confianza >= umbral, es
  // porque el motor ya verificó que el nombre de pila SÍ comparte evidencia
  // real, no solo el apellido.
  return { tipo: "vinculado_automatico", personaId: mejor.id, confianza: mejor.confianza };
}
