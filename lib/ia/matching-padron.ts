import { prisma } from "@/lib/prisma/client";
import { obtenerClienteAnthropic, MODELO_IA_LIVIANO } from "@/lib/ia/cliente-anthropic";

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

async function obtenerCandidatosPorNombre(nombreCompleto: string): Promise<CandidatoPadron[]> {
  const tokens = nombreCompleto
    .replace(",", " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  const candidatos = await prisma.persona.findMany({
    where: {
      estadoFicha: { not: "fusionada" },
      OR: tokens.flatMap((t) => [
        { nombre: { contains: t, mode: "insensitive" as const } },
        { apellido: { contains: t, mode: "insensitive" as const } },
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

Considerá que el nombre del padrón puede venir en cualquier orden ("Apellido, Nombre" o "Nombre Apellido"), con mayúsculas distintas, sin acentos, o con nombres compuestos. Si ninguna candidata es razonablemente la misma persona, decilo explícitamente.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"personaId": "<id de la candidata o null>", "confianza": <número entre 0 y 1>, "motivo": "<explicación breve en español>"}`;

  const cliente = obtenerClienteAnthropic();
  const respuesta = await cliente.messages.create({
    model: MODELO_IA_LIVIANO,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === "text");
  if (!bloqueTexto || bloqueTexto.type !== "text") {
    return { tipo: "pendiente", motivo: "No se pudo interpretar la respuesta de la IA.", candidatos };
  }

  const json = extraerJson(bloqueTexto.text) as
    | { personaId: string | null; confianza: number; motivo: string }
    | null;

  if (!json || typeof json.confianza !== "number") {
    return { tipo: "pendiente", motivo: "No se pudo interpretar la respuesta de la IA.", candidatos };
  }
  if (!json.personaId || !candidatos.some((c) => c.id === json.personaId)) {
    return {
      tipo: "pendiente",
      motivo: json.motivo ?? "Ningún candidato parecido es razonablemente la misma persona.",
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
