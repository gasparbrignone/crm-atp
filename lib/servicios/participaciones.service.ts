import Papa from "papaparse";
import type { EstadoActividad, EstadoParticipacion } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarPersonaCoincidente, obtenerUmbralConfianzaDuplicados } from "@/lib/ia/deteccion-duplicados";
import type { CampoInscripcionImportable } from "@/lib/utils/csv-mapping-inscripciones";
import { partirNombreYApellido } from "@/lib/utils/nombre-padron";

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
// Carrera/año por defecto de la actividad (si están configurados) — la
// carrera se aplica a la Persona solo si todavía no tiene una cargada, nunca
// pisa un valor existente. El año en cambio avanza al máximo entre el actual
// y el de la actividad: no se puede asumir que todos avanzan un año por año
// calendario, así que se toma como señal la actividad más "alta" en la que
// participa (nunca baja el año, pedido de Gaspar 2026-08-02). Misma regla en
// alta manual, inscripción masiva, CSV e importación de Sheets — todas pasan
// por acá.
async function aplicarCarreraAnioPorDefecto(
  actividad: { carreraPorDefectoId: string | null; anioPorDefecto: number | null },
  personaId: string,
) {
  if (!actividad.carreraPorDefectoId && !actividad.anioPorDefecto) return;

  const persona = await prisma.persona.findUniqueOrThrow({ where: { id: personaId } });
  const datosActualizar: { carreraId?: string; anio?: number } = {};
  if (actividad.carreraPorDefectoId && !persona.carreraId) {
    datosActualizar.carreraId = actividad.carreraPorDefectoId;
  }
  if (actividad.anioPorDefecto && (!persona.anio || actividad.anioPorDefecto > persona.anio)) {
    datosActualizar.anio = actividad.anioPorDefecto;
  }
  if (Object.keys(datosActualizar).length > 0) {
    await prisma.persona.update({ where: { id: personaId }, data: datosActualizar });
  }
}

export async function inscribirPersona(actividadId: string, personaId: string, usuarioId: string) {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: actividadId } });
  if (actividad.estado === "finalizada" || actividad.estado === "cancelada") {
    throw new ActividadNoAceptaInscripcionesError(actividad.estado);
  }

  await aplicarCarreraAnioPorDefecto(actividad, personaId);

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

interface ImportarParticipacionesCsvInput {
  actividadId: string;
  usuarioId: string;
  nombreArchivo: string;
  contenidoCsv: string;
  mapeo: Record<string, CampoInscripcionImportable | "">;
}

