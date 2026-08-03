import { Type, type FunctionDeclaration } from "@google/genai";
import { prisma } from "@/lib/prisma/client";
import type { UsuarioConPermisos } from "@/lib/permisos/permisos";
import { resolverCarreraSemantica } from "@/lib/ia/normalizacion";
import {
  obtenerDistribucionPorCarreraYAnio,
  obtenerRankingActividadesPorAsistencia,
  type RangoFecha,
} from "@/lib/servicios/dashboard.service";
import {
  listarMiPunteo,
  obtenerCoberturaPunteo,
  obtenerRankingMilitantesPunteo,
  obtenerDistribucionClasificacionPunteo,
  obtenerPunteoDePersona,
  obtenerTodosLosPunteosDePersona,
} from "@/lib/servicios/punteo.service";
import { listarPersonas } from "@/lib/servicios/personas.service";
import {
  buscarParticipacionesConFiltros,
  type AgrupacionParticipaciones,
} from "@/lib/servicios/participaciones.service";
import { obtenerHistorialDeEntidad } from "@/lib/servicios/auditoria.service";
import type { EstadoActividad, EstadoParticipacion } from "@prisma/client";

// Chatbot conectado a la base de datos — /15-ia.md sección 7. Arquitectura de
// texto a consulta CONTROLADA (tool-use), nunca SQL libre: cada herramienta
// de acá es una función de solo lectura acotada, y el modelo de IA solo
// decide cuál invocar y con qué parámetros — nunca construye una consulta
// arbitraria. Cada herramienta declara el permiso que exige; el chatbot
// (chatbot.ts) filtra en tiempo de ejecución las herramientas visibles según
// los permisos reales del usuario que pregunta, y además re-verifica el
// permiso al ejecutar (defensa en profundidad, no confiar solo en el filtro
// de qué se le ofreció al modelo).

export interface HerramientaChatbot {
  declaracion: FunctionDeclaration;
  permisoRequerido: string;
  ejecutar: (usuario: UsuarioConPermisos, args: Record<string, unknown>) => Promise<unknown>;
}

const RANGOS_VALIDOS: RangoFecha[] = ["semana", "mes", "cuatrimestre", "todo"];

function rangoDesdeArgs(args: Record<string, unknown>): RangoFecha {
  return RANGOS_VALIDOS.includes(args.rango as RangoFecha) ? (args.rango as RangoFecha) : "mes";
}

async function resolverTipoActividadId(nombre?: string): Promise<string | undefined> {
  if (!nombre) return undefined;
  const tipo = await prisma.tipoActividad.findFirst({
    where: { activo: true, nombre: { contains: nombre, mode: "insensitive" } },
  });
  return tipo?.id;
}

async function buscarPersonaPorNombre(nombreLibre: string) {
  const texto = nombreLibre.trim();
  if (!texto) return null;
  return prisma.persona.findFirst({
    where: {
      estadoFicha: { not: "fusionada" },
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { apellido: { contains: texto, mode: "insensitive" } },
        { dni: { contains: texto } },
      ],
    },
    select: { id: true, nombre: true, apellido: true },
  });
}

