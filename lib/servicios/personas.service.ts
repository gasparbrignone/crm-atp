import { Prisma, type Persona } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { revincularPersonaNuevaConPadronesPendientes } from "@/lib/servicios/padron.service";
import {
  normalizarNombrePropio,
  normalizarTelefono,
  normalizarEmail,
} from "@/lib/ia/normalizacion";
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
  estadoPadronCD?: string;
  estadoPadronCE?: string;
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
  if (filtros.estadoPadronCD)
    where.estadoPadronCD = filtros.estadoPadronCD as Persona["estadoPadronCD"];
  if (filtros.estadoPadronCE)
    where.estadoPadronCE = filtros.estadoPadronCE as Persona["estadoPadronCE"];
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

// Usado tanto para mostrar la sugerencia de duplicado en el alta manual como
// para la comparación lado a lado del flujo de fusión (/05-modulo-personas.md
// secciones 3.2 y 8.2) — en ambos casos hace falta el detalle completo de
// más de una Persona a la vez.
export async function obtenerPersonasPorIds(ids: string[]) {
  return prisma.persona.findMany({
    where: { id: { in: ids } },
    include: { carrera: true, telefonos: true, emails: true },
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

  // Normalización defensiva (/15-ia.md sección 3): personaFormSchema ya
  // normaliza cuando el llamador viene del formulario/CSV, pero algunos
  // callers (ej. alta desde punteo) arman PersonaFormValues a mano sin pasar
  // por el schema — se repite acá para garantizar el mismo resultado sin
  // importar la vía de entrada. Idempotente, no rompe si ya venía normalizado.
  const nombre = normalizarNombrePropio(datos.nombre);
  const apellido = normalizarNombrePropio(datos.apellido);
  const telefono = datos.telefono ? normalizarTelefono(datos.telefono) : undefined;
  const email = datos.email ? normalizarEmail(datos.email) : undefined;

  const persona = await prisma.$transaction(async (tx) => {
    const creada = await tx.persona.create({
      data: {
        nombre,
        apellido,
        dni: datos.dni ?? null,
        legajo: datos.legajo ?? null,
        carreraId: datos.carreraId ?? null,
        anio: datos.anio ?? null,
        instagram: datos.instagram ?? null,
        observacionesGenerales: datos.observacionesGenerales ?? null,
        creadoPorId: usuarioId,
        modificadoPorId: usuarioId,
        // RN-3: el primer teléfono/email cargado es el principal por defecto.
        telefonos: telefono ? { create: [{ numero: telefono, esPrincipal: true }] } : undefined,
        emails: email ? { create: [{ email, esPrincipal: true }] } : undefined,
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

  if (persona.dni) {
    await revincularPersonaNuevaConPadronesPendientes(persona.id, persona.dni);
  }

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

export type CampoFusionable =
  | "nombre"
  | "apellido"
  | "dni"
  | "legajo"
  | "carreraId"
  | "anio"
  | "instagram"
  | "observacionesGenerales";

export interface FusionarPersonasInput {
  personaDefinitivaId: string;
  personaDescartadaId: string;
  camposElegidos: Partial<Record<CampoFusionable, "definitiva" | "descartada">>;
  usuarioId: string;
}

export class PersonaYaFusionadaError extends Error {
  constructor() {
    super("Una de las dos fichas ya fue fusionada anteriormente.");
    this.name = "PersonaYaFusionadaError";
  }
}

const CAMPOS_FUSIONABLES: CampoFusionable[] = [
  "nombre",
  "apellido",
  "dni",
  "legajo",
  "carreraId",
  "anio",
  "instagram",
  "observacionesGenerales",
];

// Fusión de duplicados — /05-modulo-personas.md sección 8.2 y RN-2
// (/04-modelo-datos.md sección 18). Nunca automática: siempre confirmada por
// un usuario campo por campo (deteccion-duplicados.ts solo sugiere, nunca
// fusiona solo — /15-ia.md sección 2.3). La ficha descartada pasa a
// `fusionada` (nunca se borra físicamente) y su Participacion/PunteoPersona/
// HistorialCambio se re-vincula a la definitiva. Cuando re-vincular una
// Participacion o un PunteoPersona chocaría con una fila que la definitiva ya
// tiene (misma Actividad, o mismo usuario de punteo), se aplica el mismo
// criterio que RN-4 para re-inscripciones: se conserva la fila de la
// definitiva y la de la descartada se descarta sin crear un duplicado — los
// comentarios de punteo igual se re-vinculan siempre, nunca se pierden.
export async function fusionarPersonas(input: FusionarPersonasInput) {
  const { personaDefinitivaId, personaDescartadaId, camposElegidos, usuarioId } = input;

  if (personaDefinitivaId === personaDescartadaId) {
    throw new Error("No se puede fusionar una ficha consigo misma.");
  }

  const [definitiva, descartada] = await Promise.all([
    prisma.persona.findUniqueOrThrow({
      where: { id: personaDefinitivaId },
      include: { telefonos: true, emails: true },
    }),
    prisma.persona.findUniqueOrThrow({
      where: { id: personaDescartadaId },
      include: { telefonos: true, emails: true },
    }),
  ]);

  if (definitiva.estadoFicha === "fusionada" || descartada.estadoFicha === "fusionada") {
    throw new PersonaYaFusionadaError();
  }

  const dataActualizacion: Prisma.PersonaUpdateInput = {};
  for (const campo of CAMPOS_FUSIONABLES) {
    if (camposElegidos[campo] !== "descartada") continue;
    const valor = descartada[campo];
    if (campo === "carreraId") {
      dataActualizacion.carrera = valor ? { connect: { id: valor as string } } : { disconnect: true };
    } else {
      // @ts-expect-error -- asignación dinámica validada por CAMPOS_FUSIONABLES
      dataActualizacion[campo] = valor;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(dataActualizacion).length > 0) {
      await tx.persona.update({ where: { id: personaDefinitivaId }, data: dataActualizacion });
    }

    // Contactos: se mueven todos a la definitiva. RN-3 exige un único
    // es_principal por tipo — si ambas fichas ya tenían uno marcado, se
    // conserva el de la definitiva y se desmarca el que llega de la fusión.
    const yaTieneTelefonoPrincipal = definitiva.telefonos.some((t) => t.esPrincipal);
    for (const telefono of descartada.telefonos) {
      await tx.personaTelefono.update({
        where: { id: telefono.id },
        data: {
          personaId: personaDefinitivaId,
          esPrincipal: telefono.esPrincipal && !yaTieneTelefonoPrincipal,
        },
      });
    }
    const yaTieneEmailPrincipal = definitiva.emails.some((e) => e.esPrincipal);
    for (const email of descartada.emails) {
      await tx.personaEmail.update({
        where: { id: email.id },
        data: {
          personaId: personaDefinitivaId,
          esPrincipal: email.esPrincipal && !yaTieneEmailPrincipal,
        },
      });
    }

    const participacionesDescartada = await tx.participacion.findMany({
      where: { personaId: personaDescartadaId },
    });
    for (const participacion of participacionesDescartada) {
      const colision = await tx.participacion.findUnique({
        where: {
          personaId_actividadId: {
            personaId: personaDefinitivaId,
            actividadId: participacion.actividadId,
          },
        },
      });
      if (colision) {
        await tx.participacion.delete({ where: { id: participacion.id } });
      } else {
        await tx.participacion.update({
          where: { id: participacion.id },
          data: { personaId: personaDefinitivaId },
        });
      }
    }

    const punteosDescartada = await tx.punteoPersona.findMany({
      where: { personaId: personaDescartadaId },
    });
    for (const punteo of punteosDescartada) {
      const colision = await tx.punteoPersona.findUnique({
        where: {
          usuarioId_personaId: { usuarioId: punteo.usuarioId, personaId: personaDefinitivaId },
        },
      });
      if (colision) {
        await tx.punteoComentario.updateMany({
          where: { punteoPersonaId: punteo.id },
          data: { punteoPersonaId: colision.id },
        });
        await tx.punteoPersona.delete({ where: { id: punteo.id } });
      } else {
        await tx.punteoPersona.update({
          where: { id: punteo.id },
          data: { personaId: personaDefinitivaId },
        });
      }
    }

    // Entradas de padrón ya vinculadas a la descartada se re-vinculan para no
    // dejarlas apuntando a una ficha fusionada.
    await tx.padronEntrada.updateMany({
      where: { personaId: personaDescartadaId },
      data: { personaId: personaDefinitivaId },
    });

    // Historial de la descartada se re-vincula a la definitiva para no
    // perder la traza (RN-2).
    await tx.historialCambio.updateMany({
      where: { entidad: "Persona", entidadId: personaDescartadaId },
      data: { entidadId: personaDefinitivaId },
    });

    await tx.persona.update({
      where: { id: personaDescartadaId },
      data: {
        estadoFicha: "fusionada",
        fusionadaEnId: personaDefinitivaId,
        modificadoPorId: usuarioId,
      },
    });
  });

  await registrarCambio({
    entidad: "Persona",
    entidadId: personaDefinitivaId,
    accion: "fusionar",
    usuarioId,
    metadata: { personaDescartadaId, camposElegidos },
  });

  return prisma.persona.findUniqueOrThrow({ where: { id: personaDefinitivaId } });
}
