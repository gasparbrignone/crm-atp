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
// comparación, extracción de texto de padrones) — Flash-Lite es el
// equivalente de Gemini a Haiku de Anthropic: rápido, barato, y dentro de la
// cuota gratuita de Google AI Studio para el volumen real de ATP.
//
// "gemini-2.5-flash"/"gemini-2.5-flash-lite" devuelven 404 ("no longer
// available to new users") con una API key nueva creada después de la
// migración (2026-08-02, comprobado contra la cuenta real de Gaspar) — usar
// siempre el modelo vigente, no asumir el nombre por conocimiento previo.
export const MODELO_IA_LIVIANO = "gemini-3.1-flash-lite";

// Los modelos vigentes de Gemini piensan por defecto y esas "thoughts" salen
// del mismo presupuesto que maxOutputTokens — sin esto, un maxOutputTokens
// chico se gasta entero en pensar y no queda nada para la respuesta (mismo
// tipo de bug ya sufrido con el truncamiento de Anthropic). Ninguna tarea de
// este módulo necesita razonamiento profundo (son clasificación/comparación/
// extracción de texto), así que se desactiva siempre.
export const SIN_PENSAMIENTO = { thinkingBudget: 0 } as const;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Límite real de la cuota gratuita, medido contra la cuenta real de Gaspar
// (2026-08-02): 429 "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
// quotaValue 15, para gemini-3.1-flash-lite. Es un límite POR MINUTO y por
// modelo, compartido entre las cuatro funciones de lib/ia/ que usan
// MODELO_IA_LIVIANO — no alcanza con acotar la concurrencia de un solo lugar
// (como si fuera Anthropic, con miles de RPM pagos), hace falta un límite de
// tasa real compartido por todo el módulo. Se deja margen bajo el máximo real
// (15) para otras llamadas que puedan estar en vuelo en la misma ventana.
const VENTANA_LIMITE_MS = 60_000;
const MAX_LLAMADAS_POR_VENTANA = 12;
const historialLlamadas: number[] = [];

async function esperarCupo(): Promise<void> {
  for (;;) {
    const ahora = Date.now();
    while (historialLlamadas.length && historialLlamadas[0] <= ahora - VENTANA_LIMITE_MS) {
      historialLlamadas.shift();
    }
    if (historialLlamadas.length < MAX_LLAMADAS_POR_VENTANA) {
      historialLlamadas.push(ahora);
      return;
    }
    const espera = historialLlamadas[0] + VENTANA_LIMITE_MS - ahora + 100;
    await esperar(Math.max(espera, 100));
  }
}

// Además del límite propio, un 429 puntual (otra instancia serverless
// concurrente consumiendo la misma cuota, por ejemplo) trae el tiempo de
// espera real en el propio mensaje de error — se lo respeta en vez de un
// backoff fijo, porque la cuenta gratuita puede pedir esperar bastante más
// que un backoff exponencial corto (medido: hasta 56s reales).
function segundosDeEsperaSugeridos(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null;
  const match = error.message.match(/retry in (\d+(?:\.\d+)?)s/i);
  return match ? Number(match[1]) : null;
}

// Tope duro por espera de reintento: el mensaje de error puede sugerir
// esperar mucho más que esto (medido: hasta 56s reales) — pero encadenado
// con varios intentos y con la espera de esperarCupo(), eso puede sumar más
// de los 300s reales de duración de función de Vercel y morir sin ni
// siquiera terminar de reintentar (bug real 2026-08-02: dos lotes seguidos
// agotaron exactamente 300s). Mejor esperar menos y fallar rápido, dejando
// que quien llama (el cliente, reintentando el mismo lote) tenga una
// invocación nueva con su propio presupuesto de tiempo entero.
const TOPE_ESPERA_REINTENTO_MS = 20_000;

export class CuotaDiariaAgotadaError extends Error {
  constructor() {
    super(
      "Se agotó la cuota diaria gratuita de Gemini para hoy. Va a volver a funcionar automáticamente pasada la medianoche (hora del proyecto de Google), o podés aumentar el límite vinculando facturación en Google AI Studio.",
    );
    this.name = "CuotaDiariaAgotadaError";
  }
}

// Un 429 por cuota DIARIA (a diferencia de por-minuto) no se soluciona
// reintentando en segundos — encontrado en auditoría 2026-08-03: antes esto
// reintentaba igual hasta 3 veces (y cada llamador de generarConReintentos,
// como leerLoteTexto, reintenta otras 3 veces más arriba), quemando minutos
// reales contra un límite que no va a levantar hasta el día siguiente. El
// quotaId real que devuelve Google distingue "PerDay" de "PerMinute" — se
// falla rápido y explícito en el caso diario en vez de insistir a ciegas.
function esCuotaDiariaAgotada(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429 && /PerDay/i.test(error.message);
}

// Log estructurado de uso de IA — /REVISION-CRITICA-AUDITORIA-2026-08-04.md
// punto 4: no se justifica un dashboard ni una tabla nueva todavía (no hay
// evidencia de necesitarlo más allá de esto), pero el consumo de IA ya causó
// dos incidentes reales (cuenta de Anthropic sin saldo, cuota diaria de
// Gemini agotada) sin ninguna visibilidad de cuánto se estaba gastando
// mientras pasaba. Una línea por llamada, formato fijo y grepeable en
// Vercel Logs (`vercel logs`, filtrando por `[ia-uso]`), sin infraestructura
// nueva.
function logUsoIa(etiqueta: string, evento: "ok" | "error", duracionMs: number, detalle?: string) {
  const linea = { etiqueta, evento, duracionMs: Math.round(duracionMs), modelo: MODELO_IA_LIVIANO, detalle };
  if (evento === "error") console.error("[ia-uso]", JSON.stringify(linea));
  else console.log("[ia-uso]", JSON.stringify(linea));
}

export async function generarConReintentos<T>(
  llamada: () => Promise<T>,
  etiqueta = "sin-etiqueta",
  intentos = 3,
): Promise<T> {
  const inicio = Date.now();
  let ultimoError: unknown;
  for (let intento = 0; intento < intentos; intento++) {
    await esperarCupo();
    try {
      const resultado = await llamada();
      logUsoIa(etiqueta, "ok", Date.now() - inicio, intento > 0 ? `intento ${intento + 1}` : undefined);
      return resultado;
    } catch (error) {
      if (esCuotaDiariaAgotada(error)) {
        logUsoIa(etiqueta, "error", Date.now() - inicio, "cuota_diaria_agotada");
        throw new CuotaDiariaAgotadaError();
      }
      ultimoError = error;
      const reintentable = error instanceof ApiError && (error.status === 429 || error.status >= 500);
      if (!reintentable || intento === intentos - 1) {
        logUsoIa(etiqueta, "error", Date.now() - inicio, error instanceof Error ? error.message : "error desconocido");
        throw error;
      }
      const sugerido = segundosDeEsperaSugeridos(error);
      const espera = sugerido ? sugerido * 1000 + 500 : 1000 * 2 ** intento;
      await esperar(Math.min(espera, TOPE_ESPERA_REINTENTO_MS));
    }
  }
  throw ultimoError;
}
