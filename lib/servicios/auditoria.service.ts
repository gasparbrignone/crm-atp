import { prisma } from "@/lib/prisma/client";
import type { AccionHistorial, Prisma } from "@prisma/client";

interface RegistrarCambioInput {
  entidad: string;
  entidadId: string;
  accion: AccionHistorial;
  usuarioId: string | null;
  campo?: string;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  metadata?: Record<string, unknown>;
}

// HistorialCambio es append-only (ver /04-modelo-datos.md sección 11 y RN-6):
// solo INSERT, nunca UPDATE/DELETE desde la aplicación. Todo servicio que
// modifique una entidad de negocio pasa por acá para dejar el rastro exigido
// por el principio rector 7 de /01-vision-alcance.md.
export async function registrarCambio(input: RegistrarCambioInput) {
  if (!input.usuarioId && !input.metadata) {
    throw new Error(
      "RN-6: un evento sin usuario debe traer metadata identificando el proceso que lo generó.",
    );
  }

  return prisma.historialCambio.create({
    data: {
      entidad: input.entidad,
      entidadId: input.entidadId,
      accion: input.accion,
      usuarioId: input.usuarioId,
      campo: input.campo,
      valorAnterior: input.valorAnterior ?? null,
      valorNuevo: input.valorNuevo ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

// Línea de tiempo por entidad — /17-auditoria-historial.md sección 6. Quien
// puede ver la ficha de la entidad puede ver su historial, sin permiso
// separado (sección 10) — la excepción de punteo se resuelve en su propio
// módulo, no acá. Orden cronológico descendente (más reciente arriba).
//
// Nota: hoy cada campo modificado en una misma edición genera su propia fila
// de HistorialCambio (ver actualizarPersona() en personas.service.ts), no un
// único evento agrupado por operación de guardado como describe la sección 8
// del documento — se muestran tal cual, como entradas separadas, en vez de
// re-agruparlas acá con heurísticas de timestamp que podrían unir eventos de
// operaciones distintas por error.
export async function obtenerHistorialDeEntidad(entidad: string, entidadId: string) {
  const eventos = await prisma.historialCambio.findMany({
    where: { entidad, entidadId },
    include: { usuario: { select: { nombre: true, apellido: true } } },
    orderBy: { fecha: "desc" },
  });

  return eventos.map((e) => ({
    id: e.id,
    accion: e.accion,
    campo: e.campo,
    valorAnterior: e.valorAnterior,
    valorNuevo: e.valorNuevo,
    fecha: e.fecha,
    usuarioNombre: e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : null,
    metadata: e.metadata ? (JSON.parse(e.metadata) as Record<string, unknown>) : null,
  }));
}

// Entidades sensibles del módulo de Punteo — se excluyen de la vista de
// auditoría global salvo que quien consulta tenga además `punteo.ver_todos`
// (RN-5, /17-auditoria-historial.md sección 8 y 11: "la auditoría nunca es
// una vía alternativa para eludir los permisos definidos"). En la práctica
// el contenido de un comentario nunca se guarda en HistorialCambio (ver
// registrarComentarioPunteo en punteo.service.ts, solo metadata con ids), así
// que esto protege sobre todo el patrón de acceso en sí — quién miró el
// punteo de quién — que es justamente el dato que /08-modulo-punteo-electoral.md
// sección 8 pide auditar como excepción, no exponer sin más.
const ENTIDADES_PUNTEO = ["PunteoPersona", "PunteoComentario"];

export interface FiltrosAuditoriaGlobal {
  usuarioId?: string;
  entidad?: string;
  accion?: AccionHistorial;
  desde?: Date;
  hasta?: Date;
  entidadIdBusqueda?: string;
}

const PAGE_SIZE_AUDITORIA = 50;

// Vista de auditoría global (Administrador) — /17-auditoria-historial.md
// sección 7: filtro por usuario, tipo de entidad, tipo de acción, rango de
// fechas, y búsqueda por entidad puntual (pegar/buscar un id).
export async function listarAuditoriaGlobal(
  filtros: FiltrosAuditoriaGlobal,
  pagina: number,
  puedeVerPunteo: boolean,
) {
  const where: Prisma.HistorialCambioWhereInput = {
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
    ...(filtros.accion ? { accion: filtros.accion } : {}),
    ...(filtros.entidadIdBusqueda ? { entidadId: filtros.entidadIdBusqueda } : {}),
    ...(filtros.desde || filtros.hasta
      ? { fecha: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
      : {}),
    ...(!puedeVerPunteo ? { entidad: { notIn: ENTIDADES_PUNTEO } } : {}),
  };

  const [total, eventos] = await Promise.all([
    prisma.historialCambio.count({ where }),
    prisma.historialCambio.findMany({
      where,
      include: { usuario: { select: { nombre: true, apellido: true, email: true } } },
      orderBy: { fecha: "desc" },
      skip: (pagina - 1) * PAGE_SIZE_AUDITORIA,
      take: PAGE_SIZE_AUDITORIA,
    }),
  ]);

  return {
    eventos,
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / PAGE_SIZE_AUDITORIA)),
  };
}

// Lista de valores distintos de `entidad` ya registrados — alimenta el
// selector de filtro sin hardcodear la lista de entidades auditables.
export async function listarEntidadesAuditadas(puedeVerPunteo: boolean): Promise<string[]> {
  const filas = await prisma.historialCambio.findMany({
    distinct: ["entidad"],
    select: { entidad: true },
    orderBy: { entidad: "asc" },
  });
  const entidades = filas.map((f) => f.entidad);
  return puedeVerPunteo ? entidades : entidades.filter((e) => !ENTIDADES_PUNTEO.includes(e));
}

// Exportación a CSV de la auditoría global filtrada —
// /17-auditoria-historial.md sección 7: "exportable a CSV para revisión
// externa". Reusa el mismo `where` que la vista paginada, sin el límite de
// página (tope duro para no generar un CSV descontrolado en un sistema sin
// paginación de exportación todavía).
const TOPE_FILAS_EXPORT_AUDITORIA = 10_000;

export async function obtenerFilasAuditoriaParaExportar(
  filtros: FiltrosAuditoriaGlobal,
  puedeVerPunteo: boolean,
) {
  const where: Prisma.HistorialCambioWhereInput = {
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
    ...(filtros.accion ? { accion: filtros.accion } : {}),
    ...(filtros.entidadIdBusqueda ? { entidadId: filtros.entidadIdBusqueda } : {}),
    ...(filtros.desde || filtros.hasta
      ? { fecha: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
      : {}),
    ...(!puedeVerPunteo ? { entidad: { notIn: ENTIDADES_PUNTEO } } : {}),
  };

  return prisma.historialCambio.findMany({
    where,
    include: { usuario: { select: { nombre: true, apellido: true, email: true } } },
    orderBy: { fecha: "desc" },
    take: TOPE_FILAS_EXPORT_AUDITORIA,
  });
}
