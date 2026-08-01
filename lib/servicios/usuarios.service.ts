import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";

export class UltimoAdministradorError extends Error {
  constructor() {
    super(
      "No se puede dejar al sistema sin ningún Administrador activo — reasigná el rol de otro usuario a Administrador antes de continuar.",
    );
    this.name = "UltimoAdministradorError";
  }
}

export class ActividadesSinReasignarError extends Error {
  constructor(public actividades: { id: string; nombre: string }[]) {
    super(
      `Este usuario es responsable de ${actividades.length} actividad(es) planificada(s) o en curso — reasignalas a otro responsable antes de desactivarlo.`,
    );
    this.name = "ActividadesSinReasignarError";
  }
}

export class EmailYaRegistradoError extends Error {
  constructor(email: string) {
    super(`Ya existe un usuario con el email ${email}.`);
    this.name = "EmailYaRegistradoError";
  }
}

export class RolConUsuariosError extends Error {
  constructor(public cantidadUsuarios: number) {
    super(
      `Este rol tiene ${cantidadUsuarios} usuario(s) asignado(s) — reasignalos a otro rol antes de eliminarlo.`,
    );
    this.name = "RolConUsuariosError";
  }
}

export interface FiltrosListadoUsuarios {
  q?: string;
  rolId?: string;
  estado?: string;
  pagina?: number;
  porPagina?: number;
}

const USUARIO_PORPAGINA_DEFAULT = 50;

// Listado paginado server-side — /03-arquitectura.md sección 11 y
// /CLAUDE.md sección 4 (paginación obligatoria en todo listado).
export async function listarUsuarios(filtros: FiltrosListadoUsuarios) {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const porPagina = filtros.porPagina ?? USUARIO_PORPAGINA_DEFAULT;

  const where: Record<string, unknown> = {};
  if (filtros.rolId) where.rolId = filtros.rolId;
  if (filtros.estado) where.estado = filtros.estado;
  if (filtros.q) {
    const q = filtros.q.trim();
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { apellido: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [usuarios, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      include: { rol: true },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.usuario.count({ where }),
  ]);

  return { usuarios, total, pagina, porPagina };
}

export async function obtenerUsuario(id: string) {
  return prisma.usuario.findUnique({
    where: { id },
    include: { rol: true },
  });
}

export interface DatosInvitacion {
  email: string;
  nombre: string;
  apellido: string;
  rolId: string;
}

// Alta de usuario — /10-usuarios-roles-permisos.md sección 6: el sistema
// envía una invitación vía Supabase Auth (no se comparten contraseñas
// manualmente entre personas). El id de Usuario es el mismo id que gestiona
// Supabase Auth (ver /04-modelo-datos.md sección 8.1).
export async function invitarUsuario(datos: DatosInvitacion, actorId: string) {
  const existente = await prisma.usuario.findUnique({ where: { email: datos.email } });
  if (existente) throw new EmailYaRegistradoError(datos.email);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(datos.email);
  if (error || !data.user) {
    throw new Error(`No se pudo enviar la invitación: ${error?.message ?? "error desconocido"}.`);
  }

  const usuario = await prisma.usuario.create({
    data: {
      id: data.user.id,
      email: datos.email,
      nombre: datos.nombre,
      apellido: datos.apellido,
      rolId: datos.rolId,
    },
    include: { rol: true },
  });

  await registrarCambio({
    entidad: "Usuario",
    entidadId: usuario.id,
    accion: "crear",
    usuarioId: actorId,
  });

  return usuario;
}

export interface DatosEdicionUsuario {
  nombre?: string;
  apellido?: string;
  telefono?: string | null;
}

// Un usuario puede editar su propio nombre, apellido y teléfono — nunca su
// propio rol (/10-usuarios-roles-permisos.md sección 6). El cambio de rol
// tiene su propia función (cambiarRolUsuario) con su propia autorización.
export async function actualizarDatosUsuario(
  usuarioId: string,
  datos: DatosEdicionUsuario,
  actorId: string,
) {
  const actualizado = await prisma.usuario.update({
    where: { id: usuarioId },
    data: datos,
  });
  await registrarCambio({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: "editar",
    usuarioId: actorId,
  });
  return actualizado;
}

async function contarAdministradoresActivos(excluirUsuarioId?: string) {
  const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { nombre: "Administrador" } });
  return prisma.usuario.count({
    where: {
      rolId: rolAdmin.id,
      estado: "activo",
      ...(excluirUsuarioId ? { id: { not: excluirUsuarioId } } : {}),
    },
  });
}

// RN /10-usuarios-roles-permisos.md sección 9: cambiar el rol de un usuario
// queda registrado con la acción cambio_permiso, incluyendo el rol anterior
// y el nuevo. No puede quedar el sistema sin ningún Administrador activo.
export async function cambiarRolUsuario(usuarioId: string, nuevoRolId: string, actorId: string) {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { rol: true },
  });
  if (usuario.rolId === nuevoRolId) return usuario;

  const nuevoRol = await prisma.rol.findUniqueOrThrow({ where: { id: nuevoRolId } });
  if (usuario.rol.nombre === "Administrador" && nuevoRol.nombre !== "Administrador") {
    const restantes = await contarAdministradoresActivos(usuarioId);
    if (restantes === 0) throw new UltimoAdministradorError();
  }

  const actualizado = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { rolId: nuevoRolId },
    include: { rol: true },
  });

  await registrarCambio({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: "cambio_permiso",
    usuarioId: actorId,
    campo: "rol",
    valorAnterior: usuario.rol.nombre,
    valorNuevo: nuevoRol.nombre,
  });

  return actualizado;
}

// Ciclo de vida — /10-usuarios-roles-permisos.md sección 8 y 9: nunca se
// elimina un usuario físicamente, solo se desactiva. No puede desactivarse
// al último Administrador activo, y desactivar a alguien responsable de una
// actividad planificada/en curso exige reasignarla primero.
export async function cambiarEstadoUsuario(
  usuarioId: string,
  nuevoEstado: "activo" | "inactivo",
  actorId: string,
) {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { rol: true },
  });
  if (usuario.estado === nuevoEstado) return usuario;

  if (nuevoEstado === "inactivo") {
    if (usuario.rol.nombre === "Administrador") {
      const restantes = await contarAdministradoresActivos(usuarioId);
      if (restantes === 0) throw new UltimoAdministradorError();
    }

    const actividadesSinReasignar = await prisma.actividad.findMany({
      where: {
        responsableId: usuarioId,
        estado: { in: ["planificada", "en_curso"] },
      },
      select: { id: true, nombre: true },
    });
    if (actividadesSinReasignar.length > 0) {
      throw new ActividadesSinReasignarError(actividadesSinReasignar);
    }
  }

  const actualizado = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { estado: nuevoEstado },
  });

  await registrarCambio({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: "editar",
    usuarioId: actorId,
    campo: "estado",
    valorAnterior: usuario.estado,
    valorNuevo: nuevoEstado,
  });

  return actualizado;
}
