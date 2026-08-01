"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { importarParticipacionesCsv } from "@/lib/servicios/participaciones.service";
import { prisma } from "@/lib/prisma/client";
import type { CampoInscripcionImportable } from "@/lib/utils/csv-mapping-inscripciones";

export interface ResultadoImportacionInscriptos {
  jobId: string;
  totalFilas: number;
  exitosas: number;
  conError: number;
  estado: string;
  errores: { numeroFila: number; mensajeError: string }[];
}

export async function importarInscriptosCsvAction(
  actividadId: string,
  nombreArchivo: string,
  contenidoCsv: string,
  mapeo: Record<string, CampoInscripcionImportable | "">,
  carreraDefaultId: string | undefined,
  anioDefault: number | undefined,
): Promise<ResultadoImportacionInscriptos> {
  const usuario = await requerirPermiso("importaciones.ejecutar");

  const job = await importarParticipacionesCsv({
    actividadId,
    usuarioId: usuario.id,
    nombreArchivo,
    contenidoCsv,
    mapeo,
    carreraDefaultId,
    anioDefault,
  });

  revalidatePath(`/actividades/${actividadId}`);

  const errores = await prisma.importJobError.findMany({
    where: { importJobId: job.id },
    orderBy: { numeroFila: "asc" },
    take: 100,
    select: { numeroFila: true, mensajeError: true },
  });

  return {
    jobId: job.id,
    totalFilas: job.totalFilas ?? 0,
    exitosas: job.filasExitosas,
    conError: job.filasConError,
    estado: job.estado,
    errores,
  };
}
