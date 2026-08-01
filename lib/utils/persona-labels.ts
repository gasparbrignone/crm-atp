import type { EstadoPadronPersona, EstadoFicha } from "@prisma/client";

// Etiquetas y color semántico de estado — ver /04-modelo-datos.md sección 5.1
// y /19-ux-ui.md sección 2 (colores de estado, nunca decorativos).
export const ETIQUETA_ESTADO_PADRON: Record<EstadoPadronPersona, string> = {
  no_evaluado: "No evaluado",
  en_padron_habilitado: "Habilitado",
  en_padron_no_habilitado: "No habilitado",
  no_encontrado_en_padron: "No encontrado en padrón",
};

export const COLOR_ESTADO_PADRON: Record<EstadoPadronPersona, string> = {
  no_evaluado: "text-texto-secundario",
  en_padron_habilitado: "text-exito",
  en_padron_no_habilitado: "text-error",
  no_encontrado_en_padron: "text-alerta",
};

export const ETIQUETA_ESTADO_FICHA: Record<EstadoFicha, string> = {
  activa: "Activa",
  archivada: "Archivada",
  fusionada: "Fusionada",
};
