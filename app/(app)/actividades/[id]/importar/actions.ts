"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { importarParticipacionesCsv } from "@/lib/servicios/participaciones.service";
import { extraerIdDeSheets, listarHojas, obtenerHojaComoCsv } from "@/lib/servicios/google-sheets.service";
import { prisma } from "@/lib/prisma/client";
import type { CampoInscripcionImportable } from "@/lib/utils/csv-mapping-inscripciones";
import type { CandidatoAmbiguo } from "@/lib/ia/deteccion-duplicados";

export async function listarHojasDeCalculoAction(urlHoja: string) {
  await requerirPermiso("importaciones.ejecutar");
  const spreadsheetId = extraerIdDeSheets(urlHoja);
  if (!spreadsheetId) throw new Error("Ese link no parece ser de Google Sheets.");
  const hojas = await listarHojas(spreadsheetId);
  return { spreadsheetId, hojas };
}

export async function obtenerHojaComoCsvAction(spreadsheetId: string, tituloHoja: string) {
  await requerirPermiso("importaciones.ejecutar");
  return obtenerHojaComoCsv(spreadsheetId, tituloHoja);
}

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
): Promise<ResultadoImportacionInscriptos> {
  const usuario = await requerirPermiso("importaciones.ejecutar");

  const job = await importarParticipacionesCsv({
    actividadId,
    usuarioId: usuario.id,
    nombreArchivo,
    contenidoCsv,
    mapeo,
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
