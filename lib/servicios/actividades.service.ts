import { Prisma, type Actividad, type EstadoActividad } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import {
  notificarActividadCancelada,
  notificarActividadReprogramada,
} from "@/lib/servicios/notificaciones.service";
import type { ActividadFormValues } from "@/lib/validaciones/actividad.validation";

export class ActividadCicloError extends Error {
  constructor() {
    super(
      "Esa actividad padre generaría un ciclo en la jerarquía (una actividad no puede ser, directa o indirectamente, hija de sí misma).",
    );
    this.name = "ActividadCicloError";
  }
}

export class TransicionEstadoInvalidaError extends Error {
  constructor(
    public desde: EstadoActividad,
    public hacia: EstadoActividad,
  ) {
    super(`No se puede pasar una actividad de "${desde}" a "${hacia}".`);
    this.name = "TransicionEstadoInvalidaError";
  }
}

const ACTIVIDAD_PORPAGINA_DEFAULT = 25;
const ACTIVIDAD_PORPAGINA_OPCIONES = [25, 50, 100];

// Ciclo de vida — /06-modulo-actividades.md sección 3.
const TRANSICIONES_VALIDAS: Record<EstadoActividad, EstadoActividad[]> = {
  planificada: ["en_curso", "cancelada"],
  en_curso: ["finalizada", "cancelada"],
  finalizada: [],
  cancelada: [],
};

export interface FiltrosListadoActividades {
  q?: string;
  tipoActividadId?: string;
  estado?: string;
  modalidad?: string;
  responsableId?: string;
  pagina?: number;
  porPagina?: number;
}

