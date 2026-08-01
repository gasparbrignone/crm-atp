import Anthropic from "@anthropic-ai/sdk";

// Única puerta de entrada a la API de Anthropic — /15-ia.md sección 8 y
// /CLAUDE.md sección 3: toda función de IA pasa por acá, nunca instancia el
// SDK por su cuenta. Invocado siempre desde el servidor (Server
// Actions/servicios), nunca desde el cliente.
let cliente: Anthropic | null = null;

export function obtenerClienteAnthropic(): Anthropic {
  if (!cliente) {
    cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cliente;
}

// Modelo por defecto para tareas de clasificación/comparación de bajo costo
// (detección de duplicados, normalización) — ver /15-ia.md sección 10, costos.
// Tareas de mayor complejidad (lectura de padrón en PDF, chatbot) pueden usar
// un modelo distinto en su propio módulo de lib/ia/.
export const MODELO_IA_LIVIANO = "claude-haiku-4-5-20251001";
