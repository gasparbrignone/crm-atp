import { prisma } from "@/lib/prisma/client";
import type { TipoNotificacion } from "@prisma/client";

// Módulo de Notificaciones — /13-notificaciones.md. El canal in-app (sección
// 4) es el único obligatorio y nunca se desactiva; el resumen por email es
// opcional por usuario (sección 5) y se resuelve en digest.service.ts.
//
// Principio de diseño deliberado: generar una notificación es siempre un
// efecto secundario de una operación de negocio más importante (cancelar una
// actividad, terminar una importación, etc.), nunca la operación principal.
// Por eso cada función acá adentro atrapa sus propios errores y nunca los
// propaga — un fallo al notificar no debe tirar abajo la operación real que
// la originó, exactamente el mismo patrón corregido en la auditoría de IA
// del 2026-08-03 (ver INFORME-AUDITORIA-EXTERNA.md sección 5) aplicado acá
// de entrada, no como parche posterior.

interface CrearNotificacionInput {
  usuarioId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadRelacionada?: string;
  entidadRelacionadaId?: string;
  // Clave estable del disparador, para idempotencia (sección 7). Si se pasa,
  // no se crea una notificación nueva si ya existe una con la misma
  // combinación (disparador, entidadRelacionadaId, usuarioId) dentro de
  // `ventanaIdempotenciaDias` — o nunca más, si se omite la ventana (el caso
  // por defecto para eventos que ocurren una sola vez en la vida de la
  // entidad, ej. "padrón activado").
  disparador?: string;
  ventanaIdempotenciaDias?: number;
}

