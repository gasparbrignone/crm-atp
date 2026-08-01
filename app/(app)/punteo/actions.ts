"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  buscarPersonasParaPuntear,
  agregarComentarioPunteo,
  actualizarClasificacionPunteo,
  actualizarEstadoSeguimiento,
} from "@/lib/servicios/punteo.service";
import type { EstadoSeguimientoPunteo } from "@prisma/client";

export async function buscarPersonasParaPuntearAction(query: string) {
  await requerirPermiso("punteo.ver_propio");
  return buscarPersonasParaPuntear(query);
}

export async function agregarComentarioPunteoAction(personaId: string, contenido: string) {
  const usuario = await requerirPermiso("punteo.ver_propio");
  await agregarComentarioPunteo(usuario.id, personaId, contenido);
  revalidatePath(`/punteo/${personaId}`);
  revalidatePath("/punteo");
}

export async function actualizarClasificacionPunteoAction(
  personaId: string,
  clasificacionId: string,
) {
  const usuario = await requerirPermiso("punteo.ver_propio");
  await actualizarClasificacionPunteo(usuario.id, personaId, clasificacionId || null);
  revalidatePath(`/punteo/${personaId}`);
  revalidatePath("/punteo");
}

export async function actualizarEstadoSeguimientoAction(
  personaId: string,
  estadoSeguimiento: EstadoSeguimientoPunteo,
) {
  const usuario = await requerirPermiso("punteo.ver_propio");
  await actualizarEstadoSeguimiento(usuario.id, personaId, estadoSeguimiento);
  revalidatePath(`/punteo/${personaId}`);
  revalidatePath("/punteo");
}

// Solo para conducción (punteo.ver_todos): saber si el usuario actual puede
// ver punteo ajeno, usado por la ficha de punteo para decidir si acepta
// ?usuario= en la URL.
export async function puedeVerPunteoDeTodosAction() {
  return tienePermiso("punteo.ver_todos");
}
