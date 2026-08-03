import { prisma } from "@/lib/prisma/client";
import {
  obtenerClienteIA,
  MODELO_IA_LIVIANO,
  SIN_PENSAMIENTO,
  generarConReintentos,
} from "@/lib/ia/cliente-ia";

// Detección de duplicados — /15-ia.md sección 2. Señales por orden de
// confianza (sección 2.2): DNI/legajo idéntico (determinístico, no
// probabilístico) > teléfono idéntico > nombre+apellido con alta similitud,
// reforzado por IA quien decide fila por fila si es probable que sea la
// misma persona. REGLA NO NEGOCIABLE (sección 2.3): esto nunca fusiona nada
// solo. Sí puede dar de alta una Persona nueva cuando no hay absolutamente
// ningún candidato parecido — decisión registrada con Gaspar en
// /07-modulo-participaciones.md sección 7 (2026-08-01): cuando alguien se
// inscribe a una actividad y no hay nadie remotamente similar ya cargado, es
// casi seguro una persona genuinamente nueva, y forzar revisión manual en
// ese caso solo agrega fricción sin reducir el riesgo real de duplicados.
// El caso que sí amerita ojo humano es el candidato *parecido pero dudoso*
// (nombre similar, no exacto): ahí es donde de verdad se puede duplicar a
// alguien que ya está cargado.

export interface DatosPersonaAComparar {
  nombre: string;
  apellido: string;
  telefono?: string;
  email?: string;
  dni?: string;
}

export interface CandidatoAmbiguo {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
}

export type ResultadoBusquedaPersona =
  | { tipo: "coincidencia"; personaId: string; confianza: number; motivo: string }
  | { tipo: "sin_candidatos" }
  | { tipo: "ambiguo"; motivo: string; candidatos: CandidatoAmbiguo[] };

function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "").replace(/^0+/, "");
}

export async function obtenerUmbralConfianzaDuplicados(): Promise<number> {
  const config = await prisma.configuracionSistema.findUnique({
    where: { clave: "umbral_confianza_duplicados" },
  });
  const valor = config ? Number(config.valor) : NaN;
  return Number.isFinite(valor) ? valor : 0.7;
}

// Paso 1 (determinístico, sin IA): DNI idéntico o teléfono idéntico y sin
// ambigüedad. Se separa de la búsqueda asistida por IA porque estas señales
// no requieren juicio — o coinciden exacto, o no.
async function buscarCoincidenciaDeterministica(
  datos: DatosPersonaAComparar,
): Promise<ResultadoBusquedaPersona | null> {
  if (datos.dni) {
    const porDni = await prisma.persona.findFirst({
      where: { dni: datos.dni, estadoFicha: { not: "fusionada" } },
    });
    if (porDni) {
      return { tipo: "coincidencia", personaId: porDni.id, confianza: 1, motivo: "DNI idéntico" };
    }
  }

  if (datos.telefono) {
    const telefonoNormalizado = normalizarTelefono(datos.telefono);
    if (telefonoNormalizado.length >= 6) {
      const telefonos = await prisma.personaTelefono.findMany({
        where: { persona: { estadoFicha: { not: "fusionada" } } },
        select: { numero: true, personaId: true },
      });
      const personaIdsCoincidentes = new Set(
        telefonos
          .filter((t) => normalizarTelefono(t.numero) === telefonoNormalizado)
          .map((t) => t.personaId),
      );
      if (personaIdsCoincidentes.size === 1) {
        return {
          tipo: "coincidencia",
          personaId: [...personaIdsCoincidentes][0],
          confianza: 0.9,
          motivo: "Teléfono idéntico",
        };
      }
      // Ambiguo (más de una Persona con ese teléfono) o sin match: sigue al
      // paso asistido por IA, que ya usa nombre+apellido como desempate.
    }
  }

  return null;
}

interface CandidatoIa {
  id: string;
  nombre: string;
  apellido: string;
  telefonos: string[];
  emails: string[];
}

async function obtenerCandidatosPorApellido(apellido: string): Promise<CandidatoIa[]> {
  const prefijo = apellido.trim().slice(0, 3);
  if (prefijo.length < 2) return [];

  const candidatos = await prisma.persona.findMany({
    where: {
      estadoFicha: { not: "fusionada" },
      apellido: { startsWith: prefijo, mode: "insensitive" },
    },
    include: { telefonos: true, emails: true },
    take: 20,
  });

  return candidatos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    telefonos: p.telefonos.map((t) => t.numero),
    emails: p.emails.map((e) => e.email),
  }));
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

