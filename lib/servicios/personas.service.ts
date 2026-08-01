import { Prisma, type Persona } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import type { PersonaFormValues } from "@/lib/validaciones/persona.validation";

export class DniDuplicadoError extends Error {
  constructor(public personaExistente: Persona) {
    super(
      `Ya existe una persona con ese DNI: ${personaExistente.nombre} ${personaExistente.apellido}.`,
    );
    this.name = "DniDuplicadoError";
  }
}

const PERSONA_PORPAGINA_DEFAULT = 50;
const PERSONA_PORPAGINA_OPCIONES = [25, 50, 100];

export interface FiltrosListadoPersonas {
  q?: string;
  carreraId?: string;
  anio?: string;
  estadoPadron?: string;
  estadoFicha?: string;
  pagina?: number;
  porPagina?: number;
}

// Listado paginado server-side — nunca se trae el listado completo al
// cliente. Ver /05-modulo-personas.md sección 6.3 y /03-arquitectura.md
// sección 11.
export async function listarPersonas(filtros: FiltrosListadoPersonas) {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const porPagina = PERSONA_PORPAGINA_OPCIONES.includes(filtros.porPagina ?? 0)
    ? (filtros.porPagina as number)
    : PERSONA_PORPAGINA_DEFAULT;

  const where: Prisma.PersonaWhereInput = {
    estadoFicha: (filtros.estadoFicha as Persona["estadoFicha"]) ?? "activa",
  };
  if (filtros.carreraId) where.carreraId = filtros.carreraId;
  if (filtros.anio) where.anio = Number(filtros.anio);
  if (filtros.estadoPadron) where.estadoPadron = filtros.estadoPadron as Persona["estadoPadron"];
  if (filtros.q) {
    const q = filtros.q.trim();
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { apellido: { contains: q, mode: "insensitive" } },
      { dni: { contains: q, mode: "insensitive" } },
      { legajo: { contains: q, mode: "insensitive" } },
    ];
  }

  const [personas, total] = await prisma.$transaction([
    prisma.persona.findMany({
      where,
      include: { carrera: true },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.persona.count({ where }),
  ]);

  return { personas, total, pagina, porPagina };
}

export async function obtenerPersona(id: string) {
  return prisma.persona.findUnique({
    where: { id },
    include: {
      carrera: true,
      telefonos: true,
      emails: true,
    },
  });
}

async function buscarPorDniActivoOArchivado(dni: string) {
  return prisma.persona.findFirst({
    where: { dni, estadoFicha: { not: "fusionada" } },
  });
}

// RN — /05-modulo-personas.md sección 9: el DNI, cuando se carga, debe ser
// único. Si ya existe, el alta se bloquea (no es una sugerencia probabilística
// como la detección de duplicados por IA de Fase 8: acá es una certeza).
export async function crearPersona(datos: PersonaFormValues, usuarioId: string) {
  if (datos.dni) {
    const existente = await buscarPorDniActivoOArchivado(datos.dni);
    if (existente) throw new DniDuplicadoError(existente);
  }

  const persona = await prisma.$transaction(async (tx) => {
    const creada = await tx.persona.create({
      data: {
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni ?? null,
        legajo: datos.legajo ?? null,
        carreraId: datos.carreraId ?? null,
        anio: datos.anio ?? null,
        instagram: datos.instagram ?? null,
        observacionesGenerales: datos.observacionesGenerales ?? null,
        creadoPorId: usuarioId,
        modificadoPorId: usuarioId,
        // RN-3: el primer teléfono/email cargado es el principal por defecto.
        telefonos: datos.telefono
          ? { create: [{ numero: datos.telefono, esPrincipal: true }] }
          : undefined,
        emails: datos.email ? { create: [{ email: datos.email, esPrincipal: true }] } : undefined,
      },
    });
    return creada;
  });

  await registrarCambio({
    entidad: "Persona",
    entidadId: persona.id,
    accion: "crear",
    usuarioId,
  });

  return persona;
}

const CAMPOS_EDITABLES = [
  "nombre",
  "apellido",
  "dni",
  "legajo",
  "carreraId",
  "anio",
  "instagram",
  "observacionesGenerales",
] as const;

// Edición inline por campo — ver /05-modulo-personas.md sección 5. Cada campo
// modificado genera su propia entrada en HistorialCambio con valor anterior/
// nuevo, para no perder granularidad en el historial.
export async function actualizarPersona(
  id: string,
  datos: Partial<PersonaFormValues>,
  usuarioId: string,
) {
  const actual = await prisma.persona.findUniqueOrThrow({ where: { id } });

  if (datos.dni && datos.dni !== actual.dni) {
    const existente = await buscarPorDniActivoOArchivado(datos.dni);
    if (existente && existente.id !== id) throw new DniDuplicadoError(existente);
  }

  const cambios: Record<string, { anterior: unknown; nuevo: unknown }> = {};
  const data: Prisma.PersonaUpdateInput = { modificadoPor: { connect: { id: usuarioId } } };

  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo in datos)) continue;
    const nuevo = datos[campo] ?? null;
    const anterior = actual[campo] ?? null;
    if (nuevo === anterior) continue;
    cambios[campo] = { anterior, nuevo };
    if (campo === "carreraId") {
      data.carrera = nuevo ? { connect: { id: nuevo as string } } : { disconnect: true };
    } else {
      // @ts-expect-error -- asignación dinámica validada por CAMPOS_EDITABLES
      data[campo] = nuevo;
    }
  }

  if (Object.keys(cambios).length === 0) return actual;

  const actualizada = await prisma.persona.update({ where: { id }, data });

  for (const [campo, { anterior, nuevo }] of Object.entries(cambios)) {
    await registrarCambio({
      entidad: "Persona",
      entidadId: id,
      accion: "editar",
      usuarioId,
      campo,
      valorAnterior: anterior == null ? null : String(anterior),
      valorNuevo: nuevo == null ? null : String(nuevo),
    });
  }

  return actualizada;
}

// Archivado/restauración — reversible, oculta la ficha de listados por
// defecto sin borrar datos. Ver /05-modulo-personas.md sección 8.1.
export async function archivarPersona(id: string, usuarioId: string) {
  const persona = await prisma.persona.update({
    where: { id },
    data: { estadoFicha: "archivada", modificadoPorId: usuarioId },
  });
  await registrarCambio({ entidad: "Persona", entidadId: id, accion: "archivar", usuarioId });
  return persona;
}

export async function restaurarPersona(id: string, usuarioId: string) {
  const persona = await prisma.persona.update({
    where: { id },
    data: { estadoFicha: "activa", modificadoPorId: usuarioId },
  });
  await registrarCambio({ entidad: "Persona", entidadId: id, accion: "restaurar", usuarioId });
  return persona;
}
