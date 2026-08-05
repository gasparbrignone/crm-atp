import Papa from "papaparse";
import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { buscarPersonaParaEntradaPadron } from "@/lib/ia/matching-padron";
import { obtenerUmbralConfianzaDuplicados } from "@/lib/ia/deteccion-duplicados";
import { prepararLotesPadronPdf, parsearLotePadron } from "@/lib/padron/lectura-padron";
import { registrarVeredictoIdentidad } from "@/lib/servicios/veredictos-identidad.service";
import { obtenerCatalogoLexicoIdentidad } from "@/lib/servicios/lexico-identidad.service";
import type { CatalogoLexicoIdentidad } from "@/lib/identidad/normalizar";
import {
  notificarImportacionFinalizada,
  notificarPadronActivado,
  notificarPendientesRevisionPadron,
} from "@/lib/servicios/notificaciones.service";
import type { CampoPadronImportable } from "@/lib/utils/csv-mapping-padron";
import type { Prisma, TipoPadronElectoral } from "@prisma/client";

// Tope duro de tiempo para un lote de padrón — bug real 2026-08-02: dos
// lotes seguidos murieron con "Task timed out after 300 seconds" (el límite
// real de duración de función en el plan gratuito de Vercel) sin llegar a
// devolver un error entendible. Se corta acá bastante antes de esa pared,
// con un mensaje claro, para que el cliente reintente con una invocación
// nueva (con su propio presupuesto de tiempo) en vez de perder el intento
// entero en un timeout duro. **Corrección 2026-08-04**: el mensaje original
// atribuía la lentitud a "contención en la cuota gratuita de la IA" — ya no
// aplica, todo el pipeline de padrón (extracción de texto, estructuración en
// filas, matching contra Personas) es determinístico desde esta fecha, sin
// ninguna llamada a IA (ver lib/padron/lectura-padron.ts). Lo que puede
// seguir siendo lento con un padrón grande son los round-trips a la base
// para el matching de cada fila, no una cuota externa.
export class TiempoLoteAgotadoError extends Error {
  constructor() {
    super(
      "Este lote está tardando demasiado. No se perdió nada de lo ya procesado — reintentá.",
    );
    this.name = "TiempoLoteAgotadoError";
  }
}

function conLimiteDeTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, reject) => setTimeout(() => reject(new TiempoLoteAgotadoError()), ms)),
  ]);
}

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

