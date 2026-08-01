import Papa from "papaparse";
import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { buscarPersonaParaEntradaPadron } from "@/lib/ia/matching-padron";
import { obtenerUmbralConfianzaDuplicados } from "@/lib/ia/deteccion-duplicados";
import type { CampoPadronImportable } from "@/lib/utils/csv-mapping-padron";

// Padrón electoral — /09-modulo-padron-electoral.md. Un único padrón `activo`
// a la vez (RN-8): activar uno nuevo cierra el anterior en la misma
// operación transaccional (sección 9).

export class PadronPendientesSinResolverError extends Error {
  constructor(public cantidad: number) {
    super(
      `El padrón tiene ${cantidad} entrada(s) pendiente(s) de revisión. Resolvelas antes de activarlo.`,
    );
    this.name = "PadronPendientesSinResolverError";
  }
}

export async function listarPadrones() {
  return prisma.padronElectoral.findMany({
    orderBy: { fechaCarga: "desc" },
    include: { _count: { select: { entradas: true } } },
  });
}

export async function obtenerPadron(id: string) {
  return prisma.padronElectoral.findUnique({ where: { id } });
}

export interface ResumenPadron {
  pendiente: number;
  vinculado_automatico: number;
  vinculado_manual: number;
  sin_coincidencia: number;
  total: number;
  puedeActivarse: boolean;
}

export async function obtenerResumenPadron(padronId: string): Promise<ResumenPadron> {
  const conteos = await prisma.padronEntrada.groupBy({
    by: ["estadoMatching"],
    where: { padronElectoralId: padronId },
    _count: true,
  });
  const resumen = {
    pendiente: 0,
    vinculado_automatico: 0,
    vinculado_manual: 0,
    sin_coincidencia: 0,
  };
  for (const c of conteos) resumen[c.estadoMatching] = c._count;
  return {
    ...resumen,
    total: Object.values(resumen).reduce((a, b) => a + b, 0),
    puedeActivarse: resumen.pendiente === 0,
  };
}

export async function listarEntradasPadron(padronId: string) {
  return prisma.padronEntrada.findMany({
    where: { padronElectoralId: padronId },
    include: { persona: { select: { id: true, nombre: true, apellido: true, dni: true } } },
    orderBy: [{ estadoMatching: "asc" }, { nombreCompletoOriginal: "asc" }],
  });
}

export async function crearPadronElectoral(
  nombre: string,
  fechaEleccion: string | undefined,
  usuarioId: string,
) {
  const padron = await prisma.padronElectoral.create({
    data: {
      nombre,
      fechaEleccion: fechaEleccion ? new Date(fechaEleccion) : null,
      cargadoPorId: usuarioId,
    },
  });
  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padron.id,
    accion: "crear",
    usuarioId,
  });
  return padron;
}

interface ImportarEntradasPadronInput {
  padronId: string;
  usuarioId: string;
  nombreArchivo: string;
  contenidoCsv: string;
  mapeo: Record<string, CampoPadronImportable | "">;
}

// Carga de un padrón vía CSV/Excel exportado — la lectura nativa de PDF
// (/15-ia.md sección 4) queda para la Fase 7 (importaciones avanzadas), ver
// /20-roadmap.md. El archivo original se conserva en Storage de forma
// indefinida mientras exista el PadronElectoral (sección 9).
export async function importarEntradasPadronCsv({
  padronId,
  usuarioId,
  nombreArchivo,
  contenidoCsv,
  mapeo,
}: ImportarEntradasPadronInput) {
  const { data: filas } = Papa.parse<Record<string, string>>(contenidoCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const rutaArchivo = `${usuarioId}/${Date.now()}-${nombreArchivo}`;
  const admin = createAdminClient();
  const { error: errorSubida } = await admin.storage
    .from("importaciones")
    .upload(rutaArchivo, contenidoCsv, { contentType: "text/csv" });

  const umbral = await obtenerUmbralConfianzaDuplicados();
  let procesadas = 0;
  let omitidas = 0;
  const filasOmitidas: { numeroFila: number; motivo: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2;

    const datos: Partial<Record<CampoPadronImportable, string>> = {};
    for (const [columna, campo] of Object.entries(mapeo)) {
      if (!campo) continue;
      const valor = fila[columna];
      if (valor) datos[campo] = valor.trim();
    }

    const nombreCompletoOriginal =
      datos.nombreCompleto ||
      [datos.apellido, datos.nombre].filter(Boolean).join(", ") ||
      undefined;

    if (!datos.dni || !nombreCompletoOriginal) {
      omitidas++;
      filasOmitidas.push({ numeroFila, motivo: "Falta DNI o nombre en la fila." });
      continue;
    }

    const resultadoMatching = await buscarPersonaParaEntradaPadron(
      { dni: datos.dni, nombreCompletoOriginal },
      umbral,
    );

    await prisma.padronEntrada.create({
      data: {
        padronElectoralId: padronId,
        dni: datos.dni,
        nombreCompletoOriginal,
        carreraTextoOriginal: datos.carrera ?? null,
        personaId: resultadoMatching.tipo === "vinculado_automatico" ? resultadoMatching.personaId : null,
        estadoMatching: resultadoMatching.tipo === "vinculado_automatico" ? "vinculado_automatico" : resultadoMatching.tipo,
        confianzaMatching:
          resultadoMatching.tipo === "vinculado_automatico" ? resultadoMatching.confianza : null,
        // Candidatos sugeridos por la IA para "pendiente" — se guardan para
        // poder mostrar la ficha candidata lado a lado en la revisión manual
        // (sección 6) sin tener que volver a llamar a la IA.
        candidatosSugeridos:
          resultadoMatching.tipo === "pendiente" ? JSON.stringify(resultadoMatching.candidatos) : null,
      },
    });
    procesadas++;
  }

  if (!errorSubida) {
    await prisma.padronElectoral.update({
      where: { id: padronId },
      data: { archivoOrigenId: rutaArchivo },
    });
  }

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "importar",
    usuarioId,
    metadata: { procesadas, omitidas, totalFilas: filas.length },
  });

  return { procesadas, omitidas, filasOmitidas, totalFilas: filas.length };
}

