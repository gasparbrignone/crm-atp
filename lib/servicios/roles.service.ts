import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { RolConUsuariosError } from "@/lib/servicios/usuarios.service";

export class RolDeSistemaError extends Error {
  constructor() {
    super("Los 4 roles base del sistema no se pueden eliminar ni renombrar.");
    this.name = "RolDeSistemaError";
  }
}

export async function listarRoles() {
  const roles = await prisma.rol.findMany({
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { usuarios: true, permisos: true } },
    },
  });
  return roles;
}

export async function obtenerRolConPermisos(id: string) {
  const rol = await prisma.rol.findUnique({
    where: { id },
    include: { permisos: { include: { permiso: true } } },
  });
  if (!rol) return null;
  return {
    ...rol,
    permisoIds: rol.permisos.map((rp) => rp.permisoId),
  };
}

export async function listarCatalogoPermisos() {
  return prisma.permiso.findMany({ orderBy: [{ modulo: "asc" }, { codigo: "asc" }] });
}

export interface DatosRolPersonalizado {
  nombre: string;
  descripcion?: string;
  permisoIds: string[];
}

// Roles personalizados — /10-usuarios-roles-permisos.md sección 7: la
// organización puede combinar cualquier subconjunto del catálogo de
// permisos sin cambio de código. Siempre esRolSistema=false: los 4 roles
// base ya vienen sembrados y no se crean por esta vía.
export async function crearRolPersonalizado(datos: DatosRolPersonalizado, actorId: string) {
  const rol = await prisma.rol.create({
    data: {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      esRolSistema: false,
      permisos: { create: datos.permisoIds.map((permisoId) => ({ permisoId })) },
    },
  });
  await registrarCambio({ entidad: "Rol", entidadId: rol.id, accion: "crear", usuarioId: actorId });
  return rol;
}

// Editar el conjunto de permisos de un rol — permitido incluso en los 4
// roles base (/10-usuarios-roles-permisos.md sección 7; la advertencia de
// impacto amplio se muestra en la UI, no se bloquea acá). Reemplaza el
// conjunto completo en una transacción.
export async function actualizarPermisosRol(rolId: string, permisoIds: string[], actorId: string) {
  await prisma.$transaction([
    prisma.rolPermiso.deleteMany({ where: { rolId } }),
    prisma.rolPermiso.createMany({
      data: permisoIds.map((permisoId) => ({ rolId, permisoId })),
    }),
  ]);
  await registrarCambio({
    entidad: "Rol",
    entidadId: rolId,
    accion: "editar",
    usuarioId: actorId,
    campo: "permisos",
  });
}

export async function actualizarDatosRol(
  rolId: string,
  datos: { nombre?: string; descripcion?: string },
  actorId: string,
) {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { id: rolId } });
  if (rol.esRolSistema && datos.nombre && datos.nombre !== rol.nombre) {
    throw new RolDeSistemaError();
  }
  const actualizado = await prisma.rol.update({ where: { id: rolId }, data: datos });
  await registrarCambio({ entidad: "Rol", entidadId: rolId, accion: "editar", usuarioId: actorId });
  return actualizado;
}

// Eliminación de rol personalizado — /10-usuarios-roles-permisos.md sección
// 7: solo si no tiene usuarios asignados y no es uno de los 4 roles base.
export async function eliminarRolPersonalizado(rolId: string, actorId: string) {
  const rol = await prisma.rol.findUniqueOrThrow({
    where: { id: rolId },
    include: { _count: { select: { usuarios: true } } },
  });
  if (rol.esRolSistema) throw new RolDeSistemaError();
  if (rol._count.usuarios > 0) throw new RolConUsuariosError(rol._count.usuarios);

  await prisma.rol.delete({ where: { id: rolId } });
  await registrarCambio({ entidad: "Rol", entidadId: rolId, accion: "archivar", usuarioId: actorId });
}
