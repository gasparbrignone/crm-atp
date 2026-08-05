import Papa from "papaparse";
import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { notificarImportacionFinalizada } from "@/lib/servicios/notificaciones.service";
import { personaFormSchema } from "@/lib/validaciones/persona.validation";
import { resolverCarreraSemantica } from "@/lib/ia/normalizacion";
import { resolverOCrearPersona } from "@/lib/servicios/personas.service";
import { obtenerUmbralConfianzaDuplicados } from "@/lib/ia/deteccion-duplicados";
import { obtenerCatalogoLexicoIdentidad } from "@/lib/servicios/lexico-identidad.service";
import type { CampoPersonaImportable } from "@/lib/utils/csv-mapping";

interface ProcesarImportacionCsvInput {
  usuarioId: string;
  nombreArchivo: string;
  contenidoCsv: string;
  mapeo: Record<string, CampoPersonaImportable | "">;
}

// Importación básica desde CSV — /14-importaciones-exportaciones.md sección 3
// y 5. El mapeo de columnas ya viene resuelto desde la UI (sugerido por
// coincidencia de nombre, ajustable a mano por el usuario). Cada fila pasa
// por la misma validación y la misma verificación de duplicados (DNI exacto
// + nombre difuso vía el Motor de Resolución de Identidad, resolverOCrearPersona())
// que el alta manual y la importación de inscriptos a Actividad — desde
// 2026-08-04 las 3 vías de entrada de Personas comparten el mismo motor (ver
// PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.4; hasta entonces,
// esta era la única que solo comparaba DNI).
export async function procesarImportacionPersonasCsv({
  usuarioId,
  nombreArchivo,
  contenidoCsv,
  mapeo,
}: ProcesarImportacionCsvInput) {
  const { data: filas } = Papa.parse<Record<string, string>>(contenidoCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const rutaArchivo = `${usuarioId}/${Date.now()}-${nombreArchivo}`;
  const admin = createAdminClient();
  const { error: errorSubida } = await admin.storage
    .from("importaciones")
    .upload(rutaArchivo, contenidoCsv, { contentType: "text/csv" });

  const job = await prisma.importJob.create({
    data: {
      tipoOrigen: "csv",
      entidadDestino: "Persona",
      estado: "procesando",
      archivoOrigenId: errorSubida ? null : rutaArchivo,
      totalFilas: filas.length,
      usuarioId,
    },
  });

  const carreras = await prisma.carrera.findMany();
  const carreraPorNombre = new Map(
    carreras.map((c) => [c.nombre.trim().toLowerCase(), c.id]),
  );
  // Una sola consulta para todo el archivo, no una por fila (auditoría
  // 2026-08-04) — el umbral configurado no cambia en medio de una
  // importación.
  const umbral = await obtenerUmbralConfianzaDuplicados();
  // Mismo criterio para el catálogo léxico (nombres compuestos/partículas) —
  // ver PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 6.
  const catalogoLexico = await obtenerCatalogoLexicoIdentidad();

  const dnisEnEsteArchivo = new Set<string>();
  let exitosas = 0;
  let conError = 0;
  let duplicados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2; // +1 por índice 0, +1 por la fila de encabezado

    const datosMapeados: Record<string, string> = {};
    for (const [columna, campo] of Object.entries(mapeo)) {
      if (!campo || campo === "carreraTexto") continue;
      const valor = fila[columna];
      if (valor) datosMapeados[campo] = valor.trim();
    }

    const columnaCarrera = Object.entries(mapeo).find(([, c]) => c === "carreraTexto")?.[0];
    const carreraTexto = columnaCarrera ? fila[columnaCarrera]?.trim() : undefined;
    // Matching semántico (/15-ia.md sección 3): primero exacto (gratis), y
    // solo si no hay coincidencia exacta se recurre a la IA para resolver
    // variantes de escritura ("Enfermeria", "Lic. en Enfermería", "ENF"). Con
    // try/catch (auditoría 2026-08-03, bug real): si la IA falla (ej. cuota
    // diaria agotada a mitad de importación), antes esto tiraba abajo TODO el
    // for sin llegar nunca al `prisma.importJob.update()` final — el
    // ImportJob quedaba en "procesando" para siempre, sin explicación, con
    // las filas ya creadas antes del fallo huérfanas de ese reporte. Ahora la
    // fila sigue sin carrera asignada (recuperable a mano después) en vez de
    // perder la importación completa.
    let carreraId: string | undefined;
    if (carreraTexto) {
      carreraId = carreraPorNombre.get(carreraTexto.toLowerCase());
      if (!carreraId) {
        try {
          carreraId = await resolverCarreraSemantica(carreraTexto);
        } catch {
          carreraId = undefined;
        }
      }
    }

    const parsed = personaFormSchema.safeParse(datosMapeados);
    if (!parsed.success) {
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: parsed.error.issues[0]?.message ?? "Fila inválida.",
        },
      });
      continue;
    }
    // carreraId no es un campo mapeable desde CSV (solo carreraTexto, ver
    // csv-mapping.ts) — se resuelve aparte arriba y se inyecta acá para que
    // viaje en el mismo objeto que resolverOCrearPersona()/crearPersona() ya
    // saben persistir, en vez de un segundo UPDATE separado no atómico.
    if (carreraId) parsed.data.carreraId = carreraId;

    // DNI repetido dentro del mismo archivo — chequeo previo y específico
    // (mensaje más útil que el genérico de más abajo) antes de consultar el
    // motor de identidad. No es redundante pese a que el motor también lo
    // detectaría una vez que la primera fila con ese DNI ya esté persistida
    // (el for procesa en serie): este chequeo cubre el caso, y da el mensaje
    // correcto, sin depender de ese orden implícito.
    if (parsed.data.dni && dnisEnEsteArchivo.has(parsed.data.dni)) {
      duplicados++;
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: `DNI duplicado dentro del mismo archivo (${parsed.data.dni}).`,
        },
      });
      continue;
    }

    // Verificación de duplicados vía el Motor de Resolución de Identidad
    // completo (DNI exacto + nombre difuso) — hasta acá esta importación
    // comparaba SOLO DNI exacto, la única de las 3 vías de entrada de
    // Personas que no usaba el motor completo (inconsistente entre sí y con
    // /14-importaciones-exportaciones.md sección 9, que ya documentaba lo
    // contrario — ver PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.4,
    // P2). Una importación masiva no puede mostrar un diálogo interactivo
    // como el alta manual: tanto una coincidencia fuerte ("vinculada", ya
    // existe con confianza alta) como una ambigua se reportan como fila con
    // error para revisión humana — ninguna crea una Persona nueva sola, ni
    // se re-vincula sola a la existente, porque esta importación no crea
    // ninguna relación (Participación, etc.) sobre la que "reusar el id"
    // tendría sentido: acá "ya existe" es siempre motivo de no duplicar.
    let resultado: Awaited<ReturnType<typeof resolverOCrearPersona>>;
    try {
      resultado = await resolverOCrearPersona(
        parsed.data,
        usuarioId,
        "importacion_csv",
        umbral,
        catalogoLexico,
      );
    } catch {
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: "No se pudo guardar la fila (error inesperado).",
        },
      });
      continue;
    }

    if (resultado.tipo === "vinculada") {
      duplicados++;
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: `Ya existe una persona parecida (${resultado.motivo}).`,
        },
      });
      continue;
    }

    if (resultado.tipo === "ambiguo") {
      conError++;
      await prisma.importJobError.create({
        data: {
          importJobId: job.id,
          numeroFila,
          contenidoOriginal: JSON.stringify(fila),
          mensajeError: JSON.stringify({ motivo: resultado.motivo, candidatos: resultado.candidatos }),
        },
      });
      continue;
    }

    if (parsed.data.dni) dnisEnEsteArchivo.add(parsed.data.dni);
    exitosas++;
  }

  const jobFinal = await prisma.importJob.update({
    where: { id: job.id },
    data: {
      estado: conError > 0 ? "completado_con_errores" : "completado",
      filasExitosas: exitosas,
      filasConError: conError,
      duplicadosDetectados: duplicados,
      fechaFin: new Date(),
    },
  });

  await registrarCambio({
    entidad: "ImportJob",
    entidadId: job.id,
    accion: "importar",
    usuarioId,
    metadata: { entidadDestino: "Persona", exitosas, conError, duplicados },
  });

  await notificarImportacionFinalizada({
    jobId: job.id,
    usuarioId,
    entidadDestino: "Personas",
    exitosas,
    conError,
  });

  return jobFinal;
}