// Bug real detectado 2026-08-02: un padrón cuya lectura de PDF falló
// silenciosamente (0 entradas extraídas) se pudo activar igual, porque
// "pendientes === 0" también es cierto cuando no hay absolutamente ninguna
// entrada. Eso marcó a toda la base como "no encontrado en padrón". Un
// padrón con 0 entradas nunca es un estado válido para activar.
export class PadronVacioError extends Error {
  constructor() {
    super("Este padrón no tiene ninguna entrada cargada. No se puede activar así.");
    this.name = "PadronVacioError";
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
  // está la extracción de haber leído bien la fila (siempre 1 desde el
  // parser determinístico de 2026-08-04, ver lib/padron/lectura-padron.ts),
  // distinto de la confianza de matching. Ausente para CSV, donde el dato ya
  // viene como texto exacto.
  confianzaExtraccion?: number;
}

// Resuelve el estado de matching de una entrada nueva, combinando el
// resultado de buscarPersonaParaEntradaPadron() con la confianza de
// extracción cuando corresponde (PDF): una lectura insegura del documento
// nunca se vincula sola, aunque el nombre matchee perfecto — hay que mirar
// el original antes de confiar en el dato (/15-ia.md sección 4.2).
async function resolverDatosMatchingEntrada(
  datos: DatosEntradaPadron,
  umbralMatching: number,
  catalogoLexico: CatalogoLexicoIdentidad,
) {
  const resultadoMatching = await buscarPersonaParaEntradaPadron(
    { dni: datos.dni, nombreCompletoOriginal: datos.nombreCompletoOriginal },
    umbralMatching,
    catalogoLexico,
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

// Resolver matching y crear las PadronEntrada fila por fila en serie no
// escala con el volumen real de un padrón universitario (miles de filas): a
// razón de 1-2 round-trips a la base por fila, eso solo ya puede superar el
// límite de 300s de la función serverless de Vercel (timeout real observado
// en producción, 2026-08-01, con el padrón de Medicina). Se resuelve el
// matching de todas las filas en paralelo (con límite de concurrencia) y se
// inserta todo con un único `createMany` al final en vez de un `create` por
// fila. **Corrección 2026-08-04**: el comentario original decía que "las
// filas que sí llaman a la IA ya respetan el límite de cuota" — desde esta
// fecha `buscarPersonaParaEntradaPadron()` (lib/ia/matching-padron.ts) es
// 100% determinístico, sin ninguna llamada a IA (ver
// PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md) — la única razón real para
// acotar esta concurrencia hoy es no saturar el pool de conexiones a
// Postgres, no una cuota externa.
const CONCURRENCIA_MATCHING = 10;

interface FilaPadronParaProcesar {
  numeroFila: number;
  dni?: string;
  nombreCompletoOriginal?: string;
  carreraTextoOriginal?: string | null;
  confianzaExtraccion?: number;
}

async function procesarFilasPadronEnParalelo(
  padronId: string,
  filas: FilaPadronParaProcesar[],
  umbral: number,
  motivoOmision = "Falta DNI o nombre en la fila.",
) {
  const filasOmitidas: { numeroFila: number; motivo: string }[] = [];
  const paraCrear: Prisma.PadronEntradaCreateManyInput[] = [];
  let siguienteIndice = 0;
  // Una sola consulta para todo el lote, no una por fila — mismo criterio
  // que ya rige para `umbral` acá abajo (ver PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
  // sección 6): el catálogo léxico no cambia en medio de una carga de padrón.
  const catalogoLexico = await obtenerCatalogoLexicoIdentidad();

  async function trabajador() {
    while (siguienteIndice < filas.length) {
      const indice = siguienteIndice++;
      const fila = filas[indice];

      if (!fila.dni || !fila.nombreCompletoOriginal) {
        filasOmitidas.push({
          numeroFila: fila.numeroFila,
          motivo: motivoOmision,
        });
        continue;
      }

      // Bug real encontrado en auditoría (2026-08-03): esto no tenía
      // try/catch. Con 10 workers en paralelo (CONCURRENCIA_MATCHING), un
      // solo error de matching (ej. la cuota diaria de Gemini agotada a
      // mitad de lote) rechazaba el Promise.all entero — descartando los
      // matches YA resueltos de las demás filas de este lote (nunca llegaban
      // al createMany) sin avanzar lotesProcesados. El reintento del cliente
      // volvía a gastar cuota re-resolviendo filas que ya se habían resuelto
      // bien la vez anterior. Ahora una fila que falla queda omitida con el
      // motivo del error, sin tirar abajo el resto del lote.
      try {
        const datosMatching = await resolverDatosMatchingEntrada(
          {
            dni: fila.dni,
            nombreCompletoOriginal: fila.nombreCompletoOriginal,
            carreraTextoOriginal: fila.carreraTextoOriginal,
            confianzaExtraccion: fila.confianzaExtraccion,
          },
          umbral,
          catalogoLexico,
        );

        paraCrear.push({
          padronElectoralId: padronId,
          dni: fila.dni,
          nombreCompletoOriginal: fila.nombreCompletoOriginal,
          carreraTextoOriginal: fila.carreraTextoOriginal ?? null,
          ...datosMatching,
        });
      } catch (error) {
        filasOmitidas.push({
          numeroFila: fila.numeroFila,
          motivo: `Error al resolver esta fila, no se cargó: ${error instanceof Error ? error.message : "error desconocido"}`,
        });
      }
    }
  }

  const cantidadTrabajadores = Math.min(CONCURRENCIA_MATCHING, filas.length);
  await Promise.all(Array.from({ length: cantidadTrabajadores }, trabajador));

  if (paraCrear.length > 0) {
    await prisma.padronEntrada.createMany({ data: paraCrear });
  }

  filasOmitidas.sort((a, b) => a.numeroFila - b.numeroFila);

  return {
    procesadas: paraCrear.length,
    omitidas: filasOmitidas.length,
    filasOmitidas,
    totalFilas: filas.length,
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

  const filasParaProcesar: FilaPadronParaProcesar[] = filas.map((fila, i) => {
    const datos: Partial<Record<CampoPadronImportable, string>> = {};
    for (const [columna, campo] of Object.entries(mapeo)) {
      if (!campo) continue;
      const valor = fila[columna];
      if (valor) datos[campo] = valor.trim();
    }

    const nombreCompletoOriginal =
      datos.nombreCompleto || [datos.apellido, datos.nombre].filter(Boolean).join(", ") || undefined;

    return {
      numeroFila: i + 2,
      dni: datos.dni,
      nombreCompletoOriginal,
      carreraTextoOriginal: datos.carrera,
    };
  });

  const resultado = await procesarFilasPadronEnParalelo(padronId, filasParaProcesar, umbral);

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
    metadata: { procesadas: resultado.procesadas, omitidas: resultado.omitidas, totalFilas: filas.length },
  });

  await notificarImportacionFinalizada({
    jobId: padronId,
    usuarioId,
    entidadDestino: "Padrón electoral",
    exitosas: resultado.procesadas,
    conError: resultado.omitidas,
  });

  const resumen = await obtenerResumenPadron(padronId);
  await notificarPendientesRevisionPadron(padronId, resumen.pendiente);

  return resultado;
}

interface IniciarImportacionPadronPdfInput {
  padronId: string;
  usuarioId: string;
  nombreArchivo: string;
  pdfBase64: string;
}

// Carga de un padrón directamente desde el PDF oficial —
// /09-modulo-padron-electoral.md sección 4 y /15-ia.md sección 4: caso
// principal de este módulo, dado que los padrones universitarios rara vez
// llegan como planilla.
//
// Se procesa en dos etapas (iniciar + procesar lote por lote) en vez de una
// sola llamada, porque el plan real de este proyecto es el gratuito de
// Vercel (Hobby — nunca se paga por infraestructura, decisión explícita de
// Gaspar 2026-08-02), que tiene un límite de 300s por función. **Corrección
// 2026-08-04**: la razón original de este diseño era la cuota de Gemini (15
// requests/min) — ya no aplica, la lectura de PDF es determinística desde
// esta fecha (lib/padron/lectura-padron.ts) y tarda milisegundos, no
// minutos. Se mantiene el procesamiento incremental por dos razones que sí
// siguen vigentes: (1) el *matching* de cada fila contra la base sigue
// siendo trabajo real de base de datos, que con un padrón de miles de filas
// puede seguir acercándose al límite de 300s si se hiciera todo en una sola
// función; (2) la barra de progreso visible en la UI durante la carga, que
// ya es parte de la experiencia esperada. Subir el PDF y calcular los lotes
// deja el padrón listo para que el cliente vaya pidiendo lotes de a uno.
export async function iniciarImportacionPadronPdf({
  padronId,
  usuarioId,
  nombreArchivo,
  pdfBase64,
}: IniciarImportacionPadronPdfInput): Promise<{ totalLotes: number }> {
  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  const rutaArchivo = `${usuarioId}/${Date.now()}-${nombreArchivo}`;
  const admin = createAdminClient();
  const { error: errorSubida } = await admin.storage
    .from("importaciones")
    .upload(rutaArchivo, pdfBuffer, { contentType: "application/pdf" });
  if (errorSubida) {
    throw new Error("No se pudo subir el PDF a almacenamiento. Probá de nuevo.");
  }

  const lotes = await prepararLotesPadronPdf(pdfBuffer);

  await prisma.padronElectoral.update({
    where: { id: padronId },
    data: { archivoOrigenId: rutaArchivo, lotesTotales: lotes.length, lotesProcesados: 0 },
  });

  return { totalLotes: lotes.length };
}

export interface ResultadoLotePadron {
  completado: boolean;
  lotesProcesados: number;
  lotesTotales: number;
  procesadasEnEsteLote: number;
  omitidasEnEsteLote: number;
  filasOmitidasEnEsteLote: { numeroFila: number; motivo: string }[];
}

// Procesa exactamente el siguiente lote sin leer del PDF que no haya sido
// procesado todavía — pensado para que el cliente lo llame repetidas veces
// hasta `completado: true`, mostrando progreso, sin depender de que una sola
// función serverless aguante todo el padrón completo (ver comentario de
// iniciarImportacionPadronPdf). Una línea del PDF que no matchea el formato
// esperado (lib/padron/lectura-padron.ts) nunca se pierde en silencio: queda
// reportada como fila omitida con el texto original, igual que cualquier
// otro tipo de fila que no se pudo procesar.
export async function procesarSiguienteLotePadron(
  padronId: string,
  usuarioId: string,
): Promise<ResultadoLotePadron> {
  const padron = await prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });

