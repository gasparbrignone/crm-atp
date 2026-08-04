"use server";

import { revalidatePath } from "next/cache";
import { obtenerUsuarioActual, ErrorSinSesion } from "@/lib/permisos/permisos";
import {
  contarNoLeidas,
  listarNotificacionesRecientes,
  marcarNotificacionLeida,
  marcarTodasLasNotificacionesLeidas,
} from "@/lib/servicios/notificaciones.service";

// Todas las notificaciones son estrictamente por-usuario (no requieren
// permiso adicional más allá de tener sesión — /13-notificaciones.md sección
// 8: "la recepción de notificaciones en sí no requiere permiso adicional").
async function usuarioIdActual(): Promise<string> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) throw new ErrorSinSesion();
  return usuario.id;
}

export async function obtenerCampanaAction() {
  const usuarioId = await usuarioIdActual();
  const [noLeidas, recientes] = await Promise.all([
    contarNoLeidas(usuarioId),
    listarNotificacionesRecientes(usuarioId),
  ]);
  return { noLeidas, recientes };
}

export async function marcarNotificacionLeidaAction(id: string) {
  const usuarioId = await usuarioIdActual();
  await marcarNotificacionLeida(id, usuarioId);
  revalidatePath("/notificaciones");
}

export async function marcarTodasLeidasAction() {
  const usuarioId = await usuarioIdActual();
  await marcarTodasLasNotificacionesLeidas(usuarioId);
  revalidatePath("/notificaciones");
}
