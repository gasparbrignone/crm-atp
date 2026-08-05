import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { tokenizarCampoEstructurado, type CatalogoLexicoIdentidad } from "@/lib/identidad/normalizar";
import { obtenerCatalogoLexicoIdentidad } from "@/lib/servicios/lexico-identidad.service";

// Mantiene el índice invertido PersonaToken sincronizado con los campos
// nombre/apellido de una Persona — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// sección 4. Único punto de escritura de esta tabla: crearPersona() y
// actualizarPersona() (personas.service.ts) la llaman siempre que crean o
// modifican nombre/apellido; el backfill (scripts/backfill-persona-token.ts)
// la usa una sola vez para las Personas que ya existían antes de esta tabla.
//
// Acepta el cliente Prisma como parámetro (en vez de importar la instancia
// única directamente) para poder correr DENTRO de la misma transacción que
// crearPersona() ya usa — nunca deja a una Persona sin sus tokens
// sincronizados por una falla a mitad de camino.
export async function sincronizarTokensPersona(
  cliente: PrismaClient | Prisma.TransactionClient,
  personaId: string,
  nombre: string,
  apellido: string,
  // Opcional, mismo motivo que en el resto de los callers del catálogo
  // léxico — un backfill de miles de Personas debe cargarlo una sola vez,
  // no por fila.
  catalogoLexicoPrecalculado?: CatalogoLexicoIdentidad,
): Promise<void> {
  const catalogo = catalogoLexicoPrecalculado ?? (await obtenerCatalogoLexicoIdentidad());
  const tokensNombre = tokenizarCampoEstructurado(nombre, catalogo);
  const tokensApellido = tokenizarCampoEstructurado(apellido, catalogo);

  await cliente.personaToken.deleteMany({ where: { personaId } });

  const filas = [
    ...tokensNombre.map((token) => ({ personaId, token, esApellido: false })),
    ...tokensApellido.map((token) => ({ personaId, token, esApellido: true })),
  ];
  if (filas.length > 0) {
    await cliente.personaToken.createMany({ data: filas });
  }
}

// Generación de candidatos por índice invertido — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// sección 4, reemplaza el blocking anterior de lib/ia/deteccion-duplicados.ts
// y lib/ia/matching-padron.ts (similitud de trigramas sobre el CAMPO
// COMPLETO de apellido, que se volvía indulgente con apellidos cortos que
// comparten sufijos comunes del español — ver diagnóstico completo en ese
// documento). Dos estrategias, unidas:
//   1. Coincidencia EXACTA de algún token — barata, indexada, sin el
//      problema de similitud normalizada sobre strings cortos.
//   2. Variante de tipeo — similitud de trigramas, pero SOLO sobre el TOKEN
//      individual (nunca sobre el campo completo), como preselección barata
//      antes del filtro de distancia de edición absoluta que hace la etapa
//      de poda (lib/identidad/poda.ts) más adelante en el pipeline.
const UMBRAL_SIMILITUD_TOKEN_BLOCKING = 0.45;
const LIMITE_CANDIDATOS_BLOCKING = 40;

export async function buscarPersonaIdsPorTokens(
  tokens: string[],
  soloApellido: boolean,
): Promise<string[]> {
  const tokensValidos = [...new Set(tokens.filter((t) => t.length >= 2))];
  if (tokensValidos.length === 0) return [];

  const condicionRol = soloApellido ? Prisma.sql`AND "esApellido" = true` : Prisma.empty;
  const ids = new Set<string>();

  const exactos = await prisma.$queryRaw<{ personaId: string }[]>`
    SELECT DISTINCT "personaId" FROM "PersonaToken"
    WHERE token = ANY(${tokensValidos}) ${condicionRol}
  `;
  for (const fila of exactos) ids.add(fila.personaId);

  for (const token of tokensValidos) {
    if (token.length < 3) continue;
    const parecidos = await prisma.$queryRaw<{ personaId: string }[]>`
      SELECT DISTINCT "personaId" FROM "PersonaToken"
      WHERE similarity(token, ${token}) > ${UMBRAL_SIMILITUD_TOKEN_BLOCKING} ${condicionRol}
    `;
    for (const fila of parecidos) ids.add(fila.personaId);
  }

  return [...ids].slice(0, LIMITE_CANDIDATOS_BLOCKING);
}
