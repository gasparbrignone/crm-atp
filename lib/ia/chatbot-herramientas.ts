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
} from "@/lib/servicios/punteo.service";

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

export const HERRAMIENTAS_CHATBOT: HerramientaChatbot[] = [
  {
    permisoRequerido: "personas.ver",
    declaracion: {
      name: "contar_personas",
      description:
        "Cuenta personas del CRM según filtros opcionales de carrera y año. Usar para preguntas tipo '¿cuántas personas de Enfermería de 3er año...?'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          carrera: { type: Type.STRING, description: "Nombre libre de la carrera, ej. 'Enfermería'." },
          anio: { type: Type.NUMBER, description: "Año de cursada, ej. 3." },
          incluirArchivadas: {
            type: Type.BOOLEAN,
            description: "Si es true, cuenta también fichas archivadas/fusionadas. Por defecto solo activas.",
          },
        },
      },
    },
    async ejecutar(_usuario, args) {
      const where: Record<string, unknown> = {};
      if (!args.incluirArchivadas) where.estadoFicha = "activa";
      if (typeof args.carrera === "string" && args.carrera.trim()) {
        const carreraId = await resolverCarreraSemantica(args.carrera);
        if (!carreraId) return { total: 0, aviso: `No se encontró la carrera "${args.carrera}" en el catálogo.` };
        where.carreraId = carreraId;
      }
      if (typeof args.anio === "number") where.anio = args.anio;

      const total = await prisma.persona.count({ where });
      return { total };
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
