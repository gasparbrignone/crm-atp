import { z } from "zod";

// Ver /07-modulo-participaciones.md sección 5 — estados válidos de una Participacion.
export const ESTADOS_PARTICIPACION = [
  "inscripto",
  "confirmado",
  "asistio",
  "ausente",
  "cancelado",
] as const;

export const cambiarEstadoParticipacionSchema = z.object({
  participacionId: z.string().trim().min(1),
  estado: z.enum(ESTADOS_PARTICIPACION),
});

export const inscribirPersonaSchema = z.object({
  actividadId: z.string().trim().min(1),
  personaId: z.string().trim().min(1),
});

export const inscribirMasivoSchema = z.object({
  actividadId: z.string().trim().min(1),
  personaIds: z.array(z.string().trim().min(1)).min(1, "Seleccioná al menos una persona."),
  confirmarSobrecupo: z.boolean().optional(),
});