// Listado paginado server-side — nunca se trae el conjunto completo al
// cliente, ver /06-modulo-actividades.md sección 7 y /CLAUDE.md sección 4.
export async function listarActividades(filtros: FiltrosListadoActividades) {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const porPagina = ACTIVIDAD_PORPAGINA_OPCIONES.includes(filtros.porPagina ?? 0)
    ? (filtros.porPagina as number)
    : ACTIVIDAD_PORPAGINA_DEFAULT;

  const where: Prisma.ActividadWhereInput = {};
  if (filtros.tipoActividadId) where.tipoActividadId = filtros.tipoActividadId;
  if (filtros.estado) where.estado = filtros.estado as EstadoActividad;
  if (filtros.modalidad) where.modalidad = filtros.modalidad as Actividad["modalidad"];
  if (filtros.responsableId) where.responsableId = filtros.responsableId;
  if (filtros.q) {
    const q = filtros.q.trim();
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { lugar: { contains: q, mode: "insensitive" } },
    ];
  }

  const [actividades, total] = await prisma.$transaction([
    prisma.actividad.findMany({
      where,
      include: {
        tipoActividad: true,
        responsable: true,
        actividadPadre: { select: { id: true, nombre: true } },
        _count: { select: { participaciones: true } },
      },
      orderBy: { fechaInicio: "desc" },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.actividad.count({ where }),
  ]);

  return { actividades, total, pagina, porPagina };
}

// Rango amplio de actividades para la vista de calendario — trae todas las
// actividades cuyo rango [fechaInicio, fechaFin] cruza el mes visible. No
// pagina (el volumen mensual es acotado por diseño), pero sigue acotado a un
// rango de fechas explícito para no traer la tabla completa.
export async function listarActividadesEnRango(desde: Date, hasta: Date) {
  return prisma.actividad.findMany({
    where: {
      fechaInicio: { lte: hasta },
      OR: [{ fechaFin: null }, { fechaFin: { gte: desde } }],
    },
    include: { tipoActividad: true },
    orderBy: { fechaInicio: "asc" },
  });
}

export async function obtenerActividad(id: string) {
  return prisma.actividad.findUnique({
    where: { id },
    include: {
      tipoActividad: true,
      responsable: true,
      actividadPadre: { select: { id: true, nombre: true } },
      subActividades: {
        include: {
          tipoActividad: true,
          _count: { select: { participaciones: true } },
          participaciones: { select: { estado: true } },
        },
        orderBy: { fechaInicio: "asc" },
      },
      participaciones: {
        include: { persona: { select: { id: true, nombre: true, apellido: true, dni: true } } },
        orderBy: [{ persona: { apellido: "asc" } }, { persona: { nombre: "asc" } }],
      },
    },
  });
}

// Comprueba si asignar `nuevoPadreId` como padre de `actividadId` generaría un
// ciclo en la jerarquía — /06-modulo-actividades.md sección 8.
async function generariaCiclo(actividadId: string, nuevoPadreId: string): Promise<boolean> {
  if (actividadId === nuevoPadreId) return true;
  const visitados = new Set<string>();
  let cursor: string | null = nuevoPadreId;
  while (cursor) {
    if (cursor === actividadId) return true;
    if (visitados.has(cursor)) break;
    visitados.add(cursor);
    const padre: { actividadPadreId: string | null } | null = await prisma.actividad.findUnique({
      where: { id: cursor },
      select: { actividadPadreId: true },
    });
    cursor = padre?.actividadPadreId ?? null;
  }
  return false;
}

export async function crearActividad(datos: ActividadFormValues, usuarioId: string) {
  if (datos.actividadPadreId) {
    await prisma.actividad.findUniqueOrThrow({ where: { id: datos.actividadPadreId } });
  }

  const actividad = await prisma.actividad.create({
    data: {
      nombre: datos.nombre,
      tipoActividadId: datos.tipoActividadId,
      descripcion: datos.descripcion ?? null,
      fechaInicio: new Date(datos.fechaInicio),
      fechaFin: datos.fechaFin ? new Date(datos.fechaFin) : null,
      modalidad: datos.modalidad,
      lugar: datos.lugar ?? null,
      cupoMaximo: datos.cupoMaximo ?? null,
      responsableId: datos.responsableId,
      actividadPadreId: datos.actividadPadreId ?? null,
      observaciones: datos.observaciones ?? null,
      carreraPorDefectoId: datos.carreraPorDefectoId ?? null,
      anioPorDefecto: datos.anioPorDefecto ?? null,
      creadoPorId: usuarioId,
      modificadoPorId: usuarioId,
    },
  });

  await registrarCambio({
    entidad: "Actividad",
    entidadId: actividad.id,
    accion: "crear",
    usuarioId,
  });

  return actividad;
}

const CAMPOS_EDITABLES = [
  "nombre",
  "tipoActividadId",
  "descripcion",
  "fechaInicio",
  "fechaFin",
  "modalidad",
  "lugar",
  "cupoMaximo",
  "responsableId",
  "actividadPadreId",
  "observaciones",
  "carreraPorDefectoId",
  "anioPorDefecto",
] as const;

// Edición inline por campo, mismo patrón que /lib/servicios/personas.service.ts
// (actualizarPersona) — cada campo modificado genera su propia entrada en
// HistorialCambio. Cambiar fechaInicio con inscriptos ya confirmados debería
// disparar una notificación automática (/06-modulo-actividades.md sección 4.2);
// el módulo de Notificaciones todavía no existe (llega en una fase posterior
// del roadmap), así que por ahora esto queda documentado como pendiente en
// NOTAS-FASE-2-OVERNIGHT.md y no se envía ningún aviso.
export async function actualizarActividad(
  id: string,
  datos: Partial<ActividadFormValues>,
  usuarioId: string,
) {
  const actual = await prisma.actividad.findUniqueOrThrow({ where: { id } });

  if (datos.actividadPadreId && (await generariaCiclo(id, datos.actividadPadreId))) {
    throw new ActividadCicloError();
  }

  const cambios: Record<string, { anterior: unknown; nuevo: unknown }> = {};
  const data: Prisma.ActividadUpdateInput = { modificadoPor: { connect: { id: usuarioId } } };

  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo in datos)) continue;
    let nuevo: unknown = (datos as Record<string, unknown>)[campo] ?? null;
    let anteriorComparable: unknown = actual[campo] ?? null;

    if (campo === "fechaInicio" || campo === "fechaFin") {
      nuevo = nuevo ? new Date(nuevo as string) : null;
      anteriorComparable = anteriorComparable
        ? (anteriorComparable as Date).toISOString()
        : null;
      const nuevoComparable = nuevo ? (nuevo as Date).toISOString() : null;
      if (nuevoComparable === anteriorComparable) continue;
    } else if (nuevo === anteriorComparable) {
      continue;
    }

    cambios[campo] = { anterior: actual[campo] ?? null, nuevo };

    if (campo === "tipoActividadId") {
      data.tipoActividad = { connect: { id: nuevo as string } };
    } else if (campo === "responsableId") {
      data.responsable = { connect: { id: nuevo as string } };
    } else if (campo === "actividadPadreId") {
      data.actividadPadre = nuevo ? { connect: { id: nuevo as string } } : { disconnect: true };
    } else if (campo === "carreraPorDefectoId") {
      data.carreraPorDefecto = nuevo ? { connect: { id: nuevo as string } } : { disconnect: true };
    } else {
      // @ts-expect-error -- asignación dinámica validada por CAMPOS_EDITABLES
      data[campo] = nuevo;
    }
  }

  if (Object.keys(cambios).length === 0) return actual;

  const actualizada = await prisma.actividad.update({ where: { id }, data });

  for (const [campo, { anterior, nuevo }] of Object.entries(cambios)) {
    await registrarCambio({
      entidad: "Actividad",
      entidadId: id,
      accion: "editar",
      usuarioId,
      campo,
      valorAnterior: anterior == null ? null : String(anterior),
      valorNuevo: nuevo == null ? null : String(nuevo),
    });
  }

  // Si se acaba de definir (o cambiar) la carrera/año por defecto, se
  // aplica también a quienes ya estaban inscriptos y todavía no tenían ese
  // dato — no solo a las inscripciones futuras (pedido de Gaspar).
  if ("carreraPorDefectoId" in cambios || "anioPorDefecto" in cambios) {
    await aplicarCarreraAnioPorDefectoAParticipantes(id, usuarioId);
  }

  // Reprogramación = cambio de fechaInicio (sin cambio de estado, ese caso lo
  // cubre cambiarEstadoActividad más abajo) — /13-notificaciones.md sección 3.
  if ("fechaInicio" in cambios) {
    await notificarActividadReprogramada(
      id,
      actual.fechaInicio,
      actualizada.fechaInicio,
    );
  }

  return actualizada;
}

