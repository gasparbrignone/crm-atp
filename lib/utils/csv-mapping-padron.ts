// Mapeo de columnas para carga de PadronEntrada por CSV/Excel exportado a
// CSV — /09-modulo-padron-electoral.md sección 4: la lectura nativa de PDF
// (vía IA) se reserva para la Fase 7 (importaciones avanzadas); acá se cubre
// el caso más simple de un padrón que la facultad publica directamente como
// planilla. Igual criterio de mapeo asistido que
// /lib/utils/csv-mapping-inscripciones.ts.
export const CAMPOS_PADRON_IMPORTABLES = [
  "dni",
  "nombreCompleto",
  "nombre",
  "apellido",
  "carrera",
] as const;

export type CampoPadronImportable = (typeof CAMPOS_PADRON_IMPORTABLES)[number];

export const ETIQUETA_CAMPO_PADRON: Record<CampoPadronImportable, string> = {
  dni: "DNI",
  nombreCompleto: "Nombre completo (una sola columna)",
  nombre: "Nombre (columna separada)",
  apellido: "Apellido (columna separada)",
  carrera: "Carrera",
};

const PATRONES: Record<CampoPadronImportable, RegExp> = {
  dni: /^(dni|documento|nro\.?\s*documento|cuil)$/i,
  nombreCompleto: /^(nombre\s*completo|apellido\s*y\s*nombre|nombre\s*y\s*apellido|alumno)$/i,
  nombre: /^nombres?$/i,
  apellido: /^apellidos?$/i,
  carrera: /^(carrera|facultad)$/i,
};

export function sugerirMapeoPadron(
  encabezados: string[],
): Record<string, CampoPadronImportable | ""> {
  const mapeo: Record<string, CampoPadronImportable | ""> = {};
  for (const encabezado of encabezados) {
    const normalizado = encabezado.trim();
    const campo = (Object.entries(PATRONES) as [CampoPadronImportable, RegExp][]).find(
      ([, patron]) => patron.test(normalizado),
    )?.[0];
    mapeo[encabezado] = campo ?? "";
  }
  return mapeo;
}
