import { z } from "zod";

// Ver /05-modulo-personas.md sección 3.1 y sección 9 — única combinación
// verdaderamente obligatoria es nombre + apellido.
const opcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const personaFormSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  apellido: z.string().trim().min(1, "El apellido es obligatorio."),
  dni: opcional,
  legajo: opcional,
  carreraId: opcional,
  anio: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= 6), {
      message: "El año debe estar entre 1 y 6.",
    }),
  telefono: opcional,
  email: opcional.pipe(z.string().email("Email inválido.").optional()),
  // Se acepta con o sin "@"; se normaliza sin él — ver doc 05 sección 3.1.
  instagram: opcional.transform((v) => v?.replace(/^@/, "")),
  observacionesGenerales: opcional,
});

export type PersonaFormValues = z.infer<typeof personaFormSchema>;

export const filtrosPersonasSchema = z.object({
  q: opcional,
  carreraId: opcional,
  anio: opcional,
  estadoPadron: opcional,
  estadoFicha: opcional,
  pagina: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 1)),
  porPagina: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 50)),
});
