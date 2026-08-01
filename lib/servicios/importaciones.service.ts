import Papa from "papaparse";
import { prisma } from "@/lib/prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import { personaFormSchema } from "@/lib/validaciones/persona.validation";
import type { CampoPersonaImportable } from "@/lib/utils/csv-mapping";

interface ProcesarImportacionCsvInput {
  usuarioId: string;
  nombreArchivo: string;
  contenidoCsv: string;
  mapeo: Record<string, CampoPersonaImportable | "">;
}

// Importación básica desde CSV — /14-importaciones-exportaciones.md sección 3
// y 5. Sin matching inteligente (eso es Fase 7/8): el mapeo de columnas ya
// viene resuelto desde la UI (sugerido por coincidencia de nombre, ajustable
// a mano por el usuario). Cada fila pasa por la misma validación y la misma
// regla de unicidad de DNI que el alta manual (RN-1, ver /04-modelo-datos.md).
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
    const carreraId = carreraTexto
      ? carreraPorNombre.get(carreraTexto.toLowerCase())
      : undefined;

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

    if (parsed.data.dni) {
      if (dnisEnEsteArchivo.has(parsed.data.dni)) {
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
      const existente = await prisma.persona.findFirst({
        where: { dni: parsed.data.dni, estadoFicha: { not: "fusionada" } },
      });
      if (existente) {
        duplicados++;
        conError++;
        await prisma.importJobError.create({
          data: {
            importJobId: job.id,
            numeroFila,
            contenidoOriginal: JSON.stringify(fila),
            mensajeError: `Ya existe una persona con DNI ${parsed.data.dni} (${existente.nombre} ${existente.apellido}).`,
          },
        });
        continue;
      }
      dnisEnEsteArchivo.add(parsed.data.dni);
    }

    try {
      await prisma.persona.create({
        data: {
          nombre: parsed.data.nombre,
          apellido: parsed.data.apellido,
          dni: parsed.data.dni ?? null,
          legajo: parsed.data.legajo ?? null,
          carreraId: carreraId ?? null,
          instagram: parsed.data.instagram ?? null,
          observacionesGenerales: parsed.data.observacionesGenerales ?? null,
          creadoPorId: usuarioId,
          modificadoPorId: usuarioId,
          telefonos: parsed.data.telefono
            ? { create: [{ numero: parsed.data.telefono, esPrincipal: true }] }
            : undefined,
          emails: parsed.data.email
            ? { create: [{ email: parsed.data.email, esPrincipal: true }] }
            : undefined,
        },
      });
      exitosas++;
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
    }
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

  return jobFinal;
}