async function yaExisteNotificacionReciente(
  disparador: string,
  entidadRelacionadaId: string | undefined,
  usuarioId: string,
  ventanaIdempotenciaDias?: number,
): Promise<boolean> {
  const desde = ventanaIdempotenciaDias
    ? new Date(Date.now() - ventanaIdempotenciaDias * 24 * 60 * 60 * 1000)
    : undefined;

  const existente = await prisma.notificacion.findFirst({
    where: {
      disparador,
      entidadRelacionadaId: entidadRelacionadaId ?? null,
      usuarioId,
      ...(desde ? { fechaCreacion: { gte: desde } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

async function crearNotificacionInterno(input: CrearNotificacionInput) {
  try {
    if (input.disparador) {
      const yaExiste = await yaExisteNotificacionReciente(
        input.disparador,
        input.entidadRelacionadaId,
        input.usuarioId,
        input.ventanaIdempotenciaDias,
      );
      if (yaExiste) return null;
    }

    return await prisma.notificacion.create({
      data: {
        usuarioId: input.usuarioId,
        tipo: input.tipo,
        titulo: input.titulo,
        mensaje: input.mensaje,
        entidadRelacionada: input.entidadRelacionada,
        entidadRelacionadaId: input.entidadRelacionadaId,
        disparador: input.disparador,
      },
    });
  } catch (error) {
    console.error("[notificaciones] no se pudo crear una notificación:", error);
    return null;
  }
}

// Variante para muchos destinatarios a la vez (ej. "padrón activado" → todos
// los usuarios activos). Cada destinatario se resuelve de forma independiente
// para que el fallo de uno no afecte al resto.
async function crearNotificacionParaVarios(
  usuarioIds: string[],
  datos: Omit<CrearNotificacionInput, "usuarioId">,
) {
  await Promise.all(usuarioIds.map((usuarioId) => crearNotificacionInterno({ ...datos, usuarioId })));
}

async function usuariosActivosConPermiso(codigoPermiso: string): Promise<string[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { estado: "activo", rol: { permisos: { some: { permiso: { codigo: codigoPermiso } } } } },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura — panel de campana, historial, contador
// ─────────────────────────────────────────────────────────────────────────

export async function contarNoLeidas(usuarioId: string): Promise<number> {
  return prisma.notificacion.count({ where: { usuarioId, leida: false } });
}

// Panel corto de la campana — /18-configuracion-sistema.md sección 8, clave
// dias_retencion_notificaciones_leidas: una leída deja de aparecer acá pasado
// ese umbral (no se borra, sigue en /notificaciones — historial completo).
// Las no leídas siempre aparecen, sin importar antigüedad.
export async function listarNotificacionesRecientes(usuarioId: string, limite = 20) {
  const diasRetencion = await obtenerParametroNumerico("dias_retencion_notificaciones_leidas", 30);
  const limiteFecha = new Date(Date.now() - diasRetencion * 24 * 60 * 60 * 1000);

  return prisma.notificacion.findMany({
    where: {
      usuarioId,
      OR: [{ leida: false }, { fechaCreacion: { gte: limiteFecha } }],
    },
    orderBy: { fechaCreacion: "desc" },
    take: limite,
  });
}

const PAGE_SIZE_HISTORIAL = 30;

// Historial completo, paginado — /13-notificaciones.md sección 6: "útil para
// reconstruir qué pasó esta semana". A diferencia del panel desplegable
// (listarNotificacionesRecientes, acotado a las últimas), acá se listan todas
// sin importar antigüedad ni lectura — el parámetro
// dias_retencion_notificaciones_leidas solo aplica al panel corto, no a este
// historial completo, que es justamente la vista pensada para volver atrás.
export async function listarHistorialNotificaciones(usuarioId: string, pagina = 1) {
  const [total, notificaciones] = await Promise.all([
    prisma.notificacion.count({ where: { usuarioId } }),
    prisma.notificacion.findMany({
      where: { usuarioId },
      orderBy: { fechaCreacion: "desc" },
      skip: (pagina - 1) * PAGE_SIZE_HISTORIAL,
      take: PAGE_SIZE_HISTORIAL,
    }),
  ]);
  return { notificaciones, total, paginas: Math.max(1, Math.ceil(total / PAGE_SIZE_HISTORIAL)) };
}

export async function marcarNotificacionLeida(id: string, usuarioId: string) {
  // where compuesto por usuarioId: un usuario no puede marcar como leída una
  // notificación ajena aunque adivine el id.
  await prisma.notificacion.updateMany({
    where: { id, usuarioId, leida: false },
    data: { leida: true, fechaLectura: new Date() },
  });
}

export async function marcarTodasLasNotificacionesLeidas(usuarioId: string) {
  await prisma.notificacion.updateMany({
    where: { usuarioId, leida: false },
    data: { leida: true, fechaLectura: new Date() },
  });
}

// Preferencias de resumen por email — /13-notificaciones.md sección 5. El
// canal in-app arriba no tiene interruptor: es la garantía mínima de que la
// información llega, tal como especifica esa sección.
export async function actualizarPreferenciasNotificacion(
  usuarioId: string,
  datos: { recibirDigestEmail: boolean; frecuenciaDigestEmail: "diario" | "semanal" },
) {
  await prisma.usuario.update({ where: { id: usuarioId }, data: datos });
}

// ─────────────────────────────────────────────────────────────────────────
// Disparadores basados en eventos — /13-notificaciones.md sección 3
// ─────────────────────────────────────────────────────────────────────────

export async function notificarActividadCancelada(actividadId: string) {
  const actividad = await prisma.actividad.findUnique({
    where: { id: actividadId },
    select: {
      nombre: true,
      participaciones: {
        where: { estado: { not: "cancelado" } },
        select: { persona: { select: { nombre: true, apellido: true } }, personaId: true },
      },
      // Notifica a los usuarios que cargaron o son responsables de las
      // inscripciones activas, dado que las Personas no reciben avisos
      // directos (nota de /13-notificaciones.md sección 3) y son quienes
      // tienen que avisarles por fuera del sistema.
      responsable: { select: { id: true } },
    },
  });
  if (!actividad) return;

  const destinatarios = new Set<string>();
  if (actividad.responsable) destinatarios.add(actividad.responsable.id);

  await crearNotificacionParaVarios([...destinatarios], {
    tipo: "informativa",
    titulo: "Actividad cancelada",
    mensaje: `"${actividad.nombre}" fue cancelada. ${actividad.participaciones.length} persona(s) inscriptas — avisales por fuera del sistema.`,
    entidadRelacionada: "Actividad",
    entidadRelacionadaId: actividadId,
    disparador: "actividad_cancelada",
  });
}

export async function notificarActividadReprogramada(
  actividadId: string,
  fechaAnterior: Date,
  fechaNueva: Date,
) {
  if (fechaAnterior.getTime() === fechaNueva.getTime()) return;

  const actividad = await prisma.actividad.findUnique({
    where: { id: actividadId },
    select: { nombre: true, responsableId: true },
  });
  if (!actividad) return;

  const formateador = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
  await crearNotificacionInterno({
    usuarioId: actividad.responsableId,
    tipo: "informativa",
    titulo: "Actividad reprogramada",
    mensaje: `"${actividad.nombre}" pasó de ${formateador.format(fechaAnterior)} a ${formateador.format(fechaNueva)}.`,
    entidadRelacionada: "Actividad",
    entidadRelacionadaId: actividadId,
    disparador: `actividad_reprogramada_${fechaNueva.toISOString()}`,
  });
}

interface DatosImportacionFinalizada {
  jobId: string;
  usuarioId: string;
  entidadDestino: string;
  exitosas: number;
  conError: number;
}

export async function notificarImportacionFinalizada({
  jobId,
  usuarioId,
  entidadDestino,
  exitosas,
  conError,
}: DatosImportacionFinalizada) {
  const conErrores = conError > 0;
  await crearNotificacionInterno({
    usuarioId,
    tipo: conErrores ? "alerta" : "informativa",
    titulo: conErrores ? "Importación finalizada con errores" : "Importación finalizada",
    mensaje: conErrores
      ? `${exitosas} fila(s) de ${entidadDestino} importadas correctamente, ${conError} con error — revisalas en el detalle de la importación.`
      : `${exitosas} fila(s) de ${entidadDestino} importadas correctamente.`,
    entidadRelacionada: "ImportJob",
    entidadRelacionadaId: jobId,
    disparador: "importacion_finalizada",
  });
}

// Padrón con entradas en revisión manual tras un lote de matching automático
// — la aproximación más fiel disponible hoy a "duplicado de alta confianza
// pendiente de revisión" del catálogo de disparadores (/13-notificaciones.md
// sección 3): el alta manual de Persona resuelve sus duplicados en el acto
// (ver /app/(app)/personas/actions.ts), no deja una cola pendiente — la única
// cola real de "candidatos a revisar" del sistema hoy es esta.
export async function notificarPendientesRevisionPadron(padronId: string, cantidadPendientes: number) {
  if (cantidadPendientes <= 0) return;

  const padron = await prisma.padronElectoral.findUnique({
    where: { id: padronId },
    select: { archivoOrigenId: true },
  });
  if (!padron) return;

  const destinatarios = await usuariosActivosConPermiso("personas.fusionar_duplicados");
  await crearNotificacionParaVarios(destinatarios, {
    tipo: "accionable",
    titulo: "Padrón con coincidencias a revisar",
    mensaje: `${cantidadPendientes} entrada(s) del padrón necesitan revisión manual antes de poder activarlo.`,
    entidadRelacionada: "PadronElectoral",
    entidadRelacionadaId: padronId,
    disparador: "padron_pendientes_revision",
    ventanaIdempotenciaDias: 1,
  });
}

export async function notificarPadronActivado(padronId: string) {
  const usuarios = await prisma.usuario.findMany({
    where: { estado: "activo" },
    select: { id: true },
  });
  await crearNotificacionParaVarios(usuarios.map((u) => u.id), {
    tipo: "informativa",
    titulo: "Nuevo padrón electoral activado",
    mensaje: "Se activó un padrón electoral nuevo — los estados de habilitación ya están actualizados.",
    entidadRelacionada: "PadronElectoral",
    entidadRelacionadaId: padronId,
    disparador: "padron_activado",
  });
}

export async function notificarCambioRolUsuario(
  usuarioId: string,
  rolAnterior: string,
  rolNuevo: string,
) {
  await crearNotificacionInterno({
    usuarioId,
    tipo: "informativa",
    titulo: "Tu rol cambió",
    mensaje: `Tu rol pasó de ${rolAnterior} a ${rolNuevo}.`,
    entidadRelacionada: "Usuario",
    entidadRelacionadaId: usuarioId,
    disparador: `cambio_rol_${rolNuevo}_${Date.now()}`,
  });
}

export async function notificarCambioPermisosRol(rolId: string) {
  const usuarios = await prisma.usuario.findMany({
    where: { rolId, estado: "activo" },
    select: { id: true },
  });
  await crearNotificacionParaVarios(usuarios.map((u) => u.id), {
    tipo: "informativa",
    titulo: "Tus permisos cambiaron",
    mensaje: "Se actualizaron los permisos de tu rol — puede que ahora veas secciones nuevas o distintas.",
    entidadRelacionada: "Rol",
    entidadRelacionadaId: rolId,
    disparador: `cambio_permisos_rol_${Date.now()}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Disparadores periódicos — corridos una vez por día desde el cron
// (app/api/cron/notificaciones-periodicas/route.ts). Hobby de Vercel no
// permite más de una ejecución diaria de cron (ver CLAUDE.md sección 10), así
// que todo lo "proactivo" del catálogo se evalúa acá, no en tiempo real.
// ─────────────────────────────────────────────────────────────────────────

async function obtenerParametroNumerico(clave: string, porDefecto: number): Promise<number> {
  const config = await prisma.configuracionSistema.findUnique({ where: { clave } });
  const valor = config ? Number(config.valor) : NaN;
  return Number.isFinite(valor) ? valor : porDefecto;
}

// Punteo propio sin actualizar hace más de N días — /13-notificaciones.md
// sección 3, umbral configurable (/18-configuracion-sistema.md sección 8,
// clave dias_inactividad_punteo_recordatorio). Se avisa una vez por período:
// la ventana de idempotencia es el propio umbral, así que no vuelve a avisar
// hasta que pasen otros N días sin que el usuario toque ese registro.
export async function generarRecordatoriosPunteoInactivo() {
  const diasInactividad = await obtenerParametroNumerico("dias_inactividad_punteo_recordatorio", 30);
  const limite = new Date(Date.now() - diasInactividad * 24 * 60 * 60 * 1000);

  const punteosInactivos = await prisma.punteoPersona.findMany({
    where: {
      fechaUltimaActualizacion: { lt: limite },
      estadoSeguimiento: { not: "cerrado" },
    },
    select: {
      id: true,
      usuarioId: true,
      personaId: true,
      persona: { select: { nombre: true, apellido: true } },
    },
  });

  for (const punteo of punteosInactivos) {
    await crearNotificacionInterno({
      usuarioId: punteo.usuarioId,
      tipo: "accionable",
      titulo: "Punteo sin actualizar",
      mensaje: `${punteo.persona.nombre} ${punteo.persona.apellido} no tiene seguimiento actualizado hace más de ${diasInactividad} días.`,
      // entidadRelacionadaId es el personaId (no el id de PunteoPersona):
      // /punteo/[personaId] es la ruta real de la ficha de trabajo, y sigue
      // siendo una clave estable para la idempotencia (una persona tiene a lo
      // sumo un PunteoPersona por usuario).
      entidadRelacionada: "PunteoPersona",
      entidadRelacionadaId: punteo.personaId,
      disparador: "punteo_inactivo",
      ventanaIdempotenciaDias: diasInactividad,
    });
  }
}

const HORAS_ANTICIPACION_ACTIVIDAD_CUPO = 48;

// Actividad del responsable a menos de 48hs de empezar, con cupo sin
// completar — /13-notificaciones.md sección 3. "Sin completar" se interpreta
// como cupoMaximo definido y con lugares libres (si no tiene cupoMaximo, no
// aplica: no hay un "completo" que evaluar).
export async function generarAvisosCupoActividadesProximas() {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + HORAS_ANTICIPACION_ACTIVIDAD_CUPO * 60 * 60 * 1000);

  const actividades = await prisma.actividad.findMany({
    where: {
      estado: "planificada",
      cupoMaximo: { not: null },
      fechaInicio: { gte: ahora, lte: limite },
    },
    select: {
      id: true,
      nombre: true,
      cupoMaximo: true,
      responsableId: true,
      _count: { select: { participaciones: { where: { estado: { not: "cancelado" } } } } },
    },
  });

  for (const actividad of actividades) {
    const ocupados = actividad._count.participaciones;
    if (actividad.cupoMaximo === null || ocupados >= actividad.cupoMaximo) continue;

    await crearNotificacionInterno({
      usuarioId: actividad.responsableId,
      tipo: "accionable",
      titulo: "Actividad próxima con cupo libre",
      mensaje: `"${actividad.nombre}" empieza en menos de ${HORAS_ANTICIPACION_ACTIVIDAD_CUPO}hs con ${actividad.cupoMaximo - ocupados} lugar(es) libres.`,
      entidadRelacionada: "Actividad",
      entidadRelacionadaId: actividad.id,
      disparador: "actividad_proxima_cupo_libre",
      ventanaIdempotenciaDias: 2,
    });
  }
}
