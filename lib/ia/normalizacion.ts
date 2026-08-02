import { prisma } from "@/lib/prisma/client";
import { obtenerClienteIA, MODELO_IA_LIVIANO, generarConReintentos } from "@/lib/ia/cliente-ia";

// Normalización de datos — /15-ia.md sección 3. Se aplica automáticamente al
// guardar, no como paso separado que el usuario deba disparar. La mayoría de
// estas transformaciones son deterministas (no llaman a la IA); el matching
// semántico de carrera es la excepción, porque el catálogo es configurable y
// no se puede resolver con una tabla fija de sinónimos en código (ver
// /CLAUDE.md sección 4, "catálogos configurables, no hardcodeados").

// Partículas que se mantienen en minúscula salvo que sean la primera palabra
// del nombre — capitalización estándar de nombres propios en español.
const PARTICULAS_MINUSCULA = new Set(["de", "del", "la", "las", "los", "y"]);

export function normalizarNombrePropio(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((palabra, indice) => {
      const minuscula = palabra.toLowerCase();
      if (indice > 0 && PARTICULAS_MINUSCULA.has(minuscula)) return minuscula;
      // "Mc" + apellido (McDonald) — caso frecuente en apellidos angloparlantes.
      if (/^mc[a-záéíóúñ]/i.test(palabra)) {
        return "Mc" + minuscula.slice(2, 3).toUpperCase() + minuscula.slice(3);
      }
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join(" ");
}

// Formato internacional argentino (+54 9 ...) — asume celular, que es el caso
// abrumadoramente mayoritario en contactos de estudiantes. No intenta
// distinguir línea fija de celular (requeriría una tabla de códigos de área).
export function normalizarTelefono(texto: string): string {
  let digitos = texto.replace(/\D/g, "");
  if (!digitos) return texto.trim();

  if (digitos.startsWith("54")) digitos = digitos.slice(2);
  if (digitos.startsWith("9")) digitos = digitos.slice(1);
  if (digitos.startsWith("0")) digitos = digitos.slice(1);

  // Formato local común "<código de área>15<número>" (ej. "341 15 1234567")
  // — el "15" es un prefijo de celular que no existe en el formato
  // internacional, se elimina si aparece en esa posición.
  const conCodigoYQuince = digitos.match(/^(\d{2,4})15(\d{6,8})$/);
  if (conCodigoYQuince) digitos = conCodigoYQuince[1] + conCodigoYQuince[2];

  if (digitos.length < 8) return texto.trim();

  return `+54 9 ${digitos}`;
}

export function normalizarEmail(texto: string): string {
  return texto.replace(/\s+/g, "").toLowerCase();
}

function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas (acentos, diéresis)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function extraerJson(texto: string): unknown {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const UMBRAL_CONFIANZA_CARRERA = 0.75;

// Matching semántico de carrera contra el catálogo existente (ej.
// "Enfermeria", "Lic. en Enfermería", "ENF" → todas resuelven al mismo
// registro), en lugar de crear una entrada de catálogo nueva por cada
// variante de escritura, o dejar el dato sin cargar por una diferencia de
// formato. Devuelve undefined si no hay coincidencia razonable — preferible
// a asignar una carrera incorrecta silenciosamente.
export async function resolverCarreraSemantica(textoLibre: string): Promise<string | undefined> {
  const texto = textoLibre.trim();
  if (!texto) return undefined;

  const carreras = await prisma.carrera.findMany({ where: { activo: true } });
  if (carreras.length === 0) return undefined;

  const textoNormalizado = normalizarParaComparar(texto);
  const exacta = carreras.find((c) => normalizarParaComparar(c.nombre) === textoNormalizado);
  if (exacta) return exacta.id;

  const contiene = carreras.find(
    (c) =>
      normalizarParaComparar(c.nombre).includes(textoNormalizado) ||
      textoNormalizado.includes(normalizarParaComparar(c.nombre)),
  );
  if (contiene) return contiene.id;

  const prompt = `Tarea: decidir a qué carrera universitaria del catálogo corresponde un texto libre ingresado por un usuario (puede ser una abreviatura, un nombre parcial, o tener errores de tipeo).

Texto ingresado: "${texto}"

Catálogo de carreras:
${JSON.stringify(carreras.map((c) => ({ id: c.id, nombre: c.nombre })))}

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"carreraId": "<id de la carrera o null>", "confianza": <número entre 0 y 1>}`;

  const cliente = obtenerClienteIA();
  const respuesta = await generarConReintentos(() =>
    cliente.models.generateContent({
      model: MODELO_IA_LIVIANO,
      contents: prompt,
      config: { maxOutputTokens: 150, responseMimeType: "application/json" },
    }),
  );

  const texto2 = respuesta.text;
  if (!texto2) return undefined;

  const json = extraerJson(texto2) as
    | { carreraId: string | null; confianza: number }
    | null;
  if (!json || typeof json.confianza !== "number" || !json.carreraId) return undefined;
  if (json.confianza < UMBRAL_CONFIANZA_CARRERA) return undefined;
  if (!carreras.some((c) => c.id === json.carreraId)) return undefined;

  return json.carreraId;
}
