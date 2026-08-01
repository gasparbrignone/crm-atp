import type { EstadoActividad, EstadoParticipacion } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";

export class ActividadNoAceptaInscripcionesError extends Error {
  constructor(public estado: EstadoActividad) {
    super(
      estado === "finalizada"
        ? "La actividad ya finalizó: solo se pueden hacer ajustes retroactivos de asistencia."
        : "La actividad está cancelada: no se pueden inscribir personas nuevas.",
    );
    this.name = "ActividadNoAceptaInscripcionesError";
  }
}

export class TransicionParticipacionInvalidaError extends Error {
  constructor(
    public desde: EstadoParticipacion,
    public hacia: EstadoParticipacion,
  ) {
    super(`No se puede pasar una participación de "${desde}" a "${hacia}".`);
    this.name = "TransicionParticipacionInvalidaError";
  }
}

// Transiciones válidas — /07-modulo-participaciones.md sección 5.
const TRANSICIONES_VALIDAS: Record<EstadoParticipacion, EstadoParticipacion[]> = {
  inscripto: ["confirmado", "asistio", "ausente", "cancelado"],
  confirmado: ["asistio", "ausente", "cancelado"],
  asistio: ["ausente"],
  ausente: ["asistio"],
  cancelado: ["inscripto"],
};

export async function listarParticipacionesDeActividad(actividadId: string, q?: string) {
  return prisma.participacion.findMany({
    where: {
      actividadId,
      ...(q
        ? {
            persona: {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { dni: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: { persona: { select: { id: true, nombre: true, apellido: true, dni: true } } },
    orderBy: [{ persona: { apellido: "asc" } }, { persona: { nombre: "asc" } }],
  });
}

export async function listarParticipacionesDePersona(personaId: string) {
  return prisma.participacion.findMany({
    where: { personaId },
    include: { actividad: { include: { tipoActividad: true } } },
    orderBy: { actividad: { fechaInicio: "desc" } },
  });
}

// Personas candidatas a inscribir en una actividad: excluye a quienes ya
// tienen una Participacion activa (no cancelada) en ella. Usado por el
// buscador de "agregar persona" en la ficha de la actividad.
export async function buscarPersonasParaInscribir(actividadId: string, q: string) {
  const texto = q.trim();
  if (!texto) return [];

  return prisma.persona.findMany({
    where: {
      estadoFicha: "activa",
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { apellido: { contains: texto, mode: "insensitive" } },
        { dni: { contains: texto, mode: "insensitive" } },
        { legajo: { contains: texto, mode: "insensitive" } },
      ],
      NOT: {
        participaciones: {
          some: { actividadId, estado: { not: "cancelado" } },
        },
      },
    },
    select: { id: true, nombre: true, apellido: true, dni: true, carrera: { select: { nombre: true } } },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    take: 20,
  });
}

// Inscripción individual — RN-4 (/04-modelo-datos.md sección 18): re-inscribir
// reactiva el registro existente en vez de duplicarlo. El cupo no bloquea la
// inscripción: cuando se supera, la persona queda "excedente" (indicador
// visual, no un estado nuevo — /07-modulo-participaciones.md sección 3.3).
export async function inscribirPersona(actividadId: string, personaId: string, usuarioId: string) {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: actividadId } });
  if (actividad.estado === "finalizada" || actividad.estado === "cancelada") {
    throw new ActividadNoAceptaInscripcionesError(actividad.estado);
  }

  const existente = await prisma.participacion.findUnique({
    where: { personaId_actividadId: { personaId, actividadId } },
  });

  if (existente && existente.estado !== "cancelado") {
    return existente;
  }

  if (existente) {
    const reactivada = await prisma.participacion.update({
      where: { id: existente.id },
      data: {
        estado: "inscripto",
        fechaInscripcion: new Date(),
        fechaAsistencia: null,
        modificadoPorId: usuarioId,
      },
    });
    await registrarCambio({
      entidad: "Participacion",
      entidadId: reactivada.id,
      accion: "editar",
      usuarioId,
      campo: "estado",
      valorAnterior: "cancelado",
      valorNuevo: "inscripto",
    });
    return reactivada;
  }

  const creada = await prisma.participacion.create({
    data: {
      personaId,
      actividadId,
      estado: "inscripto",
      creadoPorId: usuarioId,
      modificadoPorId: usuarioId,
    },
  });
  await registrarCambio({
    entidad: "Participacion",
    entidadId: creada.id,
    accion: "crear",
    usuarioId,
  });
  return creada;
}

export interface ResultadoInscripcionMasiva {
  requiereConfirmacion: boolean;
  entrarianSinExceder: number;
  totalSeleccionadas: number;
  yaInscriptas: number;
  creadas: number;
  reactivadas: number;
}

// Inscripción masiva desde un listado filtrado de Personas —
// /07-modulo-participaciones.md sección 6. Si el cupo no alcanza para todas
// las personas seleccionadas, se informa cuántas entrarían y se exige
// confirmación explícita en vez de fallar a mitad de camino.
export async function inscribirMasivo(
  actividadId: string,
  personaIds: string[],
  usuarioId: string,
  confirmarSobrecupo = false,
): Promise<ResultadoInscripcionMasiva> {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: actividadId } });
  if (actividad.estado === "finalizada" || actividad.estado === "cancelada") {
    throw new ActividadNoAceptaInscripcionesError(actividad.estado);
  }

  const idsUnicos = Array.from(new Set(personaIds));
  const existentes = await prisma.participacion.findMany({
    where: { actividadId, personaId: { in: idsUnicos } },
  });
  const existentesPorPersona = new Map(existentes.map((p) => [p.personaId, p]));

  const yaActivas = existentes.filter((p) => p.estado !== "cancelado").length;
  // Personas que van a crear/reactivar un registro (no las que ya están
  // activas, que se cuentan aparte en yaActivas).
  const nuevasOReactivadas = idsUnicos.filter((id) => {
    const p = existentesPorPersona.get(id);
    return !p || p.estado === "cancelado";
  });

  if (actividad.cupoMaximo != null && !confirmarSobrecupo) {
    const ocupadosActuales = await prisma.participacion.count({
      where: { actividadId, estado: { not: "cancelado" } },
    });
    const disponibles = Math.max(0, actividad.cupoMaximo - ocupadosActuales);
    if (nuevasOReactivadas.length > disponibles) {
      return {
        requiereConfirmacion: true,
        entrarianSinExceder: disponibles,
        totalSeleccionadas: nuevasOReactivadas.length,
        yaInscriptas: yaActivas,
        creadas: 0,
        reactivadas: 0,
      };
    }
  }

  let creadas = 0;
  let reactivadas = 0;
  for (const personaId of nuevasOReactivadas) {
    const antes = existentesPorPersona.get(personaId);
    await inscribirPersona(actividadId, personaId, usuarioId);
    if (antes) reactivadas += 1;
    else creadas += 1;
  }

  return {
    requiereConfirmacion: false,
    entrarianSinExceder: nuevasOReactivadas.length,
    totalSeleccionadas: nuevasOReactivadas.length,
    yaInscriptas: yaActivas,
    creadas,
    reactivadas,
  };
}

