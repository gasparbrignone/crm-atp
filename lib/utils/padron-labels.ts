import type { TipoPadronElectoral } from "@prisma/client";

// ATP maneja dos padrones oficiales distintos y activos en simultáneo
// durante una elección — ver CLAUDE.md "TAREA EN CURSO" (2026-08-01).
export const ETIQUETA_TIPO_PADRON: Record<TipoPadronElectoral, string> = {
  consejo_directivo: "Consejo Directivo",
  centro_estudiantes: "Centro de Estudiantes",
};
