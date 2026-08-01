"use server";

import { revalidatePath } from "next/cache";
import type { EstadoParticipacion } from "@prisma/client";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  inscribirPersona,
  inscribirMasivo,
  cambiarEstadoParticipacion,
  cancelarParticipacion,
  buscarPersonasParaInscribir,
  ActividadNoAceptaInscripcionesError,
  TransicionParticipacionInvalidaError,
  type ResultadoInscripcionMasiva,
} from "@/lib/servicios/participaciones.service";

export async function inscribirPersonaAction(
  actividadId: string,
  personaId: string,
): Promise<{ error?: string }> {
  const usuario = await requerirPermiso("participaciones.gestionar");
  try {
    await inscribirPersona(actividadId, personaId, usuario.id);
  } catch (error) {
    if (error instanceof ActividadNoAceptaInscripcionesError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath(`/actividades/${actividadId}/asistencia`);
  return {};
}

export async function buscarPersonasParaInscribirAction(actividadId: string, q: string) {
  await requerirPermiso("participaciones.gestionar");
  return buscarPersonasParaInscribir(actividadId, q);
}

export async function cambiarEstadoParticipacionAction(
  actividadId: string,
  participacionId: string,
  estado: EstadoParticipacion,
): Promise<{ error?: string }> {
  const usuario = await requerirPermiso("participaciones.gestionar");
  try {
    await cambiarEstadoParticipacion(participacionId, estado, usuario.id);
  } catch (error) {
    if (error instanceof TransicionParticipacionInvalidaError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath(`/actividades/${actividadId}/asistencia`);
  return {};
}

export async function cancelarParticipacionAction(actividadId: string, participacionId: string) {
  const usuario = await requerirPermiso("participaciones.gestionar");
  await cancelarParticipacion(participacionId, usuario.id);
  revalidatePath(`/actividades/${actividadId}`);
  revalidatePath(`/actividades/${actividadId}/asistencia`);
}

// Inscripción masiva desde un listado filtrado de Personas —
// /07-modulo-participaciones.md sección 6. Requiere el permiso elevado
// `participaciones.gestionar_masivo`, distinto del de inscripción individual.
export async function inscribirMasivoAction(
  actividadId: string,
  personaIds: string[],
  confirmarSobrecupo = false,
): Promise<ResultadoInscripcionMasiva & { error?: string }> {
  const usuario = await requerirPermiso("participaciones.gestionar_masivo");
  try {
    const resultado = await inscribirMasivo(
      actividadId,
      personaIds,
      usuario.id,
      confirmarSobrecupo,
    );
    revalidatePath(`/actividades/${actividadId}`);
    revalidatePath("/personas");
    return resultado;
  } catch (error) {
    if (error instanceof ActividadNoAceptaInscripcionesError) {
      return {
        error: error.message,
        requiereConfirmacion: false,
        entrarianSinExceder: 0,
        totalSeleccionadas: personaIds.length,
        yaInscriptas: 0,
        creadas: 0,
        reactivadas: 0,
      };
    }
    throw error;
  }
}

export async function puedeGestionarMasivoAction() {
  return tienePermiso("participaciones.gestionar_masivo");
}
