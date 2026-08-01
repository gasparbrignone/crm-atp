import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";

// Resuelve el Usuario (con Rol y permisos) de la sesión activa. Memoizado por
// request con React cache() para no repetir la consulta en cada componente/
// Server Action de un mismo render. Ver /03-arquitectura.md sección 8: toda
// Server Action que mute datos verifica sesión y permiso antes de ejecutar
// cualquier lógica.
export const obtenerUsuarioActual = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return prisma.usuario.findUnique({
    where: { id: user.id },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
});

export type UsuarioConPermisos = NonNullable<
  Awaited<ReturnType<typeof obtenerUsuarioActual>>
>;

export async function tienePermiso(codigo: string): Promise<boolean> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.estado !== "activo") return false;
  return usuario.rol.permisos.some((rp) => rp.permiso.codigo === codigo);
}

export class ErrorPermisoDenegado extends Error {
  constructor(codigo: string) {
    super(`No tenés permiso para hacer esto (${codigo}).`);
    this.name = "ErrorPermisoDenegado";
  }
}

export class ErrorSinSesion extends Error {
  constructor() {
    super("No hay una sesión activa.");
    this.name = "ErrorSinSesion";
  }
}

// Usar al inicio de toda Server Action que mute o lea datos protegidos.
// Lanza si no hay sesión o si el usuario no tiene el permiso pedido — nunca
// devuelve silenciosamente un resultado parcial.
export async function requerirPermiso(codigo: string): Promise<UsuarioConPermisos> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) throw new ErrorSinSesion();
  if (usuario.estado !== "activo") throw new ErrorPermisoDenegado(codigo);
  const tiene = usuario.rol.permisos.some((rp) => rp.permiso.codigo === codigo);
  if (!tiene) throw new ErrorPermisoDenegado(codigo);
  return usuario;
}