// Cambio de estado — usado tanto por la edición estándar como por el "modo
// asistencia" de carga rápida (/07-modulo-participaciones.md sección 4):
// marcar `asistio` completa fechaAsistencia automáticamente, sin pedirla
// como campo manual.
export async function cambiarEstadoParticipacion(
  participacionId: string,
  nuevoEstado: EstadoParticipacion,
  usuarioId: string,
) {
  const actual = await prisma.participacion.findUniqueOrThrow({ where: { id: participacionId } });
  if (actual.estado === nuevoEstado) return actual;

  if (!TRANSICIONES_VALIDAS[actual.estado].includes(nuevoEstado)) {
    throw new TransicionParticipacionInvalidaError(actual.estado, nuevoEstado);
  }

  const actualizada = await prisma.participacion.update({
    where: { id: participacionId },
    data: {
      estado: nuevoEstado,
      fechaAsistencia: nuevoEstado === "asistio" ? new Date() : actual.fechaAsistencia,
      modificadoPorId: usuarioId,
    },
  });

  await registrarCambio({
    entidad: "Participacion",
    entidadId: participacionId,
    accion: "editar",
    usuarioId,
    campo: "estado",
    valorAnterior: actual.estado,
    valorNuevo: nuevoEstado,
  });

  return actualizada;
}

// La eliminación de una Participacion no existe desde la UI estándar — el
// equivalente es cancelarla (/07-modulo-participaciones.md sección 7).
export async function cancelarParticipacion(participacionId: string, usuarioId: string) {
  return cambiarEstadoParticipacion(participacionId, "cancelado", usuarioId);
}
