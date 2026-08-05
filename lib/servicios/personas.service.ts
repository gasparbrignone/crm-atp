import { Prisma, type Persona, type OrigenDato } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { revincularPersonaNuevaConPadronesPendientes } from "@/lib/servicios/padron.service";
import { crearValorCatalogo } from "@/lib/servicios/configuracion.service";
import {
  normalizarNombrePropio,
  normalizarTelefonoParaGuardar,
  normalizarEmail,
} from "@/lib/ia/normalizacion";
import {
  buscarPersonaCoincidente,
  obtenerUmbralConfianzaDuplicados,
  type CandidatoAmbiguo,
} from "@/lib/ia/deteccion-duplicados";
import { registrarVeredictoIdentidad } from "@/lib/servicios/veredictos-identidad.service";
import { obtenerCatalogoLexicoIdentidad } from "@/lib/servicios/lexico-identidad.service";
import type { CatalogoLexicoIdentidad } from "@/lib/identidad/normalizar";
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
  etiquetaId?: string;
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
  if (filtros.etiquetaId) where.etiquetas = { some: { etiquetaId: filtros.etiquetaId } };
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
      include: { carrera: true, etiquetas: { include: { etiqueta: true } } },
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
      etiquetas: { include: { etiqueta: true }, orderBy: { etiqueta: { nombre: "asc" } } },
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
export async function crearPersona(
  datos: PersonaFormValues,
  usuarioId: string,
  etiquetaIds: string[] = [],
  origen: OrigenDato = "alta_manual",
) {
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
  const telefono = datos.telefono ? normalizarTelefonoParaGuardar(datos.telefono) : undefined;
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
        telefonos: telefono
          ? { create: [{ numero: telefono, esPrincipal: true, origen }] }
          : undefined,
        emails: email ? { create: [{ email, esPrincipal: true, origen }] } : undefined,
        etiquetas: etiquetaIds.length
          ? {
              create: etiquetaIds.map((etiquetaId) => ({
                etiquetaId,
                asignadoPorId: usuarioId,
              })),
            }
          : undefined,
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

export type ResultadoResolucionPersona =
  | { tipo: "creada"; personaId: string }
  | { tipo: "vinculada"; personaId: string; confianza: number; motivo: string }
  | { tipo: "ambiguo"; motivo: string; candidatos: CandidatoAmbiguo[] };

// Punto de entrada único para "esta fila de datos, ¿es una Persona nueva o
// ya existe?" — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.4 (P2,
// severidad alta): antes de esto, la importación CSV genérica de Personas
// (importaciones.service.ts) solo comparaba DNI exacto, mientras el alta
// manual y la importación de inscriptos a Actividad ya usaban el Motor de
// Resolución de Identidad completo (nombre difuso) — inconsistencia real que
// podía dejar pasar duplicados silenciosos en esa única vía. Esta función no
// reemplaza a crearPersona() (que sigue siendo el único lugar que efectivamente
// inserta una fila y aplica RN-1/RN-3), la envuelve: primero pregunta al
// motor de identidad si ya existe alguien parecido, y solo crea si la
// respuesta es "sin candidatos". El llamador decide qué hacer con "vinculada"
// (reusar el id, ej. para inscribir a una actividad) o "ambiguo" (nunca
// crear ni vincular sola — encolar para revisión humana, mismo criterio que
// ya rige en el resto del sistema).
export async function resolverOCrearPersona(
  datos: PersonaFormValues,
  usuarioId: string,
  origen: OrigenDato,
  // Opcional para no repetir la misma consulta a ConfiguracionSistema en
  // cada fila de una importación masiva (auditoría 2026-08-04: llamado sin
  // esto desde un loop de N filas hacía N SELECT idénticos e innecesarios,
  // ver INFORME-CIERRE-SESION-2026-08-04.md). Un caller de una sola vez
  // (alta manual) puede omitirlo sin pensar en esto.
  umbralPrecalculado?: number,
  // Mismo motivo que `umbralPrecalculado` — ver ese comentario. Un caller de
  // N filas (importaciones.service.ts) debe cargar el catálogo léxico una
  // sola vez con obtenerCatalogoLexicoIdentidad() y pasarlo acá, no
  // re-consultar LexicoNombrePropio en cada fila.
  catalogoLexicoPrecalculado?: CatalogoLexicoIdentidad,
): Promise<ResultadoResolucionPersona> {
  const umbral = umbralPrecalculado ?? (await obtenerUmbralConfianzaDuplicados());
  const catalogoLexico = catalogoLexicoPrecalculado ?? (await obtenerCatalogoLexicoIdentidad());
  const resultado = await buscarPersonaCoincidente(
    {
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono || undefined,
      email: datos.email || undefined,
      dni: datos.dni || undefined,
    },
    umbral,
    catalogoLexico,
  );

  if (resultado.tipo === "coincidencia") {
    return {
      tipo: "vinculada",
      personaId: resultado.personaId,
      confianza: resultado.confianza,
      motivo: resultado.motivo,
    };
  }

  if (resultado.tipo === "ambiguo") {
    return { tipo: "ambiguo", motivo: resultado.motivo, candidatos: resultado.candidatos };
  }

  const persona = await crearPersona(datos, usuarioId, [], origen);
  return { tipo: "creada", personaId: persona.id };
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

    // Etiquetas: mismo criterio que Participacion/PunteoPersona (RN-2) —
    // hallazgo de la auditoría 2026-08-04 (INFORME-CIERRE-SESION-2026-08-04.md):
    // esta re-vinculación faltaba desde antes de esta sesión, pero recién
    // ahora que existe una UI real de etiquetado (05-modulo-personas.md
    // sección 7) el gap era alcanzable de verdad — sin esto, las etiquetas de
    // la ficha descartada quedaban huérfanas tras la fusión. Único por
    // [personaId, etiquetaId]: si la definitiva ya tenía la misma etiqueta,
    // se descarta el duplicado en vez de re-vincular.
    const etiquetasDescartada = await tx.personaEtiqueta.findMany({
      where: { personaId: personaDescartadaId },
    });
    const etiquetasYaEnDefinitiva = new Set(
      (
        await tx.personaEtiqueta.findMany({
          where: { personaId: personaDefinitivaId },
          select: { etiquetaId: true },
        })
      ).map((e) => e.etiquetaId),
    );
    for (const asignacion of etiquetasDescartada) {
      if (etiquetasYaEnDefinitiva.has(asignacion.etiquetaId)) {
        await tx.personaEtiqueta.delete({ where: { id: asignacion.id } });
      } else {
        await tx.personaEtiqueta.update({
          where: { id: asignacion.id },
          data: { personaId: personaDefinitivaId },
        });
      }
    }

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

  // Veredicto humano — /PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección
  // 3.9: toda fusión confirmada, sin importar desde qué pantalla se inició
  // (sugerencia del alta manual o detección manual del usuario, ver
  // /05-modulo-personas.md sección 8.2), es una confirmación real de "misma
  // persona" con valor para recalibración futura. No bloquea la fusión si
  // falla — es un registro adicional, no una condición de la operación.
  try {
    await registrarVeredictoIdentidad({
      nombreObjetivo: `${definitiva.nombre} ${definitiva.apellido}`,
      candidatoNombreCompleto: `${descartada.nombre} ${descartada.apellido}`,
      candidatoId: descartada.id,
      decision: "misma_persona",
      contexto: "fusion_manual",
      usuarioId,
    });
  } catch {
    // No interrumpe la fusión ya confirmada.
  }

  return prisma.persona.findUniqueOrThrow({ where: { id: personaDefinitivaId } });
}

// ─────────────────────────────────────────────────────────────────────────
// Etiquetado — /05-modulo-personas.md sección 7. Las etiquetas son
// compartidas por toda la organización (no privadas por usuario, a
// diferencia de ClasificacionPunteo — ver la distinción en
// /08-modulo-punteo-electoral.md sección 1). Cualquiera con `personas.editar`
// puede asignar/quitar, sin permiso adicional.
// ─────────────────────────────────────────────────────────────────────────

// Selector de etiquetas del alta/ficha (/05-modulo-personas.md sección 7):
// "crear una etiqueta nueva desde el selector requiere el mismo permiso
// [personas.editar], no un permiso adicional" — por eso esta función vive acá
// y no detrás de configuracion.gestionar como el resto de la gestión del
// catálogo. Busca sin distinguir mayúsculas para no crear "Militante" y
// "militante" como dos etiquetas distintas por un error de tipeo, y reactiva
// una etiqueta que existía pero estaba desactivada en vez de duplicarla.
export async function obtenerOCrearEtiquetaPorNombre(nombre: string, usuarioId: string) {
  const limpio = nombre.trim();
  if (!limpio) return null;

  const existente = await prisma.etiqueta.findFirst({
    where: { nombre: { equals: limpio, mode: "insensitive" } },
  });
  if (existente) {
    if (!existente.activo) {
      await prisma.etiqueta.update({ where: { id: existente.id }, data: { activo: true } });
    }
    return existente;
  }

  return crearValorCatalogo("etiqueta", { nombre: limpio }, usuarioId);
}

// Idempotente: asignar una etiqueta ya asignada no genera un duplicado ni un
// error (unique [personaId, etiquetaId] en el modelo), simplemente no hace
// nada nuevo — evita que un doble click o una carrera de UI rompa el flujo.
export async function agregarEtiquetaAPersona(
  personaId: string,
  etiquetaId: string,
  usuarioId: string,
) {
  const yaAsignada = await prisma.personaEtiqueta.findUnique({
    where: { personaId_etiquetaId: { personaId, etiquetaId } },
  });
  if (yaAsignada) return yaAsignada;

  const asignacion = await prisma.personaEtiqueta.create({
    data: { personaId, etiquetaId, asignadoPorId: usuarioId },
  });

  const etiqueta = await prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } });
  await registrarCambio({
    entidad: "Persona",
    entidadId: personaId,
    accion: "editar",
    usuarioId,
    campo: "etiquetas",
    valorNuevo: etiqueta.nombre,
    metadata: { proceso: "asignar_etiqueta", etiquetaId },
  });

  return asignacion;
}

