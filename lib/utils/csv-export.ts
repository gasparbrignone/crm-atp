import Papa from "papaparse";

// Generación de CSV para exportaciones — /14-importaciones-exportaciones.md
// sección 8. Formato único por ahora (Excel real, .xlsx, queda pendiente —
// ver nota en /exportar/actions.ts): un CSV se abre sin problema en Excel o
// Google Sheets, cubre el caso de uso real ("compartir el estado con otro
// referente de la organización") sin sumar una librería nueva solo para
// generar el formato binario de Excel.
export function generarCsv(filas: Record<string, unknown>[]): string {
  return Papa.unparse(filas, { header: true });
}
