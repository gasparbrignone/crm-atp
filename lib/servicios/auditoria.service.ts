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

// Línea de tiempo por entidad — /17-auditoria-historial.md sección 6. Quien
// puede ver la ficha de la entidad puede ver su historial, sin permiso
// separado (sección 10) — la excepción de punteo se resuelve en su propio
// módulo, no acá. Orden cronológico descendente (más reciente arriba).
//
// Nota: hoy cada campo modificado en una misma edición genera su propia fila
// de HistorialCambio (ver actualizarPersona() en personas.service.ts), no un
// único evento agrupado por operación de guardado como describe la sección 8
// del documento — se muestran tal cual, como entradas separadas, en vez de
// re-agruparlas acá con heurísticas de timestamp que podrían unir eventos de
// operaciones distintas por error.
export async function obtenerHistorialDeEntidad(entidad: string, entidadId: string) {
  const eventos = await prisma.historialCambio.findMany({
    where: { entidad, entidadId },
    include: { usuario: { select: { nombre: true, apellido: true } } },
    orderBy: { fecha: "desc" },
  });

  return eventos.map((e) => ({
    id: e.id,
    accion: e.accion,
    campo: e.campo,
    valorAnterior: e.valorAnterior,
    valorNuevo: e.valorNuevo,
    fecha: e.fecha,
    usuarioNombre: e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : null,
    metadata: e.metadata ? (JSON.parse(e.metadata) as Record<string, unknown>) : null,
  }));
}
