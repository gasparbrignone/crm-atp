import { prisma } from "@/lib/prisma/client";
import {
  obtenerCoberturaPunteo,
  obtenerRankingMilitantesPunteo,
  obtenerDistribucionClasificacionPunteo,
} from "@/lib/servicios/punteo.service";

// Fase 3 (/20-roadmap.md sección 6): KPIs y gráficos que dependían solo de
// Personas y Actividades. Los paneles de /11-dashboards.md que dependían de
// Punteo/Padrón (cobertura, ranking de militantes, distribución de
// clasificación) se agregaron en la Fase 9, una vez esos módulos existían —
// ver `obtenerAgregadosPunteoAdmin` más abajo. Sigue pendiente: comparativa
// entre padrones, y "Mis pendientes" del dashboard personal (depende de
// Notificaciones, fase 11).

export type RangoFecha = "semana" | "mes" | "cuatrimestre" | "todo";

export interface Periodo {
  desde: Date | null;
  hasta: Date;
  desdeAnterior: Date | null;
  hastaAnterior: Date | null;
}

export function resolverPeriodo(rango: RangoFecha, ahora: Date = new Date()): Periodo {
  if (rango === "todo") {
    return { desde: null, hasta: ahora, desdeAnterior: null, hastaAnterior: null };
  }

  const desde = new Date(ahora);
  if (rango === "semana") desde.setDate(desde.getDate() - 7);
  else if (rango === "mes") desde.setMonth(desde.getMonth() - 1);
  else desde.setMonth(desde.getMonth() - 4); // cuatrimestre ≈ 4 meses

  const duracionMs = ahora.getTime() - desde.getTime();
  const hastaAnterior = new Date(desde.getTime());
  const desdeAnterior = new Date(desde.getTime() - duracionMs);

  return { desde, hasta: ahora, desdeAnterior, hastaAnterior };
}

export interface ConTendencia {
  valor: number;
  valorAnterior: number | null;
}

function calcularTendencia(valor: number, valorAnterior: number | null): ConTendencia {
  return { valor, valorAnterior };
}

export interface FiltrosDashboardAdmin {
  rango: RangoFecha;
  carreraId?: string;
  tipoActividadId?: string;
}

export async function obtenerKpisAdmin(filtros: FiltrosDashboardAdmin) {
  const periodo = resolverPeriodo(filtros.rango);
  const whereCarrera = filtros.carreraId ? { carreraId: filtros.carreraId } : {};
  const whereTipoActividad = filtros.tipoActividadId
    ? { tipoActividadId: filtros.tipoActividadId }
    : {};

  const [
    personasActivas,
    personasActivasAlCorteAnterior,
    actividadesFinalizadas,
    actividadesFinalizadasAnterior,
    personasNuevas,
    personasNuevasAnterior,
    participacionesDelPeriodo,
  ] = await Promise.all([
    prisma.persona.count({ where: { estadoFicha: "activa", ...whereCarrera } }),
    // Aproximación: no existe snapshot histórico de fichas, así que la
    // tendencia de "activas" se estima con las cargadas hasta el corte
    // anterior (ignora archivados/fusionados entre medio) — documentado acá
    // porque no está resuelto en /11-dashboards.md cómo trackear esto sin
    // historial de snapshots.
    periodo.hastaAnterior
      ? prisma.persona.count({
          where: {
            estadoFicha: "activa",
            fechaCreacion: { lte: periodo.hastaAnterior },
            ...whereCarrera,
          },
        })
      : Promise.resolve(null),
    prisma.actividad.count({
      where: {
        estado: "finalizada",
        ...whereTipoActividad,
        ...(periodo.desde ? { fechaInicio: { gte: periodo.desde, lte: periodo.hasta } } : {}),
      },
    }),
    periodo.desdeAnterior
      ? prisma.actividad.count({
          where: {
            estado: "finalizada",
            ...whereTipoActividad,
            fechaInicio: { gte: periodo.desdeAnterior, lte: periodo.hastaAnterior! },
          },
        })
      : Promise.resolve(null),
    prisma.persona.count({
      where: {
        ...whereCarrera,
        ...(periodo.desde ? { fechaCreacion: { gte: periodo.desde, lte: periodo.hasta } } : {}),
      },
    }),
    periodo.desdeAnterior
      ? prisma.persona.count({
          where: {
            ...whereCarrera,
            fechaCreacion: { gte: periodo.desdeAnterior, lte: periodo.hastaAnterior! },
          },
        })
      : Promise.resolve(null),
    prisma.participacion.groupBy({
      by: ["estado"],
      _count: true,
      where: {
        estado: { not: "cancelado" },
        actividad: {
          ...whereTipoActividad,
          ...(periodo.desde ? { fechaInicio: { gte: periodo.desde, lte: periodo.hasta } } : {}),
        },
      },
    }),
  ]);

  const totalParticipaciones = participacionesDelPeriodo.reduce((acc, p) => acc + p._count, 0);
  const asistieron = participacionesDelPeriodo.find((p) => p.estado === "asistio")?._count ?? 0;
  const tasaAsistencia = totalParticipaciones > 0 ? asistieron / totalParticipaciones : null;

  return {
    personasActivas: calcularTendencia(personasActivas, personasActivasAlCorteAnterior),
    actividadesFinalizadas: calcularTendencia(actividadesFinalizadas, actividadesFinalizadasAnterior),
    personasNuevas: calcularTendencia(personasNuevas, personasNuevasAnterior),
    tasaAsistencia,
  };
}