  if (!padron.archivoOrigenId || padron.lotesTotales == null) {
    throw new Error("Este padrón no tiene una importación de PDF iniciada.");
  }

  if (padron.lotesProcesados >= padron.lotesTotales) {
    return {
      completado: true,
      lotesProcesados: padron.lotesProcesados,
      lotesTotales: padron.lotesTotales,
      procesadasEnEsteLote: 0,
      omitidasEnEsteLote: 0,
      filasOmitidasEnEsteLote: [],
    };
  }

  const admin = createAdminClient();
  const { data, error: errorDescarga } = await admin.storage
    .from("importaciones")
    .download(padron.archivoOrigenId);
  if (errorDescarga || !data) {
    throw new Error("No se pudo leer el PDF ya subido. Probá de nuevo.");
  }
  const pdfBuffer = Buffer.from(await data.arrayBuffer());

  const lotes = await prepararLotesPadronPdf(pdfBuffer);
  const indiceLote = padron.lotesProcesados;
  // Determinístico y sincrónico desde 2026-08-04 — ya no hace falta
  // conLimiteDeTiempo() acá, no hay ninguna llamada externa que pueda
  // colgarse (ver lib/padron/lectura-padron.ts).
  const { entradas: entradasDelLote, lineasNoReconocidas } = parsearLotePadron(lotes[indiceLote]);