export async function vincularEntradaManualmente(
  entradaId: string,
  personaId: string,
  usuarioId: string,
) {
  const entrada = await prisma.padronEntrada.update({
    where: { id: entradaId },
    data: {
      personaId,
      estadoMatching: "vinculado_manual",
      confianzaMatching: null,
      candidatosSugeridos: null,
    },
  });
  await registrarCambio({
    entidad: "PadronEntrada",
    entidadId: entrada.id,
    accion: "editar",
    usuarioId,
    campo: "personaId",
    valorNuevo: personaId,
  });
  return entrada;
}

// Revisión manual: la entrada se marca como "revisada, sin vincular todavía"
// — RN sección 6: no puede quedar en el limbo de `pendiente`, pero tampoco
// hace falta vincularla a la fuerza si de verdad no corresponde a nadie.
export async function marcarEntradaSinCoincidencia(entradaId: string, usuarioId: string) {
  const entrada = await prisma.padronEntrada.update({
    where: { id: entradaId },
    data: {
      personaId: null,
      estadoMatching: "sin_coincidencia",
      confianzaMatching: null,
      candidatosSugeridos: null,
    },
  });
  await registrarCambio({
    entidad: "PadronEntrada",
    entidadId: entrada.id,
    accion: "editar",
    usuarioId,
    campo: "estadoMatching",
    valorNuevo: "sin_coincidencia",
  });
  return entrada;
}

export async function crearPersonaDesdeEntradaPadron(
  entradaId: string,
  datos: { nombre: string; apellido: string },
  usuarioId: string,
) {
  const entrada = await prisma.padronEntrada.findUniqueOrThrow({ where: { id: entradaId } });

  const persona = await prisma.persona.create({
    data: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: entrada.dni,
      creadoPorId: usuarioId,
      modificadoPorId: usuarioId,
    },
  });
  await registrarCambio({
    entidad: "Persona",
    entidadId: persona.id,
    accion: "crear",
    usuarioId,
    metadata: { origen: "alta_desde_padron", padronEntradaId: entradaId },
  });

  return vincularEntradaManualmente(entradaId, persona.id, usuarioId);
}

// Activar un padrón: cierra el anterior activo (si había) en la misma
// transacción (RN-8, sección 9), y recalcula Persona.estado_padron para todo
// el sistema según la prioridad de la sección 7. Registrado como evento
// automático (RN-6) asociado a esta activación puntual.
export async function activarPadron(padronId: string, usuarioId: string) {
  const resumen = await obtenerResumenPadron(padronId);
  if (resumen.pendiente > 0) throw new PadronPendientesSinResolverError(resumen.pendiente);

  await prisma.$transaction(async (tx) => {
    const anteriorActivo = await tx.padronElectoral.findFirst({ where: { estado: "activo" } });
    if (anteriorActivo) {
      await tx.padronElectoral.update({
        where: { id: anteriorActivo.id },
        data: { estado: "cerrado" },
      });
    }

    await tx.padronElectoral.update({ where: { id: padronId }, data: { estado: "activo" } });

    const personasVinculadas = await tx.padronEntrada.findMany({
      where: { padronElectoralId: padronId, personaId: { not: null } },
      select: { personaId: true },
    });
    const idsHabilitados = new Set(personasVinculadas.map((p) => p.personaId as string));

    await tx.persona.updateMany({
      where: { id: { in: [...idsHabilitados] } },
      data: { estadoPadron: "en_padron_habilitado" },
    });
    await tx.persona.updateMany({
      where: { id: { notIn: [...idsHabilitados] }, estadoFicha: { not: "fusionada" } },
      data: { estadoPadron: "no_encontrado_en_padron" },
    });
  });

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "otro",
    usuarioId: null,
    metadata: { proceso: "activacion_padron", activadoPorId: usuarioId },
  });

  return prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
}

// Cierre manual sin activar un reemplazo (ej. la elección ya ocurrió y todavía
// no se cargó el próximo padrón) — /09-modulo-padron-electoral.md sección 3:
// vuelve todo a `no_evaluado` por defecto, ya que la documentación deja
// explícitamente como decisión pendiente de la organización si en el futuro
// se prefiere conservar el último estado conocido en vez de resetear.
export async function cerrarPadron(padronId: string, usuarioId: string) {
  const padron = await prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
  if (padron.estado !== "activo") return padron;

  await prisma.$transaction(async (tx) => {
    await tx.padronElectoral.update({ where: { id: padronId }, data: { estado: "cerrado" } });
    await tx.persona.updateMany({
      where: { estadoPadron: { in: ["en_padron_habilitado", "no_encontrado_en_padron"] } },
      data: { estadoPadron: "no_evaluado" },
    });
  });

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "otro",
    usuarioId: null,
    metadata: { proceso: "cierre_padron", cerradoPorId: usuarioId },
  });

  return prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
}

export async function buscarPersonasParaVincular(query: string) {
  const texto = query.trim();
  if (texto.length < 2) return [];
  return prisma.persona.findMany({
    where: {
      estadoFicha: { not: "fusionada" },
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { apellido: { contains: texto, mode: "insensitive" } },
        { dni: { contains: texto } },
      ],
    },
    select: { id: true, nombre: true, apellido: true, dni: true },
    take: 10,
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
  });
}