export const HERRAMIENTAS_CHATBOT: HerramientaChatbot[] = [
  {
    permisoRequerido: "personas.ver",
    declaracion: {
      name: "buscar_personas",
      description:
        "Busca y cuenta personas del CRM combinando filtros (carrera, año, estado de ficha, estado de padrón, etiqueta). Devuelve el total, una muestra de personas concretas (con sus etiquetas) y sus IDs. Usar para preguntas tipo '¿cuántas personas de Enfermería de 3er año...?' o para conseguir un grupo de personas sobre el que después preguntar otra cosa (ej. sus actividades) con `listar_participaciones`.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          carrera: { type: Type.STRING, description: "Nombre libre de la carrera, ej. 'Enfermería'." },
          anio: { type: Type.NUMBER, description: "Año de cursada, ej. 3." },
          etiqueta: { type: Type.STRING, description: "Nombre libre de una etiqueta asignada a la persona, opcional." },
          estadoFicha: {
            type: Type.STRING,
            description: "'activa' (por defecto), 'archivada' o 'fusionada'.",
          },
          estadoPadron: {
            type: Type.STRING,
            description:
              "Filtra por estado en el padrón activo (cualquiera de los dos tipos): 'en_padron_habilitado', 'no_encontrado_en_padron' o 'no_evaluado'. Requiere permiso de padrón; si no lo tenés, se ignora.",
          },
        },
      },
    },
    async ejecutar(usuario, args) {
      let carreraId: string | undefined;
      if (typeof args.carrera === "string" && args.carrera.trim()) {
        carreraId = await resolverCarreraSemantica(args.carrera);
        if (!carreraId) return { total: 0, aviso: `No se encontró la carrera "${args.carrera}" en el catálogo.` };
      }

      let etiquetaId: string | undefined;
      if (typeof args.etiqueta === "string" && args.etiqueta.trim()) {
        const etiqueta = await prisma.etiqueta.findFirst({
          where: { activo: true, nombre: { contains: args.etiqueta, mode: "insensitive" } },
        });
        if (!etiqueta) return { total: 0, aviso: `No se encontró la etiqueta "${args.etiqueta}" en el catálogo.` };
        etiquetaId = etiqueta.id;
      }

      const puedeVerPadron = usuario.rol.permisos.some((rp) => rp.permiso.codigo === "padron.ver");
      const estadoPadron =
        puedeVerPadron && typeof args.estadoPadron === "string" ? args.estadoPadron : undefined;

      const { personas, total } = await listarPersonas({
        carreraId,
        etiquetaId,
        anio: typeof args.anio === "number" ? String(args.anio) : undefined,
        estadoFicha: typeof args.estadoFicha === "string" ? args.estadoFicha : "activa",
        estadoPadronCD: estadoPadron,
        porPagina: 50,
      });

      return {
        total,
        muestra: personas.map((p) => ({
          id: p.id,
          nombre: `${p.apellido}, ${p.nombre}`,
          carrera: p.carrera?.nombre ?? null,
          anio: p.anio,
          etiquetas: p.etiquetas.map((pe) => pe.etiqueta.nombre),
        })),
        aviso: total > personas.length ? `Se muestran ${personas.length} de ${total} resultados.` : undefined,
      };
    },
  },
  {
    permisoRequerido: "actividades.ver",
    declaracion: {
      name: "listar_participaciones",
      description:
        "Herramienta general que cruza filtros de personas (carrera, año, estado de ficha) con filtros de actividades/participaciones (tipo de actividad, nombre, rango de fechas, estado de la actividad, estado de la participación). Es la herramienta correcta para preguntas que combinan ambos lados, como '¿a qué actividades fueron las personas de 2do año de Enfermería?', '¿cuántas personas de cada carrera asistieron a la Jornada X?' o '¿qué tipo de actividad tiene más participación entre los de 1er año?'. Con `agruparPor` devuelve conteos agregados; sin `agruparPor` devuelve un listado de filas concretas (persona + actividad).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          carrera: { type: Type.STRING, description: "Nombre libre de la carrera de la persona, opcional." },
          anio: { type: Type.NUMBER, description: "Año de cursada de la persona, opcional." },
          tipoActividad: { type: Type.STRING, description: "Nombre libre del tipo de actividad, opcional." },
          actividadNombre: { type: Type.STRING, description: "Nombre o parte del nombre de una actividad puntual, opcional." },
          estadoActividad: {
            type: Type.STRING,
            description: "'planificada', 'en_curso', 'finalizada' o 'cancelada', opcional.",
          },
          estadoParticipacion: {
            type: Type.STRING,
            description: "'inscripto', 'asistio' o 'cancelado', opcional.",
          },
          desde: { type: Type.STRING, description: "Fecha ISO (YYYY-MM-DD) desde la que buscar, opcional." },
          hasta: { type: Type.STRING, description: "Fecha ISO (YYYY-MM-DD) hasta la que buscar, opcional." },
          agruparPor: {
            type: Type.STRING,
            description:
              "Si se quiere un conteo agregado en vez de un listado de filas: 'actividad', 'tipoActividad', 'carrera', 'anio' o 'estadoParticipacion'.",
          },
          limite: {
            type: Type.NUMBER,
            description: "Cantidad máxima de filas a devolver en modo listado (no aplica agrupando). Por defecto 30.",
          },
        },
      },
    },
    async ejecutar(_usuario, args) {
      let carreraId: string | undefined;
      if (typeof args.carrera === "string" && args.carrera.trim()) {
        carreraId = await resolverCarreraSemantica(args.carrera);
        if (!carreraId) return { total: 0, aviso: `No se encontró la carrera "${args.carrera}" en el catálogo.` };
      }
      const tipoActividadId = await resolverTipoActividadId(args.tipoActividad as string | undefined);

      return buscarParticipacionesConFiltros(
        {
          carreraId,
          anio: typeof args.anio === "number" ? args.anio : undefined,
          tipoActividadId,
          actividadNombre: typeof args.actividadNombre === "string" ? args.actividadNombre : undefined,
          estadoActividad: args.estadoActividad as EstadoActividad | undefined,
          estadoParticipacion: args.estadoParticipacion as EstadoParticipacion | undefined,
          desde: typeof args.desde === "string" ? new Date(args.desde) : undefined,
          hasta: typeof args.hasta === "string" ? new Date(args.hasta) : undefined,
        },
        args.agruparPor as AgrupacionParticipaciones | undefined,
        typeof args.limite === "number" ? args.limite : undefined,
      );
    },
  },
  {
    permisoRequerido: "personas.ver",
    declaracion: {
      name: "distribucion_personas_por_carrera_y_anio",
      description: "Devuelve cuántas personas activas hay por carrera y año de cursada.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar() {
      return obtenerDistribucionPorCarreraYAnio();
    },
  },
  {
    permisoRequerido: "actividades.ver",
    declaracion: {
      name: "ranking_actividades_por_asistencia",
      description:
        "Lista las actividades finalizadas con mayor o menor tasa de asistencia en un período. Usar para preguntas tipo '¿qué actividades tuvieron menor asistencia este cuatrimestre?'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          rango: {
            type: Type.STRING,
            description: "Período: 'semana', 'mes', 'cuatrimestre' o 'todo'. Por defecto 'mes'.",
          },
          orden: {
            type: Type.STRING,
            description: "'mayor' para las de más asistencia, 'menor' para las de menos. Por defecto 'mayor'.",
          },
          tipoActividad: { type: Type.STRING, description: "Nombre libre del tipo de actividad, opcional." },
          limite: { type: Type.NUMBER, description: "Cantidad máxima de resultados. Por defecto 10." },
        },
      },
    },
    async ejecutar(_usuario, args) {
      const tipoActividadId = await resolverTipoActividadId(args.tipoActividad as string | undefined);
      const orden = args.orden === "menor" ? "menor" : "mayor";
      const limite = typeof args.limite === "number" ? Math.min(Math.max(args.limite, 1), 25) : 10;
      return obtenerRankingActividadesPorAsistencia(
        { rango: rangoDesdeArgs(args), tipoActividadId },
        orden,
        limite,
      );
    },
  },
  {
    permisoRequerido: "actividades.ver",
    declaracion: {
      name: "contar_participaciones_de_actividad",
      description:
        "Cuenta las participaciones (inscriptos/asistieron/cancelados) de una actividad puntual, buscada por nombre aproximado. Usar para preguntas sobre una actividad concreta ('el último simulacro', 'la charla de X').",
      parameters: {
        type: Type.OBJECT,
        properties: {
          nombreActividad: { type: Type.STRING, description: "Nombre o parte del nombre de la actividad." },
        },
        required: ["nombreActividad"],
      },
    },
    async ejecutar(_usuario, args) {
      const nombre = String(args.nombreActividad ?? "").trim();
      if (!nombre) return { error: "Falta el nombre de la actividad." };

      const actividad = await prisma.actividad.findFirst({
        where: { nombre: { contains: nombre, mode: "insensitive" } },
        orderBy: { fechaInicio: "desc" },
        select: {
          id: true,
          nombre: true,
          fechaInicio: true,
          estado: true,
          participaciones: { select: { estado: true } },
        },
      });
      if (!actividad) return { encontrada: false };

      const porEstado: Record<string, number> = {};
      for (const p of actividad.participaciones) porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;

      return {
        encontrada: true,
        actividad: { nombre: actividad.nombre, fechaInicio: actividad.fechaInicio, estado: actividad.estado },
        participacionesPorEstado: porEstado,
        total: actividad.participaciones.length,
      };
    },
  },
  {
    permisoRequerido: "punteo.ver_propio",
    declaracion: {
      name: "mi_resumen_de_punteo",
      description:
        "Devuelve un resumen de MI PROPIO punteo (cantidad de personas por estado de seguimiento). Nunca devuelve punteo de otro usuario.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar(usuario) {
      const miPunteo = await listarMiPunteo({ usuarioId: usuario.id, puedeVerTodos: false });
      const porEstado: Record<string, number> = {};
      for (const p of miPunteo) porEstado[p.estadoSeguimiento] = (porEstado[p.estadoSeguimiento] ?? 0) + 1;
      return { totalPersonasEnSeguimiento: miPunteo.length, porEstado };
    },
  },
  {
    permisoRequerido: "dashboard.ver_administrativo",
    declaracion: {
      name: "cobertura_de_punteo",
      description:
        "Porcentaje de personas habilitadas del padrón activo que tienen al menos un punteo cargado por algún usuario (agregado, no expone quién punteó a quién).",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar() {
      return obtenerCoberturaPunteo();
    },
  },
  {
    permisoRequerido: "dashboard.ver_administrativo",
    declaracion: {
      name: "distribucion_clasificacion_de_punteo",
      description:
        "Distribución agregada de cuántas personas están en cada categoría de clasificación de punteo, sumando a través de todos los usuarios. Nunca identifica qué usuario clasificó a quién.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar() {
      return obtenerDistribucionClasificacionPunteo();
    },
  },
  {
    // Expone volumen de punteo POR usuario (no el contenido de la
    // clasificación) — por eso exige punteo.ver_todos y no solo
    // dashboard.ver_administrativo, a diferencia de las dos herramientas
    // anteriores que son agregados puros sin identificar usuarios.
    permisoRequerido: "punteo.ver_todos",
    declaracion: {
      name: "ranking_militantes_por_punteo",
      description:
        "Ranking de militantes por cantidad de personas en seguimiento activo de punteo. Requiere permiso para ver el punteo de todos los usuarios.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar() {
      return obtenerRankingMilitantesPunteo();
    },
  },
  {
    // Devuelve el CONTENIDO real de los comentarios de punteo, no solo un
    // conteo — decisión explícita de Gaspar (2026-08-03, ver /16-seguridad.md
    // sección 6 y 9) que acepta enviar este dato sensible a la API de Gemini.
    // El permiso base es punteo.ver_propio (cualquiera puede ver sus propios
    // comentarios); ver los de otros usuarios sigue exigiendo
    // punteo.ver_todos y queda auditado igual que en la UI (verificado
    // adentro, no solo declarado acá).
    permisoRequerido: "punteo.ver_propio",
    declaracion: {
      name: "comentarios_de_punteo_de_persona",
      description:
        "Devuelve la clasificación, el estado de seguimiento y el CONTENIDO de los comentarios de punteo cargados sobre una persona puntual, buscada por nombre. Por defecto solo ve TU PROPIO punteo sobre esa persona; si tenés permiso para ver el punteo de todos los usuarios, devuelve también el de los demás.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          personaNombre: { type: Type.STRING, description: "Nombre, apellido o DNI de la persona." },
        },
        required: ["personaNombre"],
      },
    },
    async ejecutar(usuario, args) {
      const persona = await buscarPersonaPorNombre(String(args.personaNombre ?? ""));
      if (!persona) return { encontrada: false };

      const puedeVerTodos = usuario.rol.permisos.some((rp) => rp.permiso.codigo === "punteo.ver_todos");
      const ctx = { usuarioId: usuario.id, puedeVerTodos };

      if (puedeVerTodos) {
        const punteos = await obtenerTodosLosPunteosDePersona(ctx, persona.id);
        return {
          encontrada: true,
          persona: `${persona.apellido}, ${persona.nombre}`,
          punteos: punteos.map((p) => ({
            usuario: `${p.usuario.apellido}, ${p.usuario.nombre}`,
            clasificacion: p.clasificacion?.nombre ?? null,
            estadoSeguimiento: p.estadoSeguimiento,
            comentarios: p.comentarios.map((c) => ({ contenido: c.contenido, fecha: c.fechaCreacion })),
          })),
        };
      }

      const punteo = await obtenerPunteoDePersona(ctx, persona.id);
      return {
        encontrada: true,
        persona: `${persona.apellido}, ${persona.nombre}`,
        tienePunteoPropio: !!punteo,
        punteoPropio: punteo
          ? {
              clasificacion: punteo.clasificacion?.nombre ?? null,
              estadoSeguimiento: punteo.estadoSeguimiento,
              comentarios: punteo.comentarios.map((c) => ({ contenido: c.contenido, fecha: c.fechaCreacion })),
            }
          : null,
      };
    },
  },
  {
    permisoRequerido: "auditoria.ver",
    declaracion: {
      name: "historial_de_persona",
      description:
        "Devuelve el historial de cambios (alta, ediciones, fusión) registrado sobre una persona puntual, buscada por nombre. Requiere permiso de auditoría.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          personaNombre: { type: Type.STRING, description: "Nombre, apellido o DNI de la persona." },
        },
        required: ["personaNombre"],
      },
    },
    async ejecutar(_usuario, args) {
      const persona = await buscarPersonaPorNombre(String(args.personaNombre ?? ""));
      if (!persona) return { encontrada: false };

      const historial = await obtenerHistorialDeEntidad("Persona", persona.id);
      return {
        encontrada: true,
        persona: `${persona.apellido}, ${persona.nombre}`,
        historial: historial.map((h) => ({
          fecha: h.fecha,
          accion: h.accion,
          campo: h.campo,
          valorAnterior: h.valorAnterior,
          valorNuevo: h.valorNuevo,
          usuario: h.usuarioNombre,
        })),
      };
    },
  },
  {
    permisoRequerido: "padron.ver",
    declaracion: {
      name: "cobertura_de_padron",
      description:
        "Cuenta cuántas personas están habilitadas o no encontradas en el padrón activo (CD y CE), para preguntas sobre estado de padrón.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async ejecutar() {
      const [habilitadasCD, noEncontradasCD, habilitadasCE, noEncontradasCE] = await Promise.all([
        prisma.persona.count({ where: { estadoPadronCD: "en_padron_habilitado" } }),
        prisma.persona.count({ where: { estadoPadronCD: "no_encontrado_en_padron" } }),
        prisma.persona.count({ where: { estadoPadronCE: "en_padron_habilitado" } }),
        prisma.persona.count({ where: { estadoPadronCE: "no_encontrado_en_padron" } }),
      ]);
      return {
        consejoDirectivo: { habilitadas: habilitadasCD, noEncontradas: noEncontradasCD },
        centroEstudiantes: { habilitadas: habilitadasCE, noEncontradas: noEncontradasCE },
      };
    },
  },
];

export function herramientasVisiblesPara(usuario: UsuarioConPermisos): HerramientaChatbot[] {
  const codigos = new Set(usuario.rol.permisos.map((rp) => rp.permiso.codigo));
  return HERRAMIENTAS_CHATBOT.filter((h) => codigos.has(h.permisoRequerido));
}
