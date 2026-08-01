"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  invitarUsuario,
  actualizarDatosUsuario,
  cambiarRolUsuario,
  cambiarEstadoUsuario,
  EmailYaRegistradoError,
  UltimoAdministradorError,
  ActividadesSinReasignarError,
} from "@/lib/servicios/usuarios.service";

export interface EstadoFormularioUsuario {
  error?: string;
  actividadesSinReasignar?: { id: string; nombre: string }[];
}

export async function invitarUsuarioAction(
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData,
): Promise<EstadoFormularioUsuario> {
  const actor = await requerirPermiso("usuarios.gestionar");

  const email = String(formData.get("email") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim();
  const rolId = String(formData.get("rolId") ?? "");

  if (!email || !nombre || !apellido || !rolId) {
    return { error: "Completá todos los campos." };
  }

  try {
    await invitarUsuario({ email, nombre, apellido, rolId }, actor.id);
  } catch (error) {
    if (error instanceof EmailYaRegistradoError) return { error: error.message };
    throw error;
  }

  revalidatePath("/usuarios");
  return {};
}

const CAMPOS_EDITABLES = ["nombre", "apellido", "telefono"] as const;
type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

function esCampoEditable(campo: string): campo is CampoEditable {
  return (CAMPOS_EDITABLES as readonly string[]).includes(campo);
}

export async function actualizarCampoUsuarioAction(
  usuarioId: string,
  campo: string,
  valor: string,
): Promise<{ error?: string }> {
  const actor = await requerirPermiso("usuarios.gestionar");
  if (!esCampoEditable(campo)) return { error: "Campo no editable." };

  await actualizarDatosUsuario(usuarioId, { [campo]: valor || null }, actor.id);
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  return {};
}

export async function cambiarRolUsuarioAction(
  usuarioId: string,
  nuevoRolId: string,
): Promise<{ error?: string }> {
  const actor = await requerirPermiso("roles.gestionar");
  try {
    await cambiarRolUsuario(usuarioId, nuevoRolId, actor.id);
  } catch (error) {
    if (error instanceof UltimoAdministradorError) return { error: error.message };
    throw error;
  }
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  return {};
}

export async function cambiarEstadoUsuarioAction(
  usuarioId: string,
  nuevoEstado: "activo" | "inactivo",
): Promise<EstadoFormularioUsuario> {
  const actor = await requerirPermiso("usuarios.gestionar");
  try {
    await cambiarEstadoUsuario(usuarioId, nuevoEstado, actor.id);
  } catch (error) {
    if (error instanceof UltimoAdministradorError) return { error: error.message };
    if (error instanceof ActividadesSinReasignarError) {
      return { error: error.message, actividadesSinReasignar: error.actividades };
    }
    throw error;
  }
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  return {};
}
