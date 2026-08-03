// Etiquetas legibles para la línea de tiempo de historial —
// /17-auditoria-historial.md sección 6.
export const ETIQUETA_ACCION_HISTORIAL: Record<string, string> = {
  crear: "Creó la ficha",
  editar: "Editó",
  archivar: "Archivó la ficha",
  restaurar: "Restauró la ficha",
  fusionar: "Fusión de fichas",
  exportar: "Exportó datos",
  importar: "Importó datos",
  login: "Inicio de sesión",
  cambio_permiso: "Cambio de permisos",
  otro: "Otro evento",
};

export const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  dni: "DNI",
  legajo: "Legajo",
  carreraId: "Carrera",
  anio: "Año",
  instagram: "Instagram",
  observacionesGenerales: "Observaciones generales",
  estadoFicha: "Estado de la ficha",
};

export function etiquetaCampo(campo: string): string {
  return ETIQUETA_CAMPO[campo] ?? campo;
}
