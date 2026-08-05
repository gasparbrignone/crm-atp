/**
 * Backfill de PersonaToken (índice invertido del Motor de Resolución de
 * Identidad) para las Personas que ya existían antes de esta tabla —
 * PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 4. Idempotente
 * (sincronizarTokensPersona borra e inserta de nuevo), se puede correr más
 * de una vez sin duplicar filas. Permanente en scripts/ — a diferencia de
 * los scripts de migración de una sola vez, este puede volver a hacer falta
 * si se detecta una Persona sin tokens por cualquier motivo.
 *
 * Uso: node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/backfill-persona-token.ts dotenv_config_path=.env.local
 */
import { prisma } from "@/lib/prisma/client";
import { obtenerCatalogoLexicoIdentidad } from "@/lib/servicios/lexico-identidad.service";
import { sincronizarTokensPersona } from "@/lib/servicios/persona-token.service";

const LOTE = 200;

async function main() {
  const catalogo = await obtenerCatalogoLexicoIdentidad();
  const total = await prisma.persona.count();
  console.log(`[backfill] ${total} Personas a procesar, en lotes de ${LOTE}.`);

  let procesadas = 0;
  let cursor: string | undefined;

  while (true) {
    const lote = await prisma.persona.findMany({
      take: LOTE,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: { id: true, nombre: true, apellido: true },
    });
    if (lote.length === 0) break;

    for (const persona of lote) {
      await sincronizarTokensPersona(prisma, persona.id, persona.nombre, persona.apellido, catalogo);
    }

    procesadas += lote.length;
    cursor = lote[lote.length - 1].id;
    console.log(`[backfill] ${procesadas}/${total} procesadas.`);
  }

  console.log("[backfill] Completado.");
}

main()
  .catch((e) => {
    console.error("[backfill] ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
