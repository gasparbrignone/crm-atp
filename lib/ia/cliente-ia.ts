import { GoogleGenAI, ApiError } from "@google/genai";

// Única puerta de entrada al proveedor de IA — /15-ia.md sección 8 y
// /CLAUDE.md sección 3: toda función de IA pasa por acá, nunca instancia el
// SDK por su cuenta. Invocado siempre desde el servidor (Server
// Actions/servicios), nunca desde el cliente.
//
// Migrado de la API de Anthropic (Claude) a la API de Gemini (Google AI
// Studio) el 2026-08-02 — decisión de Gaspar tras quedarse sin saldo en la
// cuenta de Anthropic en medio de la carga real de padrones. Gemini tiene
// cuota gratuita para el volumen real de uso de ATP. Actualiza el supuesto S6
// de /01-vision-alcance.md — ver también /CLAUDE.md sección 7.
let cliente: GoogleGenAI | null = null;

export function obtenerClienteIA(): GoogleGenAI {
  if (!cliente) {
    cliente = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cliente;
}

// Modelo único para todas las tareas de este módulo (clasificación,
// comparación, extracción de texto de padrones) — Gemini Flash es el
// equivalente de Gemini a Haiku de Anthropic: rápido, barato, y dentro de la
// cuota gratuita de Google AI Studio para el volumen real de ATP.
export const MODELO_IA_LIVIANO = "gemini-2.5-flash";

// El SDK de Gemini no reintenta automáticamente 429/5xx como sí hacía el SDK
// de Anthropic — se implementa acá el mismo tipo de resiliencia ante picos de
// contención puntuales de la cuota gratuita.
function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generarConReintentos<T>(
  llamada: () => Promise<T>,
  intentos = 5,
): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 0; intento < intentos; intento++) {
    try {
      return await llamada();
    } catch (error) {
      ultimoError = error;
      const reintentable = error instanceof ApiError && (error.status === 429 || error.status >= 500);
      if (!reintentable || intento === intentos - 1) throw error;
      await esperar(1000 * 2 ** intento);
    }
  }
  throw ultimoError;
}
