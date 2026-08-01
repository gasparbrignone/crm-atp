"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { procesarImportacionPersonasCsv } from "@/lib/servicios/importaciones.service";
import { prisma } from "@/lib/prisma/client";
import type { CampoPersonaImportable } from "@/lib/utils/csv-mapping";

export interface ResultadoImportacion {
  jobId: string;
  totalFilas: number;
  exitosas: number;
  conError: number;
  duplicados: number;
  estado: string;
  errores: { numeroFila: number; mensajeError: string }[];
}

export async function ejecutarImportacionCsvAction(
  nombreArchivo: string,
  contenidoCsv: string,
  mapeo: Record<string, CampoPersonaImportable | "">,
): Promise<ResultadoImportacion> {
  const usuario = await requerirPermiso("importaciones.ejecutar");

  const job = await procesarImportacionPersonasCsv({
    usuarioId: usuario.id,
    nombreArchivo,
    contenidoCsv,
    mapeo,
  });

  revalidatePath("/personas");

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
    duplicados: job.duplicadosDetectados,
    estado: job.estado,
    errores,
  };
}
