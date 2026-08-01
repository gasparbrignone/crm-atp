"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  crearRolPersonalizado,
  actualizarPermisosRol,
  actualizarDatosRol,
  eliminarRolPersonalizado,
  RolDeSistemaError,
} from "@/lib/servicios/roles.service";
import { RolConUsuariosError } from "@/lib/servicios/usuarios.service";

export interface EstadoFormularioRol {
  error?: string;
}

export async function crearRolAction(
  _estadoPrevio: EstadoFormularioRol,
  formData: FormData,
): Promise<EstadoFormularioRol> {
  const actor = await requerirPermiso("roles.gestionar");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const permisoIds = formData.getAll("permisoIds").map(String);

  if (!nombre) return { error: "El rol necesita un nombre." };
  if (permisoIds.length === 0) return { error: "Seleccioná al menos un permiso." };

  await crearRolPersonalizado({ nombre, descripcion: descripcion || undefined, permisoIds }, actor.id);
  revalidatePath("/usuarios/roles");
  return {};
}

export async function actualizarRolAction(
  rolId: string,
  datos: { nombre?: string; descripcion?: string },
  permisoIds: string[],
): Promise<EstadoFormularioRol> {
  const actor = await requerirPermiso("roles.gestionar");
  try {
    if (datos.nombre !== undefined || datos.descripcion !== undefined) {
      await actualizarDatosRol(rolId, datos, actor.id);
    }
    await actualizarPermisosRol(rolId, permisoIds, actor.id);
  } catch (error) {
    if (error instanceof RolDeSistemaError) return { error: error.message };
    throw error;
  }
  revalidatePath("/usuarios/roles");
  revalidatePath(`/usuarios/roles/${rolId}`);
  return {};
}

export async function eliminarRolAction(rolId: string): Promise<EstadoFormularioRol> {
  const actor = await requerirPermiso("roles.gestionar");
  try {
    await eliminarRolPersonalizado(rolId, actor.id);
  } catch (error) {
    if (error instanceof RolDeSistemaError || error instanceof RolConUsuariosError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/usuarios/roles");
  return {};
}
