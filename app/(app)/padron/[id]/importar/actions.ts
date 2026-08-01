"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { importarEntradasPadronCsv } from "@/lib/servicios/padron.service";
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
