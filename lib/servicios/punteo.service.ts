import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { crearPersona } from "@/lib/servicios/personas.service";
import type { EstadoSeguimientoPunteo } from "@prisma/client";

// Punteo electoral — /08-modulo-punteo-electoral.md. Módulo con el requisito
// de privacidad más estricto del sistema (sección 3): un PunteoPersona (y sus
// comentarios) solo lo lee quien lo creó, salvo permiso explícito
// `punteo.ver_todos`. Esta capa de aplicación filtra por usuarioId en cada
// consulta — la RLS de Postgres es la segunda capa independiente, no la
// única (defensa en profundidad, /16-seguridad.md).

export class AccesoPunteoAjenoSinPermisoError extends Error {
  constructor() {
    super("No tenés permiso para ver el punteo de otro usuario.");
    this.name = "AccesoPunteoAjenoSinPermisoError";
  }
}

interface ContextoUsuario {
  usuarioId: string;
  puedeVerTodos: boolean;
}

// Registra en HistorialCambio cada vez que se ejerce `punteo.ver_todos` sobre
// un punteo ajeno — "acceso auditado, no solo edición auditada" (sección 8).
async function auditarAccesoSiEsAjeno(
  ctx: ContextoUsuario,
  punteoUsuarioId: string,
  punteoPersonaId: string,
) {
  if (punteoUsuarioId === ctx.usuarioId) return;
  await registrarCambio({
    entidad: "PunteoPersona",
    entidadId: punteoPersonaId,
    accion: "otro",
    usuarioId: ctx.usuarioId,
    metadata: {
      proceso: "acceso_punteo_ajeno",
      usuarioDuenioPunteoId: punteoUsuarioId,
    },
  });
}

export async function listarMiPunteo(ctx: ContextoUsuario) {
  return prisma.punteoPersona.findMany({
    where: { usuarioId: ctx.usuarioId },
    include: {
      persona: { select: { id: true, nombre: true, apellido: true } },
      clasificacion: true,
      _count: { select: { comentarios: true } },
    },
    orderBy: { fechaUltimaActualizacion: "desc" },
  });
}

// Búsqueda acotada a Personas para empezar a puntear a alguien sin registro
// propio todavía (sección 5: "acceso rápido a una persona nueva"). No usa el
// buscador global (todavía no existe como módulo propio) — es una búsqueda
// mínima por nombre/apellido/DNI, igual criterio que /15-ia.md sección 2
// (minimización de datos: nunca trae la base completa).
export async function buscarPersonasParaPuntear(query: string) {
  const texto = query.trim();
  if (texto.length < 2) return [];

  return prisma.persona.findMany({
    where: {
      estadoFicha: { not: "fusionada" },
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { apellido: { contains: texto, mode: "insensitive" } },
        { dni: { contains: texto } },
      ],
    },
    select: { id: true, nombre: true, apellido: true, dni: true },
    take: 10,
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
  });
}

export interface DatosPersonaMinimos {
  nombre: string;
  apellido: string;
  telefono?: string;
}

// Alta manual desde la pantalla de punteo — /08-modulo-punteo-electoral.md
// sección 5: el punteo releva potenciales votantes, no solo gente que ya
// pasó por una Actividad o una importación. Reusa crearPersona() tal cual
// (misma validación de DNI único, mismo registro en HistorialCambio) para no
// duplicar reglas de alta de Persona — acá solo se resuelve el caso mínimo
// (nombre + apellido, sin DNI) porque el punteo de campo rara vez lo tiene a
// mano.
export async function crearPersonaDesdePunteo(datos: DatosPersonaMinimos, usuarioId: string) {
  return crearPersona(
    {
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono || undefined,
      dni: undefined,
      legajo: undefined,
      carreraId: undefined,
      anio: undefined,
      instagram: undefined,
      observacionesGenerales: undefined,
    },
    usuarioId,
  );
}

export async function listarClasificacionesPunteo() {
  return prisma.clasificacionPunteo.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
  });
}

