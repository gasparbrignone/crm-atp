"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  importarEntradasPadronCsv,
  iniciarImportacionPadronPdf,
  procesarSiguienteLotePadron,
  type ResultadoLotePadron,
} from "@/lib/servicios/padron.service";
import type { CampoPadronImportable } from "@/lib/utils/csv-mapping-padron";

export async function importarEntradasPadronCsvAction(
  padronId: string,
  nombreArchivo: string,
  contenidoCsv: string,
  mapeo: Record<string, CampoPadronImportable | "">,
) {
  const usuario = await requerirPermiso("padron.importar");

  const resultado = await importarEntradasPadronCsv({
    padronId,
    usuarioId: usuario.id,
    nombreArchivo,
    contenidoCsv,
    mapeo,
  });

  revalidatePath(`/padron/${padronId}`);
  revalidatePath("/padron");

  return resultado;
}

// Primer paso: sube el PDF y calcula en cuántos lotes se va a leer. Todavía
// no parsea nada — ver nota en padron.service.ts sobre por qué esto se
// separó de la lectura en sí (que es 100% determinística, sin IA, desde
// 2026-08-04 — lib/padron/lectura-padron.ts).
export async function iniciarImportacionPadronPdfAction(
  padronId: string,
  nombreArchivo: string,
  pdfBase64: string,
): Promise<{ totalLotes: number }> {
  const usuario = await requerirPermiso("padron.importar");
  return iniciarImportacionPadronPdf({ padronId, usuarioId: usuario.id, nombreArchivo, pdfBase64 });
}

// Segundo paso, llamado repetidas veces por el cliente hasta `completado`:
// procesa el siguiente lote todavía no leído.
export async function procesarSiguienteLotePadronAction(
  padronId: string,
): Promise<ResultadoLotePadron> {
  const usuario = await requerirPermiso("padron.importar");
  const resultado = await procesarSiguienteLotePadron(padronId, usuario.id);

  if (resultado.completado) {
    revalidatePath(`/padron/${padronId}`);
    revalidatePath("/padron");
  }

  return resultado;
}
