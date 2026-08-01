"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { importarEntradasPadronCsv, importarEntradasPadronPdf } from "@/lib/servicios/padron.service";
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

export async function importarEntradasPadronPdfAction(
  padronId: string,
  nombreArchivo: string,
  pdfBase64: string,
) {
  const usuario = await requerirPermiso("padron.importar");

  const resultado = await importarEntradasPadronPdf({
    padronId,
    usuarioId: usuario.id,
    nombreArchivo,
    pdfBase64,
  });

  revalidatePath(`/padron/${padronId}`);
  revalidatePath("/padron");

  return resultado;
}