  const umbral = await obtenerUmbralConfianzaDuplicados();
  const filasParaProcesar: FilaPadronParaProcesar[] = entradasDelLote.map((entrada, i) => ({
    numeroFila: indiceLote * 1000 + i + 1,
    dni: entrada.dni ?? undefined,
    nombreCompletoOriginal: entrada.nombreCompleto,
    carreraTextoOriginal: entrada.carrera,
    confianzaExtraccion: entrada.confianzaExtraccion,
  }));

  const resultadoLote = await conLimiteDeTiempo(
    procesarFilasPadronEnParalelo(
      padronId,
      filasParaProcesar,
      umbral,
      "Falta DNI o nombre en esta fila.",
    ),
    100_000,
  );

  // Líneas del PDF que no matchearon el formato esperado — se agregan a las
  // omitidas del lote con el texto original, para revisión humana, en vez de
  // perderse (ver lib/padron/lectura-padron.ts).
  if (lineasNoReconocidas.length > 0) {
    const numeroFilaBase = indiceLote * 1000 + entradasDelLote.length;
    resultadoLote.filasOmitidas.push(
      ...lineasNoReconocidas.map((linea, i) => ({
        numeroFila: numeroFilaBase + i + 1,
        motivo: `Línea del PDF no reconocida por el parser: "${linea}"`,
      })),
    );
    resultadoLote.omitidas += lineasNoReconocidas.length;
  }

  const lotesProcesados = indiceLote + 1;
  await prisma.padronElectoral.update({
    where: { id: padronId },
    data: { lotesProcesados },
  });

