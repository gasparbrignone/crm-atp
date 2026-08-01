import type { EstadoActividad, ModalidadActividad, EstadoParticipacion } from "@prisma/client";

// Etiquetas y color semántico de estado — mismo criterio que
// /lib/utils/persona-labels.ts (/19-ux-ui.md sección 2: colores de estado,
// nunca decorativos).
export const ETIQUETA_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  planificada: "Planificada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export const COLOR_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  planificada: "text-secundario",
  en_curso: "text-exito",
  finalizada: "text-texto-secundario",
  cancelada: "text-error",
};

export const ETIQUETA_MODALIDAD: Record<ModalidadActividad, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  hibrida: "Híbrida",
};

export const ETIQUETA_ESTADO_PARTICIPACION: Record<EstadoParticipacion, string> = {
  inscripto: "Inscripto",
  confirmado: "Confirmado",
  asistio: "Asistió",
  ausente: "Ausente",
  cancelado: "Cancelado",
};

export const COLOR_ESTADO_PARTICIPACION: Record<EstadoParticipacion, string> = {
  inscripto: "text-secundario",
  confirmado: "text-primario",
  asistio: "text-exito",
  ausente: "text-error",
  cancelado: "text-texto-secundario",
};
