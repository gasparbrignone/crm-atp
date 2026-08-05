"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  vincularEntradaManualmente,
  marcarEntradaSinCoincidencia,
  crearPersonaDesdeEntradaPadron,
  activarPadron,
  cerrarPadron,
  eliminarPadron,
  buscarPersonasParaVincular,
  PadronPendientesSinResolverError,
  PadronNoEsBorradorError,
} from "@/lib/servicios/padron.service";

export async function buscarPersonasParaVincularAction(query: string) {
  await requerirPermiso("padron.gestionar");
  return buscarPersonasParaVincular(query);
}

export async function vincularEntradaManualAction(
  padronId: string,
  entradaId: string,
  personaId: string,
) {
  const usuario = await requerirPermiso("padron.gestionar");
  await vincularEntradaManualmente(entradaId, personaId, usuario.id);
  revalidatePath(`/padron/${padronId}`);
}

export async function marcarEntradaSinCoincidenciaAction(padronId: string, entradaId: string) {
  const usuario = await requerirPermiso("padron.gestionar");
  await marcarEntradaSinCoincidencia(entradaId, usuario.id);
  revalidatePath(`/padron/${padronId}`);
}

export async function crearPersonaDesdeEntradaAction(
  padronId: string,
  entradaId: string,
  nombre: string,
  apellido: string,
) {
  const usuario = await requerirPermiso("padron.gestionar");
  if (!nombre.trim() || !apellido.trim()) {
    return { ok: false, error: "Nombre y apellido son obligatorios." };
  }
  await crearPersonaDesdeEntradaPadron(entradaId, { nombre: nombre.trim(), apellido: apellido.trim() }, usuario.id);
  revalidatePath(`/padron/${padronId}`);
  revalidatePath("/personas");
  return { ok: true };
}

export interface ResultadoActivarPadron {
  ok: boolean;
  error?: string;
}

export async function activarPadronAction(padronId: string): Promise<ResultadoActivarPadron> {
  const usuario = await requerirPermiso("padron.gestionar");
  try {
    await activarPadron(padronId, usuario.id);
  } catch (e) {
    if (e instanceof PadronPendientesSinResolverError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath(`/padron/${padronId}`);
  revalidatePath("/padron");
  revalidatePath("/personas");
  return { ok: true };
}

export async function cerrarPadronAction(padronId: string) {
  const usuario = await requerirPermiso("padron.gestionar");
  await cerrarPadron(padronId, usuario.id);
  revalidatePath(`/padron/${padronId}`);
  revalidatePath("/padron");
  revalidatePath("/personas");
}

export interface ResultadoEliminarPadron {
  ok: boolean;
  error?: string;
}

// Solo padrones en borrador — ver PadronNoEsBorradorError en padron.service.ts.
export async function eliminarPadronAction(padronId: string): Promise<ResultadoEliminarPadron> {
  const usuario = await requerirPermiso("padron.gestionar");
  try {
    await eliminarPadron(padronId, usuario.id);
  } catch (e) {
    if (e instanceof PadronNoEsBorradorError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/padron");
  return { ok: true };
}