export async function obtenerEvolucionPersonas(filtros: FiltrosDashboardAdmin) {
  const periodo = resolverPeriodo(filtros.rango);
  const whereCarrera = filtros.carreraId ? { carreraId: filtros.carreraId } : {};

  const personas = await prisma.persona.findMany({
    where: {
      ...whereCarrera,
      ...(periodo.desde ? { fechaCreacion: { gte: periodo.desde, lte: periodo.hasta } } : {}),
    },
    select: { fechaCreacion: true },
    orderBy: { fechaCreacion: "asc" },
  });

  // Agrupa por semana si el rango es corto (semana/mes), por mes si es más
  // largo (cuatrimestre/todo) — evita series con un punto por día en rangos
  // largos.
  const agruparPorSemana = filtros.rango === "semana" || filtros.rango === "mes";
  const buckets = new Map<string, number>();

  for (const persona of personas) {
    const fecha = persona.fechaCreacion;
    const clave = agruparPorSemana
      ? claveSemana(fecha)
      : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(clave, (buckets.get(clave) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([periodo, cantidad]) => ({ periodo, cantidad }));
}

function claveSemana(fecha: Date): string {
  const inicioSemana = new Date(fecha);
  const dia = inicioSemana.getDay() === 0 ? 7 : inicioSemana.getDay(); // lunes = inicio
  inicioSemana.setDate(inicioSemana.getDate() - (dia - 1));
  return inicioSemana.toISOString().slice(0, 10);
}

export async function obtenerParticipacionPorTipoActividad(filtros: FiltrosDashboardAdmin) {
  const periodo = resolverPeriodo(filtros.rango);

  const tipos = await prisma.tipoActividad.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
    include: {
      actividades: {
        where: periodo.desde ? { fechaInicio: { gte: periodo.desde, lte: periodo.hasta } } : {},
        select: {
          _count: { select: { participaciones: { where: { estado: { not: "cancelado" } } } } },
        },
      },
    },
  });

  return tipos
    .map((tipo) => ({
      nombre: tipo.nombre,
      color: tipo.color,
      cantidad: tipo.actividades.reduce((acc, a) => acc + a._count.participaciones, 0),
    }))
    .filter((t) => t.cantidad > 0);
}

export async function obtenerDistribucionPorCarreraYAnio() {
  const personas = await prisma.persona.groupBy({
    by: ["carreraId", "anio"],
    _count: true,
    where: { estadoFicha: "activa", carreraId: { not: null } },
  });

  const carreras = await prisma.carrera.findMany({ where: { activo: true } });
  const nombrePorId = new Map(carreras.map((c) => [c.id, c.nombre]));

  return personas
    .map((p) => ({
      carrera: nombrePorId.get(p.carreraId!) ?? "Sin carrera",
      anio: p.anio,
      cantidad: p._count,
    }))
    .filter((p) => p.carrera !== "Sin carrera");
}

