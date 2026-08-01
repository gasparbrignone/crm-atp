import { prisma } from "@/lib/prisma/client";
import { obtenerClienteAnthropic, MODELO_IA_LIVIANO } from "@/lib/ia/cliente-anthropic";

// Detección de duplicados — /15-ia.md sección 2. Señales por orden de
// confianza (sección 2.2): DNI/legajo idéntico (determinístico, no
// probabilístico) > teléfono idéntico > nombre+apellido con alta similitud,
// reforzado por IA quien decide fila por fila si es probable que sea la
// misma persona. REGLA NO NEGOCIABLE (sección 2.3): esto nunca fusiona ni
// crea nada solo — devuelve una sugerencia con puntaje de confianza para que
// un humano decida.

export interface DatosPersonaAComparar {
  nombre: string;
  apellido: string;
  telefono?: string;
  email?: string;
  dni?: string;
}

export interface ResultadoCoincidencia {
  personaId: string;
  confianza: number;
  motivo: string;
}

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
): Promise<ResultadoCoincidencia | null> {
  if (datos.dni) {
    const porDni = await prisma.persona.findFirst({
      where: { dni: datos.dni, estadoFicha: { not: "fusionada" } },
    });
    if (porDni) return { personaId: porDni.id, confianza: 1, motivo: "DNI idéntico" };
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
// apellido similar y decida si alguno es, con razonable certeza, la misma
// persona — nunca se le manda la base completa de Personas (minimización de
// datos, /16-seguridad.md).
async function buscarCoincidenciaAsistidaPorIa(
  datos: DatosPersonaAComparar,
): Promise<ResultadoCoincidencia | null> {
  const candidatos = await obtenerCandidatosPorApellido(datos.apellido);
  if (candidatos.length === 0) return null;

  const prompt = `Tarea: decidir si una fila de un formulario de inscripción corresponde a alguna persona ya cargada en el sistema.

Fila nueva:
${JSON.stringify({ nombre: datos.nombre, apellido: datos.apellido, telefono: datos.telefono ?? null, email: datos.email ?? null })}

Personas candidatas ya cargadas (mismo apellido o similar):
${JSON.stringify(candidatos)}

Considerá errores de tipeo, variantes de escritura (acentos, "Gonzalez"/"González") y apodos comunes. Si ninguna candidata es razonablemente la misma persona, decilo explícitamente.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"personaId": "<id de la candidata o null>", "confianza": <número entre 0 y 1>, "motivo": "<explicación breve en español>"}`;

  const cliente = obtenerClienteAnthropic();
  const respuesta = await cliente.messages.create({
    model: MODELO_IA_LIVIANO,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === "text");
  if (!bloqueTexto || bloqueTexto.type !== "text") return null;

  const json = extraerJson(bloqueTexto.text) as
    | { personaId: string | null; confianza: number; motivo: string }
    | null;
  if (!json || !json.personaId || typeof json.confianza !== "number") return null;
  if (!candidatos.some((c) => c.id === json.personaId)) return null;

  return { personaId: json.personaId, confianza: json.confianza, motivo: json.motivo };
}

// Punto de entrada del módulo: intenta primero las señales determinísticas
// (gratis, sin llamar a la IA) y solo recurre a Claude cuando hace falta
// juicio sobre variantes de nombre — así se minimiza el costo real de uso
// (/15-ia.md sección 10).
export async function buscarPersonaCoincidente(
  datos: DatosPersonaAComparar,
): Promise<ResultadoCoincidencia | null> {
  const coincidenciaDeterministica = await buscarCoincidenciaDeterministica(datos);
  if (coincidenciaDeterministica) return coincidenciaDeterministica;

  return buscarCoincidenciaAsistidaPorIa(datos);
}
