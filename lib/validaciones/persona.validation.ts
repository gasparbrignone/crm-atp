import { z } from "zod";
import {
  normalizarNombrePropio,
  normalizarTelefonoParaGuardar,
  normalizarEmail,
} from "@/lib/ia/normalizacion";

// Ver /05-modulo-personas.md sección 3.1 y sección 9 — única combinación
// verdaderamente obligatoria es nombre + apellido.
const opcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

// Normalización automática al guardar (/15-ia.md sección 3) — se aplica acá
// porque este schema es el único punto de entrada compartido por el alta
// manual, la edición inline y la importación CSV/Sheets de Personas.
export const personaFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .transform(normalizarNombrePropio),
  apellido: z
    .string()
    .trim()
    .min(1, "El apellido es obligatorio.")
    .transform(normalizarNombrePropio),
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
  telefono: opcional.transform((v) => (v ? normalizarTelefonoParaGuardar(v) : v)),
  email: opcional
    .pipe(z.string().email("Email inválido.").optional())
    .transform((v) => (v ? normalizarEmail(v) : v)),
  // Se acepta con o sin "@"; se normaliza sin él — ver doc 05 sección 3.1.
  instagram: opcional.transform((v) => v?.replace(/^@/, "")),
  observacionesGenerales: opcional,
});

export type PersonaFormValues = z.infer<typeof personaFormSchema>;

export const filtrosPersonasSchema = z.object({
  q: opcional,
  carreraId: opcional,
  anio: opcional,
  estadoPadronCD: opcional,
  estadoPadronCE: opcional,
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