// Importación de inscriptos por CSV — /07-modulo-participaciones.md sección
// 7 (decisión registrada con Gaspar, no hay DNI en la mayoría de los
// formularios de origen). Nunca crea una Persona nueva sola: sin una
// coincidencia con confianza suficiente, la fila queda pendiente de revisión
// manual (mismo mecanismo que ImportJobError del resto del sistema). Una
// reimportación de la misma actividad solo agrega inscripciones nuevas,
// nunca cancela a quien ya no figura en el archivo. La carrera/año por
// defecto (si la actividad los tiene configurados) se aplica automáticamente
// vía inscribirPersona(), no hace falta pasarlos acá (pedido de Gaspar,
// 2026-08-02: es una propiedad de la actividad, no de cada importación).
export async function importarParticipacionesCsv({
  actividadId,
  usuarioId,
  nombreArchivo,
  contenidoCsv,
  mapeo,
}: ImportarParticipacionesCsvInput) {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: actividadId } });
  if (actividad.estado === "finalizada" || actividad.estado === "cancelada") {
    throw new ActividadNoAceptaInscripcionesError(actividad.estado);
  }

  const { data: filas } = Papa.parse<Record<string, string>>(contenidoCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const rutaArchivo = `${usuarioId}/${Date.now()}-${nombreArchivo}`;
  const admin = createAdminClient();
  const { error: errorSubida } = await admin.storage
    .from("importaciones")
    .upload(rutaArchivo, contenidoCsv, { contentType: "text/csv" });

  const job = await prisma.importJob.create({
    data: {
      tipoOrigen: "csv",
      entidadDestino: "Actividad",
      estado: "procesando",
      archivoOrigenId: errorSubida ? null : rutaArchivo,
      totalFilas: filas.length,
      usuarioId,
    },
  });

  const umbral = await obtenerUmbralConfianzaDuplicados();
  let exitosas = 0;
  let conError = 0;
  let altasNuevas = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2;

    const datos: Partial<Record<CampoInscripcionImportable, string>> = {};
    for (const [columna, campo] of Object.entries(mapeo)) {
      if (!campo) continue;
      const valor = fila[columna];
      if (valor) datos[campo] = valor.trim();
    }

    // El formulario de origen suele traer el nombre en una sola columna
    // ("Nombre y apellido") en vez de dos separadas — se parte con la misma
    // heurística que la carga manual desde Padrón (editable ahí, acá se
    // asume tal cual dado el volumen de filas de una importación masiva).
    if (datos.nombreCompleto && (!datos.nombre || !datos.apellido)) {
      const partido = partirNombreYApellido(datos.nombreCompleto);
      datos.nombre = datos.nombre || partido.nombre;
      datos.apellido = datos.apellido || partido.apellido;
    }

    if (!datos.nombre || !datos.apellido) {
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: "Falta nombre o apellido en la fila.",
        },
      });
      continue;
    }

    try {
      const resultado = await buscarPersonaCoincidente(
        {
          nombre: datos.nombre,
          apellido: datos.apellido,
          telefono: datos.telefono,
          email: datos.email,
          dni: datos.dni,
        },
        umbral,
      );

      if (resultado.tipo === "ambiguo") {
        conError++;
        await prisma.importJobError.create({
          data: {
            importJobId: job.id,
            numeroFila,
            contenidoOriginal: JSON.stringify(fila),
            mensajeError: JSON.stringify({ motivo: resultado.motivo, candidatos: resultado.candidatos }),
          },
        });
        continue;
      }

      let personaId: string;

      if (resultado.tipo === "sin_candidatos") {
        // Nadie remotamente parecido ya cargado — alta nueva segura, ver
        // /07-modulo-participaciones.md sección 7.
        const nueva = await prisma.persona.create({
          data: {
            nombre: datos.nombre,
            apellido: datos.apellido,
            dni: datos.dni ?? null,
            creadoPorId: usuarioId,
            modificadoPorId: usuarioId,
            telefonos: datos.telefono
              ? { create: [{ numero: datos.telefono, esPrincipal: true }] }
              : undefined,
            emails: datos.email ? { create: [{ email: datos.email, esPrincipal: true }] } : undefined,
          },
        });
        await registrarCambio({
          entidad: "Persona",
          entidadId: nueva.id,
          accion: "crear",
          usuarioId,
          metadata: { origen: "importacion_inscriptos", actividadId },
        });
        personaId = nueva.id;
        altasNuevas++;
      } else {
        personaId = resultado.personaId;
      }

      await inscribirPersona(actividadId, personaId, usuarioId);
      exitosas++;
    } catch {
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: "No se pudo procesar la fila (error inesperado).",
        },
      });
    }
  }

  const jobFinal = await prisma.importJob.update({
    where: { id: job.id },
    data: {
      estado: conError > 0 ? "completado_con_errores" : "completado",
      filasExitosas: exitosas,
      filasConError: conError,
      fechaFin: new Date(),
    },
  });

  await registrarCambio({
    entidad: "ImportJob",
    entidadId: job.id,
    accion: "importar",
    usuarioId,
    metadata: { entidadDestino: "Participacion", actividadId, exitosas, conError, altasNuevas },
  });

  return { ...jobFinal, altasNuevas };
}
