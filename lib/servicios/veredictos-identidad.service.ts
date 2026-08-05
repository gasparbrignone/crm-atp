import { prisma } from "@/lib/prisma/client";
import { calcularConfianzaIdentidad } from "@/lib/identidad/motor-scoring";

// Captura de veredictos humanos sobre pares evaluados por el Motor de
// Resolución de Identidad — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md
// sección 3.9. No decide nada: solo registra lo que un humano ya decidió
// (confirmar o rechazar una sugerencia de posible duplicado), para tener un
// corpus real con el que, más adelante, recalibrar `umbral_confianza_duplicados`
// contra casos reales en vez de solo el corpus sintético de
// lib/identidad/BENCHMARK-RESULTADOS.md (ver ese documento, limitación
// reconocida explícitamente ahí). Un fallo acá nunca debe impedir la
// operación real que lo dispara (confirmar un alta, vincular una entrada de
// padrón) — por eso cada caller la llama en paralelo o después de la
// operación principal, nunca como bloqueo previo.

export type ContextoVeredicto = "alta_manual" | "fusion_manual" | "padron";

interface RegistrarVeredictoInput {
  nombreObjetivo: string;
  candidatoNombreCompleto: string;
  candidatoId: string;
  decision: "misma_persona" | "distinta_persona";
  contexto: ContextoVeredicto;
  usuarioId: string | null;
}

// Recalcula la confianza en el momento de capturar el veredicto (no confía en
// un valor guardado antes, que puede estar ausente — ej. una entrada de
// padrón que nunca tuvo candidatos automáticos y un usuario vinculó a mano
// por búsqueda libre) — calcularConfianzaIdentidad es pura y barata (del
// orden de microsegundos, ver BENCHMARK-RESULTADOS.md), recalcularla acá no
// tiene costo real.
export async function registrarVeredictoIdentidad(input: RegistrarVeredictoInput) {
  const { confianza, explicacion } = calcularConfianzaIdentidad(
    input.nombreObjetivo,
    input.candidatoNombreCompleto,
  );

  return prisma.veredictoIdentidad.create({
    data: {
      nombreObjetivo: input.nombreObjetivo,
      candidatoId: input.candidatoId,
      confianza,
      explicacion: explicacion.join("; "),
      decision: input.decision,
      contexto: input.contexto,
      usuarioId: input.usuarioId,
    },
  });
}
