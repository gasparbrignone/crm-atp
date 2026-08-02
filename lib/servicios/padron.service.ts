import Papa from "papaparse";
import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { buscarPersonaParaEntradaPadron } from "@/lib/ia/matching-padron";
import { obtenerUmbralConfianzaDuplicados } from "@/lib/ia/deteccion-duplicados";
import { leerEntradasPadronPdf } from "@/lib/ia/lectura-padron-pdf";
import type { CampoPadronImportable } from "@/lib/utils/csv-mapping-padron";
import type { TipoPadronElectoral } from "@prisma/client";

// Padrón electoral — /09-modulo-padron-electoral.md. ATP maneja dos padrones
// oficiales distintos y activos en simultáneo durante una elección: Consejo
// Directivo (CD, más restrictivo) y Centro de Estudiantes (CE, más amplio,
// CD ⊂ CE). RN-8 ("un único activo a la vez") aplica por `tipo`, no
// globalmente: activar un padrón nuevo cierra el anterior activo del mismo
// tipo, sin tocar el padrón activo del otro tipo. Decisión con Gaspar,
// 2026-08-01 — ver CLAUDE.md.

const CAMPO_ESTADO_PADRON_POR_TIPO = {
  consejo_directivo: "estadoPadronCD",
  centro_estudiantes: "estadoPadronCE",
} as const;

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
  tipo: TipoPadronElectoral,
  fechaEleccion: string | undefined,
  usuarioId: string,
) {
  const padron = await prisma.padronElectoral.create({
    data: {
      nombre,
      tipo,
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

const UMBRAL_CONFIANZA_EXTRACCION = 0.75;

interface DatosEntradaPadron {
  dni: string;
  nombreCompletoOriginal: string;
  carreraTextoOriginal?: string | null;
  // Solo presente en lecturas de PDF (/15-ia.md sección 4) — qué tan segura
  // está la IA de haber leído bien la fila, distinto de la confianza de
  // matching. Ausente para CSV, donde el dato ya viene como texto exacto.
  confianzaExtraccion?: number;
}

// Resuelve el estado de matching de una entrada nueva, combinando el
// resultado de buscarPersonaParaEntradaPadron() con la confianza de
// extracción cuando corresponde (PDF): una lectura insegura del documento
// nunca se vincula sola, aunque el nombre matchee perfecto — hay que mirar
// el original antes de confiar en el dato (/15-ia.md sección 4.2).
async function resolverDatosMatchingEntrada(datos: DatosEntradaPadron, umbralMatching: number) {
  const resultadoMatching = await buscarPersonaParaEntradaPadron(
    { dni: datos.dni, nombreCompletoOriginal: datos.nombreCompletoOriginal },
    umbralMatching,
  );

  const extraccionDudosa =
    datos.confianzaExtraccion !== undefined && datos.confianzaExtraccion < UMBRAL_CONFIANZA_EXTRACCION;

  if (extraccionDudosa) {
    let candidatos: { id: string; nombre: string; apellido: string; dni: string | null }[] = [];
    if (resultadoMatching.tipo === "vinculado_automatico") {
      const persona = await prisma.persona.findUnique({
        where: { id: resultadoMatching.personaId },
        select: { id: true, nombre: true, apellido: true, dni: true },
      });
      if (persona) candidatos = [persona];
    } else if (resultadoMatching.tipo === "pendiente") {
      candidatos = resultadoMatching.candidatos;
    }
    const motivo = `Lectura insegura del documento (confianza de extracción: ${Math.round(
      (datos.confianzaExtraccion ?? 0) * 100,
    )}%). Revisá el dato contra el PDF original antes de confirmar.`;
    return {
      estadoMatching: "pendiente" as const,
      personaId: null,
      confianzaMatching: null,
      candidatosSugeridos: JSON.stringify({ motivo, candidatos }),
    };
  }

  if (resultadoMatching.tipo === "vinculado_automatico") {
    return {
      estadoMatching: "vinculado_automatico" as const,
      personaId: resultadoMatching.personaId,
      confianzaMatching: resultadoMatching.confianza,
      candidatosSugeridos: null,
    };
  }
  if (resultadoMatching.tipo === "sin_coincidencia") {
    return {
      estadoMatching: "sin_coincidencia" as const,
      personaId: null,
      confianzaMatching: null,
      candidatosSugeridos: null,
    };
  }
  return {
    estadoMatching: "pendiente" as const,
    personaId: null,
    confianzaMatching: null,
    candidatosSugeridos: JSON.stringify({
      motivo: resultadoMatching.motivo,
      candidatos: resultadoMatching.candidatos,
    }),
  };
}

interface ImportarEntradasPadronInput {
  padronId: string;
  usuarioId: string;
  nombreArchivo: string;
  contenidoCsv: string;
  mapeo: Record<string, CampoPadronImportable | "">;
}

// Carga de un padrón vía CSV/Excel exportado.
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

    const datosMatching = await resolverDatosMatchingEntrada(
      { dni: datos.dni, nombreCompletoOriginal, carreraTextoOriginal: datos.carrera },
      umbral,
    );

    await prisma.padronEntrada.create({
      data: {
        padronElectoralId: padronId,
        dni: datos.dni,
        nombreCompletoOriginal,
        carreraTextoOriginal: datos.carrera ?? null,
        ...datosMatching,
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

interface ImportarEntradasPadronPdfInput {
  padronId: string;
  usuarioId: string;
  nombreArchivo: string;
  pdfBase64: string;
}

// Carga de un padrón directamente desde el PDF oficial —
// /09-modulo-padron-electoral.md sección 4 y /15-ia.md sección 4: caso
// principal de este módulo, dado que los padrones universitarios rara vez
// llegan como planilla. Cada fila extraída con confianza de lectura baja
// queda `pendiente` para revisión visual, nunca se incorpora silenciosamente
// con un posible error de lectura (/15-ia.md sección 4.2).
export async function importarEntradasPadronPdf({
  padronId,
  usuarioId,
  nombreArchivo,
  pdfBase64,
}: ImportarEntradasPadronPdfInput) {
  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  const rutaArchivo = `${usuarioId}/${Date.now()}-${nombreArchivo}`;
  const admin = createAdminClient();
  const { error: errorSubida } = await admin.storage
    .from("importaciones")
    .upload(rutaArchivo, pdfBuffer, { contentType: "application/pdf" });

  const entradasExtraidas = await leerEntradasPadronPdf(pdfBuffer);

  const umbral = await obtenerUmbralConfianzaDuplicados();
  let procesadas = 0;
  let omitidas = 0;
  const filasOmitidas: { numeroFila: number; motivo: string }[] = [];

  for (let i = 0; i < entradasExtraidas.length; i++) {
    const entrada = entradasExtraidas[i];
    const numeroFila = i + 1;

    if (!entrada.dni || !entrada.nombreCompleto) {
      omitidas++;
      filasOmitidas.push({
        numeroFila,
        motivo: "La IA no pudo leer DNI o nombre en esta fila del documento.",
      });
      continue;
    }

    const datosMatching = await resolverDatosMatchingEntrada(
      {
        dni: entrada.dni,
        nombreCompletoOriginal: entrada.nombreCompleto,
        carreraTextoOriginal: entrada.carrera,
        confianzaExtraccion: entrada.confianzaExtraccion,
      },
      umbral,
    );

    await prisma.padronEntrada.create({
      data: {
        padronElectoralId: padronId,
        dni: entrada.dni,
        nombreCompletoOriginal: entrada.nombreCompleto,
        carreraTextoOriginal: entrada.carrera,
        ...datosMatching,
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
    metadata: { procesadas, omitidas, totalFilas: entradasExtraidas.length, origen: "pdf" },
  });

  return { procesadas, omitidas, filasOmitidas, totalFilas: entradasExtraidas.length };
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

// Activar un padrón: cierra el anterior activo del mismo `tipo` (si había) en
// la misma transacción (RN-8 por tipo, sección 9), y recalcula el estado de
// padrón de ese tipo (estadoPadronCD o estadoPadronCE) para todo el sistema
// según la prioridad de la sección 7. No toca el estado del otro tipo de
// padrón. Registrado como evento automático (RN-6) asociado a esta
// activación puntual.
export async function activarPadron(padronId: string, usuarioId: string) {
  const resumen = await obtenerResumenPadron(padronId);
  if (resumen.pendiente > 0) throw new PadronPendientesSinResolverError(resumen.pendiente);

  const padronAActivar = await prisma.padronElectoral.findUniqueOrThrow({
    where: { id: padronId },
  });
  const campoEstado = CAMPO_ESTADO_PADRON_POR_TIPO[padronAActivar.tipo];

  await prisma.$transaction(async (tx) => {
    const anteriorActivo = await tx.padronElectoral.findFirst({
      where: { estado: "activo", tipo: padronAActivar.tipo },
    });
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
      data: { [campoEstado]: "en_padron_habilitado" },
    });
    await tx.persona.updateMany({
      where: { id: { notIn: [...idsHabilitados] }, estadoFicha: { not: "fusionada" } },
      data: { [campoEstado]: "no_encontrado_en_padron" },
    });
  });

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "otro",
    usuarioId: null,
    metadata: { proceso: "activacion_padron", tipo: padronAActivar.tipo, activadoPorId: usuarioId },
  });

  return prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
}

// Cierre manual sin activar un reemplazo (ej. la elección ya ocurrió y todavía
// no se cargó el próximo padrón del mismo tipo) —
// /09-modulo-padron-electoral.md sección 3: vuelve a `no_evaluado` el campo
// de estado del tipo correspondiente (CD o CE), sin tocar el del otro tipo,
// ya que la documentación deja explícitamente como decisión pendiente de la
// organización si en el futuro se prefiere conservar el último estado
// conocido en vez de resetear.
export async function cerrarPadron(padronId: string, usuarioId: string) {
  const padron = await prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
  if (padron.estado !== "activo") return padron;

  const campoEstado = CAMPO_ESTADO_PADRON_POR_TIPO[padron.tipo];

  await prisma.$transaction(async (tx) => {
    await tx.padronElectoral.update({ where: { id: padronId }, data: { estado: "cerrado" } });
    await tx.persona.updateMany({
      where: { [campoEstado]: { in: ["en_padron_habilitado", "no_encontrado_en_padron"] } },
      data: { [campoEstado]: "no_evaluado" },
    });
  });

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "otro",
    usuarioId: null,
    metadata: { proceso: "cierre_padron", tipo: padron.tipo, cerradoPorId: usuarioId },
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