// Ficha de punteo de una persona desde la perspectiva de ctx.usuarioId. Si
// `verComoUsuarioId` se pasa (conducción revisando el punteo de otro
// militante) exige `punteo.ver_todos` y deja el acceso auditado.
export async function obtenerPunteoDePersona(
  ctx: ContextoUsuario,
  personaId: string,
  verComoUsuarioId?: string,
) {
  const usuarioObjetivo = verComoUsuarioId ?? ctx.usuarioId;
  if (usuarioObjetivo !== ctx.usuarioId && !ctx.puedeVerTodos) {
    throw new AccesoPunteoAjenoSinPermisoError();
  }

  const punteo = await prisma.punteoPersona.findUnique({
    where: { usuarioId_personaId: { usuarioId: usuarioObjetivo, personaId } },
    include: {
      clasificacion: true,
      comentarios: { orderBy: { fechaCreacion: "desc" } },
      persona: { select: { id: true, nombre: true, apellido: true } },
    },
  });

  if (punteo) {
    await auditarAccesoSiEsAjeno(ctx, usuarioObjetivo, punteo.id);
  }

  return punteo;
}

// RN sección 11: el primer comentario o clasificación crea el PunteoPersona
// automáticamente — no hay alta de punteo separada.
async function obtenerOCrearPunteoPersona(usuarioId: string, personaId: string) {
  return prisma.punteoPersona.upsert({
    where: { usuarioId_personaId: { usuarioId, personaId } },
    update: {},
    create: { usuarioId, personaId },
  });
}

export async function agregarComentarioPunteo(
  usuarioId: string,
  personaId: string,
  contenido: string,
) {
  const texto = contenido.trim();
  if (!texto) throw new Error("El comentario no puede estar vacío.");

  const punteo = await obtenerOCrearPunteoPersona(usuarioId, personaId);

  const comentario = await prisma.punteoComentario.create({
    data: { punteoPersonaId: punteo.id, contenido: texto },
  });

  // Un comentario nuevo es la señal de que se retomó el seguimiento — si
  // seguía "sin_iniciar", pasa a "en_seguimiento" automáticamente.
  if (punteo.estadoSeguimiento === "sin_iniciar") {
    await prisma.punteoPersona.update({
      where: { id: punteo.id },
      data: { estadoSeguimiento: "en_seguimiento" },
    });
  }

  await registrarCambio({
    entidad: "PunteoComentario",
    entidadId: comentario.id,
    accion: "crear",
    usuarioId,
    metadata: { punteoPersonaId: punteo.id, personaId },
  });

  return comentario;
}

export async function actualizarClasificacionPunteo(
  usuarioId: string,
  personaId: string,
  clasificacionId: string | null,
) {
  const punteo = await obtenerOCrearPunteoPersona(usuarioId, personaId);
  const anterior = punteo.clasificacionId;

  const actualizado = await prisma.punteoPersona.update({
    where: { id: punteo.id },
    data: { clasificacionId },
  });

  await registrarCambio({
    entidad: "PunteoPersona",
    entidadId: punteo.id,
    accion: "editar",
    usuarioId,
    campo: "clasificacionId",
    valorAnterior: anterior,
    valorNuevo: clasificacionId,
    metadata: { personaId },
  });

  return actualizado;
}

export async function actualizarEstadoSeguimiento(
  usuarioId: string,
  personaId: string,
  estadoSeguimiento: EstadoSeguimientoPunteo,
) {
  const punteo = await obtenerOCrearPunteoPersona(usuarioId, personaId);
  const anterior = punteo.estadoSeguimiento;

  const actualizado = await prisma.punteoPersona.update({
    where: { id: punteo.id },
    data: { estadoSeguimiento },
  });

  await registrarCambio({
    entidad: "PunteoPersona",
    entidadId: punteo.id,
    accion: "editar",
    usuarioId,
    campo: "estadoSeguimiento",
    valorAnterior: anterior,
    valorNuevo: estadoSeguimiento,
    metadata: { personaId },
  });

  return actualizado;
}