  const completado = lotesProcesados >= padron.lotesTotales;
  if (completado) {
    await registrarCambio({
      entidad: "PadronElectoral",
      entidadId: padronId,
      accion: "importar",
      usuarioId,
      metadata: { origen: "pdf", lotesTotales: padron.lotesTotales },
    });

    const resumenFinal = await obtenerResumenPadron(padronId);
    await notificarImportacionFinalizada({
      jobId: padronId,
      usuarioId,
      entidadDestino: "Padrón electoral",
      exitosas: resumenFinal.total - resumenFinal.pendiente,
      conError: resumenFinal.pendiente,
    });
    await notificarPendientesRevisionPadron(padronId, resumenFinal.pendiente);
  }

  return {
    completado,
    lotesProcesados,
    lotesTotales: padron.lotesTotales,
    procesadasEnEsteLote: resultadoLote.procesadas,
    omitidasEnEsteLote: resultadoLote.omitidas,
    filasOmitidasEnEsteLote: resultadoLote.filasOmitidas,
  };
}

export async function vincularEntradaManualmente(
  entradaId: string,
  personaId: string,
  usuarioId: string,
) {
  const [entradaAntes, personaVinculada] = await Promise.all([
    prisma.padronEntrada.findUniqueOrThrow({ where: { id: entradaId } }),
    prisma.persona.findUnique({ where: { id: personaId } }),
  ]);

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

  // Veredicto humano — /PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección
  // 3.9. No bloquea la vinculación si falla: es un registro para
  // recalibración futura, no una condición de la operación real.
  if (personaVinculada) {
    try {
      await registrarVeredictoIdentidad({
        nombreObjetivo: entradaAntes.nombreCompletoOriginal,
        candidatoNombreCompleto: `${personaVinculada.nombre} ${personaVinculada.apellido}`,
        candidatoId: personaVinculada.id,
        decision: "misma_persona",
        contexto: "padron",
        usuarioId,
      });
    } catch {
      // No interrumpe el flujo real — ver comentario del servicio.
    }
  }

  return entrada;
}

