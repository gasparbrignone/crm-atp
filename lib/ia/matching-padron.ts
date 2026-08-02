import { prisma } from "@/lib/prisma/client";
import {
  obtenerClienteIA,
  MODELO_IA_LIVIANO,
  SIN_PENSAMIENTO,
  generarConReintentos,
} from "@/lib/ia/cliente-ia";

// Matching de PadronEntrada contra Persona — /09-modulo-padron-electoral.md
// sección 5: DNI exacto primero (señal determinística), después nombre
// difuso "usando el mismo mecanismo de similitud que la detección de
// duplicados de personas" (/15-ia.md sección 2). A diferencia de la
// detección de duplicados de Fase 2 (que puede dar de alta una Persona sola
// cuando no hay candidatos), acá una entrada sin candidatos queda
// `sin_coincidencia`: el alta de una ficha nueva a partir del padrón es
// siempre una decisión humana explícita en la revisión manual (sección 6),
// nunca automática — el padrón no es la fuente de verdad de quién existe,
// solo de quién puede votar.

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

function extraerJson(texto: string): unknown {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

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

  const prompt = `Tarea: decidir si una entrada de un padrón electoral universitario corresponde a alguna persona ya cargada en el sistema.

Entrada del padrón (el DNI no coincidió con nadie, así que se compara solo por nombre):
${JSON.stringify({ nombreCompletoOriginal: entrada.nombreCompletoOriginal })}

Personas candidatas ya cargadas (coinciden en algún token del nombre):
${JSON.stringify(candidatos.map((c) => ({ id: c.id, nombre: c.nombre, apellido: c.apellido })))}

Considerá que el nombre del padrón puede venir en cualquier orden ("Apellido, Nombre" o "Nombre Apellido"), con mayúsculas distintas, sin acentos, o con nombres compuestos. El apellido es la señal fuerte: si el apellido no coincide (aunque sea con variantes de tipeo o acentos), NO es la misma persona, sin importar cuántos nombres de pila compartan — nombres de pila comunes (Ana, María, Luis, José...) no alcanzan por sí solos, ni siquiera si coinciden varios. Si ninguna candidata es razonablemente la misma persona, decilo explícitamente.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"personaId": "<id de la candidata o null>", "confianza": <número entre 0 y 1>, "motivo": "<explicación breve en español>"}`;

  const cliente = obtenerClienteIA();
  const respuesta = await generarConReintentos(() =>
    cliente.models.generateContent({
      model: MODELO_IA_LIVIANO,
      contents: prompt,
      config: {
        maxOutputTokens: 300,
        responseMimeType: "application/json",
        thinkingConfig: SIN_PENSAMIENTO,
      },
    }),
  );

  const texto = respuesta.text;
  if (!texto) {
    return { tipo: "pendiente", motivo: "No se pudo interpretar la respuesta de la IA.", candidatos };
  }

  const json = extraerJson(texto) as
    | { personaId: string | null; confianza: number; motivo: string }
    | null;

  if (!json || typeof json.confianza !== "number") {
    return { tipo: "pendiente", motivo: "No se pudo interpretar la respuesta de la IA.", candidatos };
  }
  // La IA está segura de que ninguno de los candidatos (encontrados por
  // coincidencia difusa de tokens del nombre) es la misma persona — según
  // /09-modulo-padron-electoral.md sección 5, eso es "sin_coincidencia", no
  // "pendiente": `pendiente` es para cuando SÍ hay un candidato pero la
  // confianza queda por debajo del umbral, no para descartes seguros. Tratar
  // esto como pendiente generaba decenas de revisiones sin sentido por cada
  // coincidencia espuria de un token corto y común (ej. "Luis" dentro de
  // "Luisina") — bug real 2026-08-02, visto en producción.
  if (!json.personaId) {
    return { tipo: "sin_coincidencia" };
  }
  if (!candidatos.some((c) => c.id === json.personaId)) {
    // La IA devolvió un id que no está entre los candidatos reales — no es
    // un descarte seguro, algo salió raro en la respuesta, así que sí amerita
    // ojo humano.
    return {
      tipo: "pendiente",
      motivo: json.motivo ?? "La IA devolvió una respuesta inconsistente para esta fila.",
      candidatos,
    };
  }
  if (json.confianza < umbral) {
    return {
      tipo: "pendiente",
      motivo: `Coincidencia de baja confianza (${Math.round(json.confianza * 100)}%): ${json.motivo}`,
      candidatos,
    };
  }

  return { tipo: "vinculado_automatico", personaId: json.personaId, confianza: json.confianza };
}
