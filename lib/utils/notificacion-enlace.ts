// Resuelve a qué ruta de la app apunta la acción rápida de una notificación,
// a partir de (entidadRelacionada, entidadRelacionadaId) —
// /13-notificaciones.md sección 2 (las accionables "incluyen un enlace
// directo a la acción sugerida"). Solo cubre entidades con una ficha
// navegable; el resto se muestra sin enlace (texto plano).
export function enlaceDeNotificacion(
  entidadRelacionada: string | null,
  entidadRelacionadaId: string | null,
): string | null {
  if (!entidadRelacionada || !entidadRelacionadaId) return null;

  switch (entidadRelacionada) {
    case "Actividad":
      return `/actividades/${entidadRelacionadaId}`;
    case "PadronElectoral":
      return `/padron/${entidadRelacionadaId}`;
    case "PunteoPersona":
      return `/punteo/${entidadRelacionadaId}`;
    case "Usuario":
      return `/perfil`;
    default:
      return null;
  }
}
