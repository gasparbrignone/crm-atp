"use client";

import { BotonExportar } from "../exportar/BotonExportar";
import { exportarAuditoriaAction } from "./actions";
import type { FiltrosAuditoriaGlobal } from "@/lib/servicios/auditoria.service";

export function ExportarAuditoriaBoton({ filtros }: { filtros: FiltrosAuditoriaGlobal }) {
  return <BotonExportar accion={() => exportarAuditoriaAction(filtros)} />;
}
