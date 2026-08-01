"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  buscarPersonasParaPuntear,
  agregarComentarioPunteo,
  actualizarClasificacionPunteo,
  actualizarEstadoSeguimiento,
  crearPersonaDesdePunteo,
} from "@/lib/servicios/punteo.service";
import { DniDuplicadoError } from "@/lib/servicios/personas.service";
import type { EstadoSeguimientoPunteo } from "@prisma/client";

export async function buscarPersonasParaPuntearAction(query: string) {
  await requerirPermiso("punteo.ver_propio");
  return buscarPersonasParaPuntear(query);
}

export interface ResultadoCrearPersonaDesdePunteo {
  ok: boolean;
  personaId?: string;
  error?: string;
}

// Alta manual desde /punteo — pedido explícito de Gaspar (2026-08-01): el
// punteo releva potenciales votantes que no necesariamente pasaron por una
// Actividad ni por una importación de CSV, así que no puede depender
// únicamente de encontrar a alguien ya cargado.
export async function crearPersonaDesdePunteoAction(
  nombre: string,
  apellido: string,
  telefono: string,
): Promise<ResultadoCrearPersonaDesdePunteo> {
  const usuario = await requerirPermiso("personas.crear");
  if (!nombre.trim() || !apellido.trim()) {
    return { ok: false, error: "Nombre y apellido son obligatorios." };
  }
  try {
    const persona = await crearPersonaDesdePunteo(
      { nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim() },
      usuario.id,
    );
    revalidatePath("/personas");
    return { ok: true, personaId: persona.id };
  } catch (e) {
    if (e instanceof DniDuplicadoError) return { ok: false, error: e.message };
    throw e;
  }
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
