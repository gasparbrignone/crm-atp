import { z } from "zod";

// Ver /06-modulo-actividades.md sección 4.1 — campos del formulario de alta/edición.
const opcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

// Esquema base sin reglas cruzadas entre campos, para poder usar .partial() en
// la edición inline campo a campo (mismo patrón que /lib/validaciones/persona.validation.ts).
const actividadBaseSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  tipoActividadId: z.string().trim().min(1, "El tipo de actividad es obligatorio."),
  descripcion: opcional,
  fechaInicio: z
    .string()
    .trim()
    .min(1, "La fecha y hora de inicio son obligatorias.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha de inicio inválida."),
  fechaFin: opcional.refine(
    (v) => v === undefined || !Number.isNaN(Date.parse(v)),
    "Fecha de fin inválida.",
  ),
  modalidad: z.enum(["presencial", "virtual", "hibrida"]).default("presencial"),
  lugar: opcional,
  cupoMaximo: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine(
      (v) => v === undefined || (Number.isInteger(v) && v > 0),
      "El cupo debe ser un número entero mayor a 0.",
    ),
  responsableId: z.string().trim().min(1, "El responsable es obligatorio."),
  actividadPadreId: opcional,
  observaciones: opcional,
  // Carrera/año por defecto de la actividad (opcionales) — pedido de Gaspar
  // (2026-08-01): toda Persona que se inscriba acá recibe este valor solo si
  // no tiene uno cargado ya, sin importar la vía (manual, CSV, Sheets).
  carreraPorDefectoId: opcional,
  anioPorDefecto: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= 6), {
      message: "El año debe estar entre 1 y 6.",
    }),
});

// Validación completa — usada en el alta. La edición inline valida campo a
// campo con actividadCampoSchema y deja la regla cruzada (fechaFin >=
// fechaInicio) a cargo del servicio cuando aplica a un único campo. `lugar`
// es opcional sin condición, según /04-modelo-datos.md sección 6.1 (confirmado
// explícitamente por Gaspar).
export const actividadFormSchema = actividadBaseSchema.superRefine((data, ctx) => {
  if (data.fechaFin && new Date(data.fechaFin) < new Date(data.fechaInicio)) {
    ctx.addIssue({
      code: "custom",
      message: "La fecha de fin no puede ser anterior a la fecha de inicio.",
      path: ["fechaFin"],
    });
  }
});

export type ActividadFormValues = z.infer<typeof actividadBaseSchema>;

export const actividadCampoSchema = actividadBaseSchema.partial();

export const filtrosActividadesSchema = z.object({
  q: opcional,
  tipoActividadId: opcional,
  estado: opcional,
  modalidad: opcional,
  responsableId: opcional,
  vista: opcional,
  pagina: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 1)),
  porPagina: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 50)),
});
