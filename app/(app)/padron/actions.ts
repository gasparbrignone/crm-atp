"use server";

import { requerirPermiso } from "@/lib/permisos/permisos";
import { crearPadronElectoral } from "@/lib/servicios/padron.service";
import type { TipoPadronElectoral } from "@prisma/client";

export interface EstadoFormularioPadron {
  error?: string;
  padronId?: string;
}

const TIPOS_VALIDOS: TipoPadronElectoral[] = ["consejo_directivo", "centro_estudiantes"];

export async function crearPadronAction(
  _estadoPrevio: EstadoFormularioPadron,
  formData: FormData,
): Promise<EstadoFormularioPadron> {
  const usuario = await requerirPermiso("padron.importar");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const fechaEleccion = String(formData.get("fechaEleccion") ?? "");

  if (!nombre) return { error: "El nombre del padrón es obligatorio." };
  if (!TIPOS_VALIDOS.includes(tipo as TipoPadronElectoral)) {
    return { error: "Elegí a qué padrón corresponde: Consejo Directivo o Centro de Estudiantes." };
  }

  const padron = await crearPadronElectoral(
    nombre,
    tipo as TipoPadronElectoral,
    fechaEleccion || undefined,
    usuario.id,
  );
  return { padronId: padron.id };
}
