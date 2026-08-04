import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import type { EntidadOrigenExport } from "@prisma/client";

// Exportaciones — /14-importaciones-exportaciones.md sección 8. Consultas
// dedicadas (no reusan los `listar*` paginados de cada servicio, que topean
// `porPagina` a un conjunto fijo de opciones pensado para la UI, nunca para
// volcar la base completa) con un tope duro de filas — /03-arquitectura.md:
// "escala desde el día uno", pero exportar de a cientos de miles de filas en
// una sola respuesta HTTP tampoco es razonable. Tope elegido acorde al
// volumen esperado real del sistema (S4 de /01-vision-alcance.md: miles, no
// decenas de miles).
const TOPE_FILAS_EXPORT = 20_000;

async function registrarExportJob(
  entidadOrigen: EntidadOrigenExport,
  usuarioId: string,
  filtrosAplicados?: object,
) {
  await prisma.exportJob.create({
    data: {
      entidadOrigen,
      formato: "csv",
      usuarioId,
      filtrosAplicados: filtrosAplicados ? JSON.stringify(filtrosAplicados) : null,
    },
  });
  await registrarCambio({
    entidad: "ExportJob",
    entidadId: entidadOrigen,
    accion: "exportar",
    usuarioId,
    metadata: { entidadOrigen, filtrosAplicados: filtrosAplicados ?? {} },
  });
}

export interface FiltrosExportPersonas {
  carreraId?: string;
  estadoFicha?: string;
}

export async function exportarPersonas(filtros: FiltrosExportPersonas, usuarioId: string) {
  const personas = await prisma.persona.findMany({
    where: {
      ...(filtros.carreraId ? { carreraId: filtros.carreraId } : {}),
      estadoFicha: (filtros.estadoFicha as "activa" | "archivada" | "fusionada" | undefined) ?? "activa",
    },
    include: {
      carrera: { select: { nombre: true } },
      telefonos: { where: { esPrincipal: true }, take: 1 },
      emails: { where: { esPrincipal: true }, take: 1 },
    },
    orderBy: { apellido: "asc" },
    take: TOPE_FILAS_EXPORT,
  });

  await registrarExportJob("Persona", usuarioId, filtros);

  return personas.map((p) => ({
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni ?? "",
    legajo: p.legajo ?? "",
    carrera: p.carrera?.nombre ?? "",
    anio: p.anio ?? "",
    telefono: p.telefonos[0]?.numero ?? "",
    email: p.emails[0]?.email ?? "",
    estadoFicha: p.estadoFicha,
    estadoPadronCD: p.estadoPadronCD,
    estadoPadronCE: p.estadoPadronCE,
    fechaCreacion: p.fechaCreacion.toISOString(),
  }));
}

export interface FiltrosExportActividades {
  desde?: Date;
  hasta?: Date;
}

// Incluye estado de participación por persona — /14-importaciones-exportaciones.md
// sección 8: "Actividades y sus participaciones". Una fila por participación
// (no una fila por actividad), para que el CSV sirva como planilla de
// asistencia real.
export async function exportarActividadesConParticipaciones(
  filtros: FiltrosExportActividades,
  usuarioId: string,
) {
  const participaciones = await prisma.participacion.findMany({
    where: {
      actividad: {
        ...(filtros.desde || filtros.hasta
          ? {
              fechaInicio: {
                ...(filtros.desde ? { gte: filtros.desde } : {}),
                ...(filtros.hasta ? { lte: filtros.hasta } : {}),
              },
            }
          : {}),
      },
    },
    include: {
      actividad: { select: { nombre: true, fechaInicio: true, tipoActividad: { select: { nombre: true } } } },
      persona: { select: { nombre: true, apellido: true, dni: true } },
    },
    orderBy: [{ actividad: { fechaInicio: "desc" } }],
    take: TOPE_FILAS_EXPORT,
  });

  await registrarExportJob("Participacion", usuarioId, filtros);

  return participaciones.map((p) => ({
    actividad: p.actividad.nombre,
    tipoActividad: p.actividad.tipoActividad.nombre,
    fechaActividad: p.actividad.fechaInicio.toISOString(),
    persona: `${p.persona.apellido}, ${p.persona.nombre}`,
    dni: p.persona.dni ?? "",
    estadoParticipacion: p.estado,
    fechaInscripcion: p.fechaInscripcion.toISOString(),
    fechaAsistencia: p.fechaAsistencia?.toISOString() ?? "",
  }));
}

export async function exportarPadron(padronId: string, usuarioId: string) {
  const entradas = await prisma.padronEntrada.findMany({
    where: { padronElectoralId: padronId },
    include: { persona: { select: { nombre: true, apellido: true } } },
    orderBy: { nombreCompletoOriginal: "asc" },
    take: TOPE_FILAS_EXPORT,
  });

  await registrarExportJob("PadronElectoral", usuarioId, { padronId });

  return entradas.map((e) => ({
    dni: e.dni ?? "",
    nombreOriginal: e.nombreCompletoOriginal,
    carreraOriginal: e.carreraTextoOriginal ?? "",
    estadoMatching: e.estadoMatching,
    confianzaMatching: e.confianzaMatching ?? "",
    personaVinculada: e.persona ? `${e.persona.apellido}, ${e.persona.nombre}` : "",
  }));
}

export interface FiltrosExportPunteo {
  // Cuando el usuario tiene punteo.exportar_todos, puede pedir el de todos
  // (soloPropio=false); si no, esto se ignora y siempre exporta solo el suyo
  // — la verificación real del permiso vive en la Server Action llamadora,
  // acá se recibe ya resuelto para no duplicar lógica de autorización.
  soloPropio: boolean;
}

// `entidadOrigen: "Persona"` acá es una aproximación deliberada: el enum
// `EntidadOrigenExport` (/04-modelo-datos.md) no tiene un valor propio para
// Punteo — se etiqueta con `modulo: "punteo"` en `metadata` en su lugar, en
// vez de sumar una migración de schema solo para esta categorización. Si en
// el futuro la vista de auditoría necesita distinguir exports de punteo con
// más precisión que filtrando por metadata, ahí sí vale agregar el valor de
// enum.
export async function exportarPunteo(usuarioId: string, filtros: FiltrosExportPunteo) {
  const punteos = await prisma.punteoPersona.findMany({
    where: filtros.soloPropio ? { usuarioId } : {},
    include: {
      persona: { select: { nombre: true, apellido: true, dni: true } },
      clasificacion: { select: { nombre: true } },
      usuario: { select: { nombre: true, apellido: true } },
    },
    orderBy: { fechaUltimaActualizacion: "desc" },
    take: TOPE_FILAS_EXPORT,
  });

  await registrarExportJob("Persona", usuarioId, { modulo: "punteo", soloPropio: filtros.soloPropio });

  return punteos.map((p) => ({
    persona: `${p.persona.apellido}, ${p.persona.nombre}`,
    dni: p.persona.dni ?? "",
    clasificacion: p.clasificacion?.nombre ?? "",
    estadoSeguimiento: p.estadoSeguimiento,
    usuario: filtros.soloPropio ? undefined : `${p.usuario.nombre} ${p.usuario.apellido}`,
    fechaUltimaActualizacion: p.fechaUltimaActualizacion.toISOString(),
  }));
}
