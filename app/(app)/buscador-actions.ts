"use server";

import { tienePermiso } from "@/lib/permisos/permisos";
import { buscarGlobal, type ResultadosBusquedaGlobal } from "@/lib/servicios/busqueda.service";

// Server Action del buscador global — /12-buscador-global.md. Reutiliza los
// permisos existentes (sección 8), no introduce ninguno propio.
export async function buscarGlobalAction(query: string): Promise<ResultadosBusquedaGlobal> {
  const [puedeVerPersonas, puedeVerActividades, puedeVerPadron] = await Promise.all([
    tienePermiso("personas.ver"),
    tienePermiso("actividades.ver"),
    tienePermiso("padron.ver"),
  ]);

  return buscarGlobal(query, { puedeVerPersonas, puedeVerActividades, puedeVerPadron });
}
