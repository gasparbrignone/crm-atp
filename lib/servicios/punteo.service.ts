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

export interface ContextoUsuario {
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
      email: undefined,
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

// Todos los PunteoPersona cargados sobre una persona, a través de todos los
// usuarios — a diferencia de obtenerPunteoDePersona() (un usuario puntual),
// esto es para la vista de conducción que quiere ver el panorama completo de
// una persona. Exige punteo.ver_todos explícitamente (no hay "propio" acá
// porque por definición trae ajenos), y audita el acceso a cada punteo que
// no sea del propio usuario que consulta, igual criterio que el resto del
// módulo.
export async function obtenerTodosLosPunteosDePersona(ctx: ContextoUsuario, personaId: string) {
  if (!ctx.puedeVerTodos) throw new AccesoPunteoAjenoSinPermisoError();

  const punteos = await prisma.punteoPersona.findMany({
    where: { personaId },
    include: {
      usuario: { select: { id: true, nombre: true, apellido: true } },
      clasificacion: true,
      comentarios: { orderBy: { fechaCreacion: "desc" } },
    },
  });

  for (const punteo of punteos) {
    await auditarAccesoSiEsAjeno(ctx, punteo.usuarioId, punteo.id);
  }

  return punteos;
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

// Cobertura de punteo — /11-dashboards.md sección 3.1: % de personas del
// padrón activo (cualquiera de los dos tipos, CD o CE) con al menos un
// PunteoPersona cargado por algún usuario. Agregado puro, sin identificar qué
// usuario clasificó a quién — por eso no exige `punteo.ver_todos`, solo
// `dashboard.ver_administrativo` (verificado por quien llama).
export async function obtenerCoberturaPunteo() {
  const personasEnPadron = await prisma.persona.count({
    where: {
      OR: [{ estadoPadronCD: "en_padron_habilitado" }, { estadoPadronCE: "en_padron_habilitado" }],
    },
  });

  if (personasEnPadron === 0) return { personasEnPadron: 0, conPunteo: 0, cobertura: null };

  const conPunteo = await prisma.persona.count({
    where: {
      OR: [{ estadoPadronCD: "en_padron_habilitado" }, { estadoPadronCE: "en_padron_habilitado" }],
      punteos: { some: {} },
    },
  });

  return { personasEnPadron, conPunteo, cobertura: conPunteo / personasEnPadron };
}

// Ranking de militantes por volumen de punteo activo — /11-dashboards.md
// sección 3.2: solo cantidad de personas en seguimiento por usuario, nunca el
// contenido de esa clasificación. Expone actividad de otros usuarios, así que
// exige `punteo.ver_todos` (verificado por quien llama, igual criterio que el
// resto de este servicio).
export async function obtenerRankingMilitantesPunteo() {
  const agrupado = await prisma.punteoPersona.groupBy({
    by: ["usuarioId"],
    _count: true,
    where: { estadoSeguimiento: { not: "sin_iniciar" } },
  });

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: agrupado.map((a) => a.usuarioId) } },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

  return agrupado
    .map((a) => ({ usuarioId: a.usuarioId, nombre: nombrePorId.get(a.usuarioId) ?? "—", cantidad: a._count }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

// Distribución agregada de clasificación de punteo, sumando a través de
// todos los usuarios — /11-dashboards.md sección 3.2. Nunca identifica qué
// usuario clasificó a quién de qué forma en esta vista; solo el total por
// categoría del catálogo `ClasificacionPunteo`.
export async function obtenerDistribucionClasificacionPunteo() {
  const clasificaciones = await prisma.clasificacionPunteo.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
  });

  const agrupado = await prisma.punteoPersona.groupBy({
    by: ["clasificacionId"],
    _count: true,
  });
  const cantidadPorId = new Map(agrupado.map((a) => [a.clasificacionId, a._count]));

  return clasificaciones.map((c) => ({
    nombre: c.nombre,
    color: c.color,
    cantidad: cantidadPorId.get(c.id) ?? 0,
  }));
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