// Revisión manual: la entrada se marca como "revisada, sin vincular todavía"
// — RN sección 6: no puede quedar en el limbo de `pendiente`, pero tampoco
// hace falta vincularla a la fuerza si de verdad no corresponde a nadie.
export async function marcarEntradaSinCoincidencia(entradaId: string, usuarioId: string) {
  const entradaAntes = await prisma.padronEntrada.findUniqueOrThrow({ where: { id: entradaId } });

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

  // Veredicto humano por cada candidato que se le había sugerido y descartó
  // — mismo criterio que vincularEntradaManualmente, ver
  // /PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.9.
  if (entradaAntes.candidatosSugeridos) {
    try {
      const candidatos = JSON.parse(entradaAntes.candidatosSugeridos) as {
        id: string;
        nombre: string;
        apellido: string;
      }[];
      for (const candidato of candidatos) {
        await registrarVeredictoIdentidad({
          nombreObjetivo: entradaAntes.nombreCompletoOriginal,
          candidatoNombreCompleto: `${candidato.nombre} ${candidato.apellido}`,
          candidatoId: candidato.id,
          decision: "distinta_persona",
          contexto: "padron",
          usuarioId,
        });
      }
    } catch {
      // JSON inválido o fallo de escritura — no interrumpe el flujo real.
    }
  }

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
  if (resumen.total === 0) throw new PadronVacioError();
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

  await notificarPadronActivado(padronId);

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

export class PadronNoEsBorradorError extends Error {
  constructor() {
    super(
      "Solo se puede borrar un padrón en estado \"borrador\". Un padrón activo o cerrado ya tuvo efecto real sobre el estado de las Personas o es historial electoral — no se borra, se cierra.",
    );
    this.name = "PadronNoEsBorradorError";
  }
}

// Borrado de un padrón — excepción puntual al principio de "cero pérdida de
// datos" (/01-vision-alcance.md sección 8, principio 3), mismo criterio que
// ya reconoce RN-5 para el borrado de un comentario de punteo por error
// grave: reservado a un permiso administrativo (`padron.gestionar`, ver
// /10-usuarios-roles-permisos.md — hoy solo lo tiene el rol Administrador) y
// siempre registrado en HistorialCambio antes de borrar. Se restringe a
// padrones en estado `borrador` a propósito: uno `activo` o `cerrado` ya
// tuvo efecto real (recalculó `estado_padron` de Personas reales, quedó
// como historial electoral) — borrarlo perdería ese registro sin dejar
// rastro real de qué pasó, que es exactamente lo que el principio de "cero
// pérdida de datos" existe para evitar. Un borrador nunca tuvo ese efecto, así
// que borrarlo es deshacer una carga en curso, no perder historia real. Las
// `PadronEntrada` de este padrón se borran en cascada (`onDelete: Cascade`
// en el modelo, ver schema.prisma) — ninguna puede estar vinculada
// (`vinculado_manual`/`vinculado_automatico`) a esta altura sin que el
// padrón ya estuviera activo, así que no hay Persona real afectada.
export async function eliminarPadron(padronId: string, usuarioId: string) {
  const padron = await prisma.padronElectoral.findUniqueOrThrow({ where: { id: padronId } });
  if (padron.estado !== "borrador") throw new PadronNoEsBorradorError();

  await registrarCambio({
    entidad: "PadronElectoral",
    entidadId: padronId,
    accion: "otro",
    usuarioId,
    metadata: {
      proceso: "eliminar_padron",
      nombre: padron.nombre,
      tipo: padron.tipo,
      entradasAlMomentoDeBorrar: await prisma.padronEntrada.count({ where: { padronElectoralId: padronId } }),
    },
  });

  if (padron.archivoOrigenId) {
    const admin = createAdminClient();
    // No fatal si falla — el archivo original queda huérfano en Storage,
    // recuperable a mano, pero no vale la pena bloquear el borrado del
    // registro por un problema de limpieza de almacenamiento.
    await admin.storage.from("importaciones").remove([padron.archivoOrigenId]).catch(() => {});
  }

  await prisma.padronElectoral.delete({ where: { id: padronId } });
}

// Re-chequeo automático: si una Persona recién creada tiene DNI y hay
// entradas "sin_coincidencia" en algún padrón ya cargado con ese mismo DNI
// (ej. alguien que figuraba en el padrón oficial pero todavía no estaba en
// la base, y se suma después vía una Actividad, alta manual o punteo), se
// vincula sola — el DNI es señal determinística (RN-1), no hace falta
// revisión humana acá. Si el padrón de esa entrada está activo, además
// habilita el estado de padrón correspondiente (CD o CE) para esta Persona,
// que de otro modo quedaría en "no_evaluado" al no haber existido todavía
// cuando se activó ese padrón. Pedido de Gaspar, 2026-08-02.
export async function revincularPersonaNuevaConPadronesPendientes(personaId: string, dni: string) {
  const entradasPendientes = await prisma.padronEntrada.findMany({
    where: { dni, personaId: null, estadoMatching: "sin_coincidencia" },
    include: { padronElectoral: true },
  });

  for (const entrada of entradasPendientes) {
    await prisma.padronEntrada.update({
      where: { id: entrada.id },
      data: { personaId, estadoMatching: "vinculado_automatico", confianzaMatching: 1 },
    });
    await registrarCambio({
      entidad: "PadronEntrada",
      entidadId: entrada.id,
      accion: "editar",
      usuarioId: null,
      campo: "personaId",
      valorNuevo: personaId,
      metadata: { proceso: "revinculacion_automatica_dni", personaId },
    });

    if (entrada.padronElectoral.estado === "activo") {
      const campoEstado = CAMPO_ESTADO_PADRON_POR_TIPO[entrada.padronElectoral.tipo];
      await prisma.persona.update({
        where: { id: personaId },
        data: { [campoEstado]: "en_padron_habilitado" },
      });
    }
  }
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