export async function obtenerRankingActividadesPorAsistencia(
  filtros: FiltrosDashboardAdmin,
  orden: "mayor" | "menor" = "mayor",
  limite = 10,
) {
  const periodo = resolverPeriodo(filtros.rango);
  const whereTipoActividad = filtros.tipoActividadId
    ? { tipoActividadId: filtros.tipoActividadId }
    : {};

  const actividades = await prisma.actividad.findMany({
    where: {
      estado: "finalizada",
      ...whereTipoActividad,
      ...(periodo.desde ? { fechaInicio: { gte: periodo.desde, lte: periodo.hasta } } : {}),
    },
    select: {
      id: true,
      nombre: true,
      fechaInicio: true,
      tipoActividad: { select: { nombre: true, color: true } },
      participaciones: { select: { estado: true } },
    },
  });

  const signo = orden === "mayor" ? -1 : 1;
  return actividades
    .map((a) => {
      const noCanceladas = a.participaciones.filter((p) => p.estado !== "cancelado");
      const asistieron = noCanceladas.filter((p) => p.estado === "asistio").length;
      return {
        id: a.id,
        nombre: a.nombre,
        tipoActividad: a.tipoActividad.nombre,
        color: a.tipoActividad.color,
        fechaInicio: a.fechaInicio,
        inscriptos: noCanceladas.length,
        asistieron,
        tasaAsistencia: noCanceladas.length > 0 ? asistieron / noCanceladas.length : 0,
      };
    })
    .filter((a) => a.inscriptos > 0)
    .sort((a, b) => signo * (a.tasaAsistencia - b.tasaAsistencia))
    .slice(0, limite);
}

export async function obtenerPanelOperativo() {
  const ahora = new Date();
  const en7Dias = new Date(ahora);
  en7Dias.setDate(en7Dias.getDate() + 7);

  const [actividadesProximas, importacionesConErrores] = await Promise.all([
    prisma.actividad.findMany({
      where: {
        estado: { in: ["planificada", "en_curso"] },
        fechaInicio: { gte: ahora, lte: en7Dias },
      },
      orderBy: { fechaInicio: "asc" },
      take: 10,
      select: { id: true, nombre: true, fechaInicio: true, tipoActividad: { select: { nombre: true } } },
    }),
    prisma.importJob.findMany({
      where: { filasConError: { gt: 0 } },
      orderBy: { fechaInicio: "desc" },
      take: 5,
      select: {
        id: true,
        entidadDestino: true,
        filasConError: true,
        totalFilas: true,
        fechaInicio: true,
      },
    }),
  ]);

  return { actividadesProximas, importacionesConErrores };
}

// "Salud de datos" — /REVISION-CRITICA-AUDITORIA-2026-08-04.md punto 5: se
// integra al dashboard admin ya existente en vez de un módulo nuevo
// (evita fragmentar el único lugar donde un administrador ya va a buscar
// "estado general del sistema" en dos pantallas separadas). Son counts
// baratos, sin impacto de performance real al volumen esperado del sistema.
export async function obtenerSaludDatos() {
  const [personasSinContacto, entradasPadronPendientes, importacionesSinTerminar] = await Promise.all([
    prisma.persona.count({
      where: {
        estadoFicha: "activa",
        telefonos: { none: {} },
        emails: { none: {} },
      },
    }),
    prisma.padronEntrada.count({ where: { estadoMatching: "pendiente" } }),
    prisma.importJob.count({ where: { estado: { in: ["pendiente", "procesando"] } } }),
  ]);

  return { personasSinContacto, entradasPadronPendientes, importacionesSinTerminar };
}

// Agregados de Punteo para el dashboard admin — /11-dashboards.md sección
// 3.2. `incluirRankingMilitantes` se decide en la página según si quien mira
// el dashboard tiene `punteo.ver_todos` (expone actividad de otros usuarios,
// a diferencia de cobertura/distribución que son agregados puros sin
// identificar usuarios).
export async function obtenerAgregadosPunteoAdmin(incluirRankingMilitantes: boolean) {
  const [cobertura, distribucionClasificacion, rankingMilitantes] = await Promise.all([
    obtenerCoberturaPunteo(),
    obtenerDistribucionClasificacionPunteo(),
    incluirRankingMilitantes ? obtenerRankingMilitantesPunteo() : Promise.resolve(null),
  ]);
  return { cobertura, distribucionClasificacion, rankingMilitantes };
}

export async function obtenerDashboardPersonal(usuarioId: string) {
  const ahora = new Date();

  const [misActividades, miHistorialReciente] = await Promise.all([
    prisma.actividad.findMany({
      where: { responsableId: usuarioId, estado: { in: ["planificada", "en_curso"] } },
      orderBy: { fechaInicio: "asc" },
      take: 10,
      select: {
        id: true,
        nombre: true,
        fechaInicio: true,
        estado: true,
        cupoMaximo: true,
        tipoActividad: { select: { nombre: true, color: true } },
        _count: { select: { participaciones: { where: { estado: { not: "cancelado" } } } } },
      },
    }),
    prisma.historialCambio.findMany({
      where: { usuarioId },
      orderBy: { fecha: "desc" },
      take: 15,
    }),
  ]);

  return {
    misActividades: misActividades.map((a) => ({
      ...a,
      esPasada: a.fechaInicio < ahora,
      inscriptos: a._count.participaciones,
    })),
    miHistorialReciente,
  };
}