// Completa carrera/año de quienes ya están inscriptos en esta actividad con
// los valores por defecto configurados. La carrera solo se completa si no
// había una cargada; el año en cambio avanza al máximo entre el actual y el
// de la actividad (mismo criterio que aplicarCarreraAnioPorDefecto() en
// participaciones.service.ts — no se puede asumir que todos avanzan un año
// por año calendario, pedido de Gaspar 2026-08-02).
export async function aplicarCarreraAnioPorDefectoAParticipantes(
  actividadId: string,
  usuarioId: string,
) {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: actividadId } });
  if (!actividad.carreraPorDefectoId && !actividad.anioPorDefecto) return { actualizadas: 0 };

  const participaciones = await prisma.participacion.findMany({
    where: { actividadId },
    select: {
      persona: { select: { id: true, carreraId: true, anio: true } },
    },
  });

  let actualizadas = 0;
  for (const { persona } of participaciones) {
    const datosActualizar: { carreraId?: string; anio?: number } = {};
    if (actividad.carreraPorDefectoId && !persona.carreraId) {
      datosActualizar.carreraId = actividad.carreraPorDefectoId;
    }
    if (actividad.anioPorDefecto && (!persona.anio || actividad.anioPorDefecto > persona.anio)) {
      datosActualizar.anio = actividad.anioPorDefecto;
    }
    if (Object.keys(datosActualizar).length === 0) continue;

    await prisma.persona.update({ where: { id: persona.id }, data: datosActualizar });
    await registrarCambio({
      entidad: "Persona",
      entidadId: persona.id,
      accion: "editar",
      usuarioId,
      metadata: { proceso: "carrera_anio_por_defecto_actividad", actividadId },
    });
    actualizadas++;
  }

  return { actualizadas };
}

// Cambio de estado — valida transiciones según el ciclo de vida documentado
// en /06-modulo-actividades.md sección 3.
export async function cambiarEstadoActividad(
  id: string,
  nuevoEstado: EstadoActividad,
  usuarioId: string,
) {
  const actual = await prisma.actividad.findUniqueOrThrow({ where: { id } });
  if (actual.estado === nuevoEstado) return actual;

  if (!TRANSICIONES_VALIDAS[actual.estado].includes(nuevoEstado)) {
    throw new TransicionEstadoInvalidaError(actual.estado, nuevoEstado);
  }

  const actualizada = await prisma.actividad.update({
    where: { id },
    data: { estado: nuevoEstado, modificadoPorId: usuarioId },
  });

  await registrarCambio({
    entidad: "Actividad",
    entidadId: id,
    accion: "editar",
    usuarioId,
    campo: "estado",
    valorAnterior: actual.estado,
    valorNuevo: nuevoEstado,
  });

  if (nuevoEstado === "cancelada") {
    await notificarActividadCancelada(id);
  }

  return actualizada;
}

// Estadísticas de la actividad — /06-modulo-actividades.md sección 6: tasa de
// asistencia propia comparada con el promedio de otras actividades finalizadas
// del mismo tipo (ver también /11-dashboards.md, que profundiza estas métricas
// en una fase posterior del roadmap).
export async function obtenerTasaAsistenciaPromedioPorTipo(
  tipoActividadId: string,
  excluirActividadId: string,
) {
  const actividades = await prisma.actividad.findMany({
    where: { tipoActividadId, estado: "finalizada", id: { not: excluirActividadId } },
    select: {
      participaciones: { select: { estado: true } },
    },
  });

  if (actividades.length === 0) return null;

  const tasas = actividades
    .map((a) => {
      const inscriptos = a.participaciones.filter((p) => p.estado !== "cancelado").length;
      if (inscriptos === 0) return null;
      const asistieron = a.participaciones.filter((p) => p.estado === "asistio").length;
      return asistieron / inscriptos;
    })
    .filter((t): t is number => t !== null);

  if (tasas.length === 0) return null;
  return tasas.reduce((acc, t) => acc + t, 0) / tasas.length;
}

// "Eliminar" una actividad, en los términos del permiso `actividades.eliminar`
// (/06-modulo-actividades.md sección 9), es cancelarla — cero pérdida de
// datos, se conserva junto con sus Participacion (sección 8).
export async function cancelarActividad(id: string, usuarioId: string) {
  return cambiarEstadoActividad(id, "cancelada", usuarioId);
}
