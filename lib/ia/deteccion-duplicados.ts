import { prisma } from "@/lib/prisma/client";
import { evaluarCandidatos } from "@/lib/identidad/resolucion";

// Detección de duplicados — /15-ia.md sección 2. Señales por orden de
// confianza (sección 2.2): DNI/legajo idéntico (determinístico) > teléfono
// idéntico (determinístico) > nombre+apellido, resuelto desde el 2026-08-04
// por el Motor de Resolución de Identidad (/lib/identidad/, ver su README) —
// ya NO llama a ningún modelo de IA (ver justificación completa en
// /REVISION-CRITICA-AUDITORIA-2026-08-04.md sección 1.2). El archivo sigue
// viviendo acá y no en `lib/identidad/` porque es el punto de integración
// específico con el flujo de alta/importación de Personas descripto en este
// documento funcional, no el motor genérico en sí. REGLA NO NEGOCIABLE
// (sección 2.3): esto nunca fusiona nada solo. Sí puede dar de alta una
// Persona nueva cuando no hay absolutamente ningún candidato parecido —
// decisión registrada con Gaspar en /07-modulo-participaciones.md sección 7
// (2026-08-01): cuando alguien se inscribe a una actividad y no hay nadie
// remotamente similar ya cargado, es casi seguro una persona genuinamente
// nueva, y forzar revisión manual en ese caso solo agrega fricción sin
// reducir el riesgo real de duplicados. El caso que sí amerita ojo humano es
// el candidato *parecido pero dudoso* (nombre similar, no exacto): ahí es
// donde de verdad se puede duplicar a alguien que ya está cargado.

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

// Paso 1: DNI idéntico o teléfono idéntico y sin ambigüedad. Se separa del
// paso 2 (comparación por similitud de nombre) porque estas señales no
// requieren ningún cálculo de similitud — o coinciden exacto, o no.
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

interface CandidatoParaComparar {
  id: string;
  nombre: string;
  apellido: string;
  telefonos: string[];
  emails: string[];
}

async function obtenerCandidatosPorApellido(apellido: string): Promise<CandidatoParaComparar[]> {
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

// Paso 2 — Motor de Resolución de Identidad determinístico (ver
// /lib/identidad/README.md). Hasta el 2026-08-04 este paso llamaba a Gemini
// para juzgar si el candidato era la misma persona; se reemplazó por
// completo por algoritmos de similitud de string (Jaro-Winkler, Dice, token
// set/sort ratio, etc.) combinados en un motor de scoring explicable, sin
// ninguna llamada a IA. Motivo del cambio, no una preferencia estética: la
// IA barata usada acá no calibraba de forma estable una confianza numérica
// para "el apellido coincide pero el nombre no tiene nada que ver" (medido
// en producción: la misma comparación dio 60% una vez y 85% otra — ver
// /REVISION-CRITICA-AUDITORIA-2026-08-04.md sección 1.2). Una función
// determinística no puede tener ese problema por definición, y además ahora
// es testeable con casos fijos (ver tests/unit/identidad/). Sin DNI ni
// teléfono exacto disponible, si no hay ningún candidato con apellido
// parecido es alta nueva segura; si hay alguno pero la confianza calculada
// no alcanza el umbral, es un caso ambiguo para revisión humana.
async function buscarCoincidenciaPorSimilitudDeNombre(
  datos: DatosPersonaAComparar,
  umbral: number,
): Promise<ResultadoBusquedaPersona> {
  const candidatos = await obtenerCandidatosPorApellido(datos.apellido);
  if (candidatos.length === 0) return { tipo: "sin_candidatos" };

  const candidatosParaMostrar: CandidatoAmbiguo[] = candidatos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    apellido: c.apellido,
    telefono: c.telefonos[0] ?? null,
  }));

  const nombreObjetivo = `${datos.nombre} ${datos.apellido}`;
  const { mejor } = evaluarCandidatos(
    nombreObjetivo,
    candidatos.map((c) => ({ id: c.id, nombreCompleto: `${c.nombre} ${c.apellido}` })),
  );

  if (!mejor || mejor.confianza < umbral) {
    return {
      tipo: "ambiguo",
      motivo: mejor
        ? `Coincidencia de baja confianza (${Math.round(mejor.confianza * 100)}%): ${mejor.explicacion.join("; ")}`
        : "Ningún candidato parecido es razonablemente la misma persona.",
      candidatos: candidatosParaMostrar,
    };
  }

  return {
    tipo: "coincidencia",
    personaId: mejor.id,
    confianza: mejor.confianza,
    motivo: mejor.explicacion.join("; "),
  };
}

// Punto de entrada del módulo: intenta primero las señales determinísticas
// exactas (DNI/teléfono) antes de recurrir a la comparación por similitud de
// nombre — más barato en cómputo y suficiente cuando hay un identificador
// exacto disponible.
export async function buscarPersonaCoincidente(
  datos: DatosPersonaAComparar,
  umbral: number,
): Promise<ResultadoBusquedaPersona> {
  const coincidenciaDeterministica = await buscarCoincidenciaDeterministica(datos);
  if (coincidenciaDeterministica) return coincidenciaDeterministica;

  return buscarCoincidenciaPorSimilitudDeNombre(datos, umbral);
}
