"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoActividad } from "@prisma/client";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import {
  crearActividad,
  actualizarActividad,
  cambiarEstadoActividad,
  cancelarActividad,
  ActividadCicloError,
  TransicionEstadoInvalidaError,
} from "@/lib/servicios/actividades.service";
import {
  actividadFormSchema,
  actividadCampoSchema,
} from "@/lib/validaciones/actividad.validation";

export interface EstadoFormularioActividad {
  error?: string;
  erroresCampo?: Record<string, string>;
}

function datosDeFormulario(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? ""),
    tipoActividadId: String(formData.get("tipoActividadId") ?? ""),
    descripcion: String(formData.get("descripcion") ?? ""),
    fechaInicio: String(formData.get("fechaInicio") ?? ""),
    fechaFin: String(formData.get("fechaFin") ?? ""),
    modalidad: String(formData.get("modalidad") ?? "presencial"),
    lugar: String(formData.get("lugar") ?? ""),
    cupoMaximo: String(formData.get("cupoMaximo") ?? ""),
    responsableId: String(formData.get("responsableId") ?? ""),
    actividadPadreId: String(formData.get("actividadPadreId") ?? ""),
    observaciones: String(formData.get("observaciones") ?? ""),
  };
}

// Un Militante solo puede editar/gestionar actividades de las que es
// responsable, salvo que tenga `actividades.gestionar_todas` —
// /06-modulo-actividades.md sección 9.
async function requerirGestionActividad(actividadId: string) {
  const usuario = await requerirPermiso("actividades.editar");
  const puedeTodas = usuario.rol.permisos.some(
    (rp) => rp.permiso.codigo === "actividades.gestionar_todas",
  );
  if (puedeTodas) return usuario;

  const actividad = await prisma.actividad.findUniqueOrThrow({
    where: { id: actividadId },
    select: { responsableId: true },
  });
  if (actividad.responsableId !== usuario.id) {
    throw new Error("Solo podés editar actividades de las que sos responsable.");
  }
  return usuario;
}

export async function crearActividadAction(
  _estadoPrevio: EstadoFormularioActividad,
  formData: FormData,
): Promise<EstadoFormularioActividad> {
  const usuario = await requerirPermiso("actividades.crear");

  const parsed = actividadFormSchema.safeParse(datosDeFormulario(formData));
  if (!parsed.success) {
    const erroresCampo: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      erroresCampo[String(issue.path[0])] = issue.message;
    }
    return { error: "Revisá los campos marcados.", erroresCampo };
  }

  let actividadId: string;
  try {
    const actividad = await crearActividad(parsed.data, usuario.id);
    actividadId = actividad.id;
  } catch (error) {
    if (error instanceof ActividadCicloError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/actividades");
  redirect(`/actividades/${actividadId}`);
}

export async function actualizarCampoActividadAction(
  actividadId: string,
  campo: string,
  valor: string,
): Promise<{ error?: string }> {
  const usuario = await requerirGestionActividad(actividadId);

  const parsed = actividadCampoSchema.safeParse({ [campo]: valor });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valor inválido." };
  }

  try {
    await actualizarActividad(actividadId, parsed.data, usuario.id);
  } catch (error) {
    if (error instanceof ActividadCicloError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath("/actividades");
  return {};
}

export async function cambiarEstadoActividadAction(
  actividadId: string,
  nuevoEstado: EstadoActividad,
): Promise<{ error?: string }> {
  const usuario = await requerirGestionActividad(actividadId);

  try {
    await cambiarEstadoActividad(actividadId, nuevoEstado, usuario.id);
  } catch (error) {
    if (error instanceof TransicionEstadoInvalidaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath("/actividades");
  return {};
}

// Variante para uso directo como `action` de un <form> (sin manejo de estado
// en cliente) — cambiarEstadoActividadAction devuelve {error?} para el uso
// interactivo, esta descarta el resultado y confía en que la transición ya
// fue validada en la UI antes de mostrar el botón.
export async function cambiarEstadoActividadFormAction(
  actividadId: string,
  nuevoEstado: EstadoActividad,
) {
  await cambiarEstadoActividadAction(actividadId, nuevoEstado);
}

export async function cancelarActividadAction(actividadId: string) {
  const usuario = await requerirPermiso("actividades.eliminar");
  await cancelarActividad(actividadId, usuario.id);
  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath("/actividades");
}
