// Campos de Persona importables desde CSV — /05-modulo-personas.md sección 3.1.
export const CAMPOS_PERSONA_IMPORTABLES = [
  "nombre",
  "apellido",
  "dni",
  "legajo",
  "telefono",
  "email",
  "instagram",
  "carreraTexto",
  "observacionesGenerales",
] as const;

export type CampoPersonaImportable = (typeof CAMPOS_PERSONA_IMPORTABLES)[number];

export const ETIQUETA_CAMPO_PERSONA: Record<CampoPersonaImportable, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  dni: "DNI",
  legajo: "Legajo",
  telefono: "Teléfono",
  email: "Email",
  instagram: "Instagram",
  carreraTexto: "Carrera (por nombre)",
  observacionesGenerales: "Observaciones generales",
};

const SINONIMOS: Record<CampoPersonaImportable, string[]> = {
  nombre: ["nombre", "first name", "firstname", "name"],
  apellido: ["apellido", "last name", "lastname", "surname"],
  dni: ["dni", "documento", "nro documento", "numero de documento", "nrodocumento"],
  legajo: ["legajo", "nro legajo"],
  telefono: ["telefono", "celular", "whatsapp", "phone", "tel"],
  email: ["email", "correo", "mail", "e-mail", "correo electronico"],
  instagram: ["instagram", "ig", "usuario instagram"],
  carreraTexto: ["carrera", "career"],
  observacionesGenerales: ["observaciones", "notas", "comentarios", "observaciones generales"],
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes (marcas diacríticas combinantes)
    .toLowerCase()
    .trim();
}

// Sugerencia de mapeo por coincidencia exacta de nombre normalizado — sin IA
// (la Fase 1 explícitamente no incluye matching inteligente, ver
// /20-roadmap.md Fase 1 y Fase 7/8 para las versiones asistidas por IA).
export function sugerirMapeo(encabezados: string[]): Record<string, CampoPersonaImportable | ""> {
  const mapeo: Record<string, CampoPersonaImportable | ""> = {};
  for (const encabezado of encabezados) {
    const normalizado = normalizar(encabezado);
    const campo = (Object.entries(SINONIMOS) as [CampoPersonaImportable, string[]][]).find(
      ([, sinonimos]) => sinonimos.includes(normalizado),
    )?.[0];
    mapeo[encabezado] = campo ?? "";
  }
  return mapeo;
}
