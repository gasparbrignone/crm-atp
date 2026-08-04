"use server";

import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  exportarPersonas,
  exportarActividadesConParticipaciones,
  exportarPadron,
  exportarPunteo,
} from "@/lib/servicios/exportaciones.service";
import { generarCsv } from "@/lib/utils/csv-export";

export interface ResultadoExport {
  nombreArchivo: string;
  csv: string;
}

const FECHA_ARCHIVO = () => new Date().toISOString().slice(0, 10);

export async function exportarPersonasAction(carreraId?: string): Promise<ResultadoExport> {
  const actor = await requerirPermiso("personas.exportar");
  const filas = await exportarPersonas({ carreraId: carreraId || undefined }, actor.id);
  return { nombreArchivo: `personas-${FECHA_ARCHIVO()}.csv`, csv: generarCsv(filas) };
}

export async function exportarActividadesAction(desde?: string, hasta?: string): Promise<ResultadoExport> {
  const actor = await requerirPermiso("exportaciones.ejecutar");
  const filas = await exportarActividadesConParticipaciones(
    { desde: desde ? new Date(desde) : undefined, hasta: hasta ? new Date(hasta) : undefined },
    actor.id,
  );
  return { nombreArchivo: `actividades-participaciones-${FECHA_ARCHIVO()}.csv`, csv: generarCsv(filas) };
}

export async function exportarPadronAction(padronId: string): Promise<ResultadoExport> {
  const actor = await requerirPermiso("padron.exportar");
  const filas = await exportarPadron(padronId, actor.id);
  return { nombreArchivo: `padron-${padronId}-${FECHA_ARCHIVO()}.csv`, csv: generarCsv(filas) };
}

export async function exportarPunteoAction(): Promise<ResultadoExport> {
  const actor = await requerirPermiso("exportaciones.ejecutar");
  const puedeTodos = await tienePermiso("punteo.exportar_todos");
  if (!puedeTodos) await requerirPermiso("punteo.exportar_propio");
  const filas = await exportarPunteo(actor.id, { soloPropio: !puedeTodos });
  return { nombreArchivo: `punteo-${FECHA_ARCHIVO()}.csv`, csv: generarCsv(filas) };
}
