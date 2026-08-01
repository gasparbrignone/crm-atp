import type { EstadoSeguimientoPunteo } from "@prisma/client";

// Etiquetas y color semántico de estado — mismo criterio que
// /lib/utils/actividad-labels.ts (/19-ux-ui.md sección 2).
export const ETIQUETA_ESTADO_SEGUIMIENTO: Record<EstadoSeguimientoPunteo, string> = {
  sin_iniciar: "Sin iniciar",
  en_seguimiento: "En seguimiento",
  contactado: "Contactado",
  requiere_reintento: "Requiere reintento",
  cerrado: "Cerrado",
};

export const COLOR_ESTADO_SEGUIMIENTO: Record<EstadoSeguimientoPunteo, string> = {
  sin_iniciar: "text-texto-secundario",
  en_seguimiento: "text-secundario",
  contactado: "text-exito",
  requiere_reintento: "text-alerta",
  cerrado: "text-texto-secundario",
};

export const ORDEN_ESTADO_SEGUIMIENTO: EstadoSeguimientoPunteo[] = [
  "sin_iniciar",
  "en_seguimiento",
  "contactado",
  "requiere_reintento",
  "cerrado",
];
