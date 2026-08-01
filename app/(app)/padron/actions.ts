"use server";

import { requerirPermiso } from "@/lib/permisos/permisos";
import { crearPadronElectoral } from "@/lib/servicios/padron.service";

export interface EstadoFormularioPadron {
  error?: string;
  padronId?: string;
}

export async function crearPadronAction(
  _estadoPrevio: EstadoFormularioPadron,
  formData: FormData,
): Promise<EstadoFormularioPadron> {
  const usuario = await requerirPermiso("padron.importar");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const fechaEleccion = String(formData.get("fechaEleccion") ?? "");

  if (!nombre) return { error: "El nombre del padrón es obligatorio." };

  const padron = await crearPadronElectoral(nombre, fechaEleccion || undefined, usuario.id);
  return { padronId: padron.id };
}
