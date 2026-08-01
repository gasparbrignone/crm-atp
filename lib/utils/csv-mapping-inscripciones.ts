// Campos de inscripción a Actividad importables desde CSV —
// /07-modulo-participaciones.md sección 7. A diferencia de la importación de
// Personas (ver csv-mapping.ts), acá el DNI casi nunca viene en el
// formulario de origen: nombre, apellido y teléfono son los únicos campos
// que se pueden asumir siempre presentes.
export const CAMPOS_INSCRIPCION_IMPORTABLES = ["nombre", "apellido", "telefono", "email", "dni"] as const;

export type CampoInscripcionImportable = (typeof CAMPOS_INSCRIPCION_IMPORTABLES)[number];

export const ETIQUETA_CAMPO_INSCRIPCION: Record<CampoInscripcionImportable, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  telefono: "Teléfono",
  email: "Email",
  dni: "DNI",
};

const SINONIMOS: Record<CampoInscripcionImportable, string[]> = {
  nombre: ["nombre", "nombres", "first name", "firstname", "name"],
  apellido: ["apellido", "apellidos", "last name", "lastname", "surname"],
  telefono: ["telefono", "celular", "whatsapp", "phone", "tel", "numero", "numero de telefono"],
  email: ["email", "correo", "mail", "e-mail", "correo electronico"],
  dni: ["dni", "documento", "nro documento", "numero de documento", "nrodocumento"],
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function sugerirMapeoInscripcion(
  encabezados: string[],
): Record<string, CampoInscripcionImportable | ""> {
  const mapeo: Record<string, CampoInscripcionImportable | ""> = {};
  for (const encabezado of encabezados) {
    const normalizado = normalizar(encabezado);
    const campo = (Object.entries(SINONIMOS) as [CampoInscripcionImportable, string[]][]).find(
      ([, sinonimos]) => sinonimos.includes(normalizado),
    )?.[0];
    mapeo[encabezado] = campo ?? "";
  }
  return mapeo;
}