export async function quitarEtiquetaDePersona(
  personaId: string,
  etiquetaId: string,
  usuarioId: string,
) {
  const asignacion = await prisma.personaEtiqueta.findUnique({
    where: { personaId_etiquetaId: { personaId, etiquetaId } },
  });
  if (!asignacion) return;

  const etiqueta = await prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } });
  await prisma.personaEtiqueta.delete({ where: { id: asignacion.id } });
  await registrarCambio({
    entidad: "Persona",
    entidadId: personaId,
    accion: "editar",
    usuarioId,
    campo: "etiquetas",
    valorAnterior: etiqueta.nombre,
    metadata: { proceso: "quitar_etiqueta", etiquetaId },
  });
}

// Acción masiva del listado (/05-modulo-personas.md sección 6.4): asignar la
// misma etiqueta a una selección de Personas. No delega en
// agregarEtiquetaAPersona() persona por persona como en la primera versión
// (auditoría 2026-08-04, ver INFORME-CIERRE-SESION-2026-08-04.md): esa
// versión repetía, una vez por Persona seleccionada, la misma consulta de
// `Etiqueta` (constante durante toda la operación) y el mismo chequeo de
// idempotencia dos veces (uno acá, otro adentro de agregarEtiquetaAPersona).
// Con una selección de cientos de Personas eso son cientos de consultas
// redundantes. Acá: la Etiqueta se busca una sola vez, la idempotencia se
// resuelve con un único `findMany` + `createMany({ skipDuplicates: true })`
// — mismo resultado observable (idempotente, un HistorialCambio por Persona
// recién asignada), muchas menos consultas.
export async function asignarEtiquetaMasivo(
  personaIds: string[],
  etiquetaId: string,
  usuarioId: string,
) {
  const idsUnicos = Array.from(new Set(personaIds));
  const etiqueta = await prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } });

  const yaAsignadas = await prisma.personaEtiqueta.findMany({
    where: { etiquetaId, personaId: { in: idsUnicos } },
    select: { personaId: true },
  });
  const idsConEtiqueta = new Set(yaAsignadas.map((a) => a.personaId));
  const idsParaAsignar = idsUnicos.filter((id) => !idsConEtiqueta.has(id));

  if (idsParaAsignar.length > 0) {
    await prisma.personaEtiqueta.createMany({
      data: idsParaAsignar.map((personaId) => ({ personaId, etiquetaId, asignadoPorId: usuarioId })),
      skipDuplicates: true,
    });
    for (const personaId of idsParaAsignar) {
      await registrarCambio({
        entidad: "Persona",
        entidadId: personaId,
        accion: "editar",
        usuarioId,
        campo: "etiquetas",
        valorNuevo: etiqueta.nombre,
        metadata: { proceso: "asignar_etiqueta", etiquetaId },
      });
    }
  }

  return { total: idsUnicos.length, asignadas: idsParaAsignar.length };
}
