import { prisma } from "@/lib/prisma/client";
import type { AccionHistorial } from "@prisma/client";

interface RegistrarCambioInput {
  entidad: string;
  entidadId: string;
  accion: AccionHistorial;
  usuarioId: string | null;
  campo?: string;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  metadata?: Record<string, unknown>;
}

// HistorialCambio es append-only (ver /04-modelo-datos.md sección 11 y RN-6):
// solo INSERT, nunca UPDATE/DELETE desde la aplicación. Todo servicio que
// modifique una entidad de negocio pasa por acá para dejar el rastro exigido
// por el principio rector 7 de /01-vision-alcance.md.
export async function registrarCambio(input: RegistrarCambioInput) {
  if (!input.usuarioId && !input.metadata) {
    throw new Error(
      "RN-6: un evento sin usuario debe traer metadata identificando el proceso que lo generó.",
    );
  }

  return prisma.historialCambio.create({
    data: {
      entidad: input.entidad,
      entidadId: input.entidadId,
      accion: input.accion,
      usuarioId: input.usuarioId,
      campo: input.campo,
      valorAnterior: input.valorAnterior ?? null,
      valorNuevo: input.valorNuevo ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