// Paso 2 (asistido por IA): sin DNI ni teléfono exacto disponible, se le pide
// al modelo que compare la fila contra un conjunto acotado de candidatos por
// apellido similar — nunca se le manda la base completa de Personas
// (minimización de datos, /16-seguridad.md). Si no hay ningún candidato ni
// remotamente parecido, es alta nueva segura; si hay alguno pero la IA no
// tiene confianza suficiente, es un caso ambiguo para revisión humana.
async function buscarCoincidenciaAsistidaPorIa(
  datos: DatosPersonaAComparar,
  umbral: number,
): Promise<ResultadoBusquedaPersona> {
  const candidatos = await obtenerCandidatosPorApellido(datos.apellido);
  if (candidatos.length === 0) return { tipo: "sin_candidatos" };

  const prompt = `Tarea: decidir si una fila de un formulario de inscripción corresponde a alguna persona ya cargada en el sistema.

Fila nueva:
${JSON.stringify({ nombre: datos.nombre, apellido: datos.apellido, telefono: datos.telefono ?? null, email: datos.email ?? null })}

Personas candidatas ya cargadas (mismo apellido o similar):
${JSON.stringify(candidatos)}

Considerá errores de tipeo, variantes de escritura (acentos, "Gonzalez"/"González") y apodos comunes. Si ninguna candidata es razonablemente la misma persona, decilo explícitamente.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"personaId": "<id de la candidata o null>", "confianza": <número entre 0 y 1>, "motivo": "<explicación breve en español>"}`;

  const cliente = obtenerClienteIA();
  const respuesta = await generarConReintentos(() =>
    cliente.models.generateContent({
      model: MODELO_IA_LIVIANO,
      contents: prompt,
      config: {
        maxOutputTokens: 300,
        responseMimeType: "application/json",
        thinkingConfig: SIN_PENSAMIENTO,
      },
    }),
  );

  const candidatosParaMostrar: CandidatoAmbiguo[] = candidatos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    apellido: c.apellido,
    telefono: c.telefonos[0] ?? null,
  }));

  const texto = respuesta.text;
  if (!texto) {
    return {
      tipo: "ambiguo",
      motivo: "No se pudo interpretar la respuesta de la IA.",
      candidatos: candidatosParaMostrar,
    };
  }

  const json = extraerJson(texto) as
    | { personaId: string | null; confianza: number; motivo: string }
    | null;

  if (!json || typeof json.confianza !== "number") {
    return {
      tipo: "ambiguo",
      motivo: "No se pudo interpretar la respuesta de la IA.",
      candidatos: candidatosParaMostrar,
    };
  }
  if (!json.personaId || !candidatos.some((c) => c.id === json.personaId)) {
    // La IA vio candidatos con apellido parecido pero no encontró ninguno
    // razonable — hay al menos una persona similar cargada, así que se
    // prefiere revisión humana antes que un alta automática que podría
    // duplicarla.
    return {
      tipo: "ambiguo",
      motivo: json.motivo ?? "Ningún candidato parecido es razonablemente la misma persona.",
      candidatos: candidatosParaMostrar,
    };
  }
  if (json.confianza < umbral) {
    return {
      tipo: "ambiguo",
      motivo: `Coincidencia de baja confianza (${Math.round(json.confianza * 100)}%): ${json.motivo}`,
      candidatos: candidatosParaMostrar,
    };
  }

  return { tipo: "coincidencia", personaId: json.personaId, confianza: json.confianza, motivo: json.motivo };
}

// Punto de entrada del módulo: intenta primero las señales determinísticas
// (gratis, sin llamar a la IA) y solo recurre a la IA cuando hace falta
// juicio sobre variantes de nombre — así se minimiza el costo real de uso
// (/15-ia.md sección 10).
export async function buscarPersonaCoincidente(
  datos: DatosPersonaAComparar,
  umbral: number,
): Promise<ResultadoBusquedaPersona> {
  const coincidenciaDeterministica = await buscarCoincidenciaDeterministica(datos);
  if (coincidenciaDeterministica) return coincidenciaDeterministica;

  return buscarCoincidenciaAsistidaPorIa(datos, umbral);
}
