"use server";

import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  obtenerFilasAuditoriaParaExportar,
  type FiltrosAuditoriaGlobal,
} from "@/lib/servicios/auditoria.service";
import { generarCsv } from "@/lib/utils/csv-export";
import type { ResultadoExport } from "../exportar/actions";

export async function exportarAuditoriaAction(filtros: FiltrosAuditoriaGlobal): Promise<ResultadoExport> {
  await requerirPermiso("auditoria.ver");
  const puedeVerPunteo = await tienePermiso("punteo.ver_todos");
  const eventos = await obtenerFilasAuditoriaParaExportar(filtros, puedeVerPunteo);

  const filas = eventos.map((e) => ({
    fecha: e.fecha.toISOString(),
    usuario: e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : "(proceso automático)",
    entidad: e.entidad,
    entidadId: e.entidadId,
    accion: e.accion,
    campo: e.campo ?? "",
    valorAnterior: e.valorAnterior ?? "",
    valorNuevo: e.valorNuevo ?? "",
  }));

  return { nombreArchivo: `auditoria-${new Date().toISOString().slice(0, 10)}.csv`, csv: generarCsv(filas) };
}
