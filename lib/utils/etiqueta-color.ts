// Estilo visual de un chip de Etiqueta — color de fondo semitransparente +
// texto en el color base de la etiqueta, con un gris neutro por defecto para
// las que no tienen color asignado. Duplicado en 3 componentes distintos
// (ficha, listado, selector de etiquetas) hasta la auditoría 2026-08-04 —
// extraído acá para no repetir el mismo cálculo tres veces.
export function estiloEtiqueta(color: string | null): { backgroundColor: string; color: string } {
  const base = color ?? "#94a3b8";
  return { backgroundColor: base + "26", color: color ?? "#64748b" };
}
