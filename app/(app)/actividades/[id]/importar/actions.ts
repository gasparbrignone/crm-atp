"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { importarParticipacionesCsv } from "@/lib/servicios/participaciones.service";
import { prisma } from "@/lib/prisma/client";
import type { CampoInscripcionImportable } from "@/lib/utils/csv-mapping-inscripciones";
import type { CandidatoAmbiguo } from "@/lib/ia/deteccion-duplicados";

export interface FilaPendienteRevision {
  numeroFila: number;
  motivo: string;
  candidatos: CandidatoAmbiguo[];
}

export interface ResultadoImportacionInscriptos {
  jobId: string;
  totalFilas: number;
  exitosas: number;
  altasNuevas: number;
  conError: number;
  estado: string;
  errores: FilaPendienteRevision[];
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
  revalidatePath("/personas");

  const erroresCrudos = await prisma.importJobError.findMany({
    where: { importJobId: job.id },
    orderBy: { numeroFila: "asc" },
    take: 100,
    select: { numeroFila: true, mensajeError: true },
  });

  const errores: FilaPendienteRevision[] = erroresCrudos.map((e) => {
    try {
      const parseado = JSON.parse(e.mensajeError) as { motivo: string; candidatos: CandidatoAmbiguo[] };
      return { numeroFila: e.numeroFila, motivo: parseado.motivo, candidatos: parseado.candidatos ?? [] };
    } catch {
      return { numeroFila: e.numeroFila, motivo: e.mensajeError, candidatos: [] };
    }
  });

  return {
    jobId: job.id,
    totalFilas: job.totalFilas ?? 0,
    exitosas: job.filasExitosas,
    altasNuevas: job.altasNuevas,
    conError: job.filasConError,
    estado: job.estado,
    errores,
  };
}
