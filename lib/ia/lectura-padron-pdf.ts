import {
  obtenerClienteIA,
  MODELO_IA_LIVIANO,
  SIN_PENSAMIENTO,
  generarConReintentos,
} from "@/lib/ia/cliente-ia";

// Lectura automática de padrones en PDF — /15-ia.md sección 4 y
// /09-modulo-padron-electoral.md sección 4. Los padrones que carga ATP son
// siempre PDF con texto seleccionable (nunca escaneados/foto — confirmado
// con Gaspar, 2026-08-02), así que en vez de mandarle a la IA una imagen de
// cada página (caro, y con el volumen de un padrón real se corta la
// respuesta a mitad de camino — bug real detectado el mismo día, ver
// CLAUDE.md), se extrae el texto seleccionable directo del PDF y se le pasa
// como texto a la IA solo para estructurarlo en filas — mucho más barato,
// más rápido, y sin el riesgo de truncamiento de la lectura por imagen.
//
// Se usa `unpdf` (no `pdf-parse`/`pdfjs-dist` directo): pdfjs-dist intenta
// cargar un addon nativo (@napi-rs/canvas) para polyfillear Canvas/DOMMatrix
// incluso para extracción de texto pura, y ese addon nativo no queda
// disponible en el runtime serverless de Vercel pase lo que se configure en
// next.config — rompió /padron, /personas y /punteo en producción (bug real
// 2026-08-02, ver CLAUDE.md). `unpdf` empaqueta su propio build de
// pdfjs-dist pensado específicamente para entornos serverless/edge, sin esa
// dependencia nativa. Se importa dinámicamente igual, como capa extra de
// aislamiento para que un problema futuro de esta dependencia quede acotado
// a esta única acción.

// Lotes de ~6-7 páginas cada uno. Se probó subir esto a ~13 páginas por lote
// (40.000 caracteres) para necesitar menos requests contra la cuota gratuita
// de Gemini (15 req/min, ver cliente-ia.ts) — pero con lotes más grandes el
// modelo (gemini-3.1-flash-lite) empezó a saltear filas silenciosamente: en
// el padrón real de Medicina, pasó de extraer las 5356 filas correctas
// (con este tamaño de lote) a solo 4744 con lotes más grandes — una pérdida
// real de ~600 personas del padrón, sin ningún error ni truncamiento que lo
// avisara. Para un padrón que define quién puede votar, la exactitud pesa
// más que ahorrar requests, así que se vuelve a este tamaño (probado
// correcto dos veces) y el problema de la cuota se resuelve con el
// limitador de tasa de cliente-ia.ts, no agrandando el lote.
const CARACTERES_POR_LOTE = 24000;
const MAX_TOKENS_LECTURA = 32768;

export interface EntradaExtraidaPdf {
  dni: string | null;
  nombreCompleto: string;
  carrera: string | null;
  confianzaExtraccion: number;
}

export class LecturaPdfTruncadaError extends Error {
  constructor(public lote: number) {
    super(
      `La IA no terminó de leer el lote ${lote} del padrón (la respuesta se cortó por longitud). Reintentá.`,
    );
    this.name = "LecturaPdfTruncadaError";
  }
}

export class LecturaPdfSinFormatoError extends Error {
  constructor(public lote: number) {
    super(`No se pudo interpretar la respuesta de la IA para el lote ${lote} del padrón.`);
    this.name = "LecturaPdfSinFormatoError";
  }
}

// El PDF no tiene texto seleccionable (ej. escaneado como imagen) — este
// lector no hace OCR/lectura de imagen (ver nota arriba). Falla explícito en
// vez de devolver silenciosamente 0 entradas, mismo espíritu que el resto de
// los errores de este archivo.
export class PdfSinTextoSeleccionableError extends Error {
  constructor() {
    super(
      "Este PDF no tiene texto seleccionable (parece un escaneo o imagen). Este importador solo lee PDFs con texto seleccionable.",
    );
    this.name = "PdfSinTextoSeleccionableError";
  }
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

// Agrupa el texto por página en lotes de hasta CARACTERES_POR_LOTE, sin
// cortar una página a la mitad (una fila de padrón nunca cruza una página).
function agruparEnLotes(textoPorPagina: string[]): string[] {
  const lotes: string[] = [];
  let loteActual = "";

  for (const texto of textoPorPagina) {
    if (loteActual && loteActual.length + texto.length > CARACTERES_POR_LOTE) {
      lotes.push(loteActual);
      loteActual = "";
    }
    loteActual += (loteActual ? "\n" : "") + texto;
  }
  if (loteActual) lotes.push(loteActual);

  return lotes;
}

// Intentos por lote (no confundir con los reintentos de generarConReintentos,
// que cubren errores de transporte/cuota — 429, 5xx). Una respuesta vacía o
// con JSON mal formado no tira una excepción de la API: llega como un 200
// normal que simplemente no se puede interpretar (visto en producción
// 2026-08-02, sin relación con la cuota). Tratarlo como error final de una
// vez perdía el lote entero por un tropiezo puntual del modelo — se
// reintenta la extracción unas veces más antes de rendirse.
const INTENTOS_POR_LOTE = 3;

async function leerLoteTexto(texto: string, numeroLote: number): Promise<EntradaExtraidaPdf[]> {
  const cliente = obtenerClienteIA();

  let ultimoError: LecturaPdfTruncadaError | LecturaPdfSinFormatoError | null = null;

  for (let intento = 0; intento < INTENTOS_POR_LOTE; intento++) {
    const respuesta = await generarConReintentos(() =>
      cliente.models.generateContent({
        model: MODELO_IA_LIVIANO,
        contents: `Este es texto extraído de un padrón electoral universitario (listado de personas habilitadas para votar), tal como aparece en el PDF original — el orden de lectura por columna puede venir levemente desordenado.

Texto:
${texto}

Extraé cada fila de persona. Para cada una: DNI (o null si no está o no es legible), nombre completo tal como figura en el original, carrera (si el texto la incluye, si no null), y un puntaje de confianza de extracción entre 0 y 1 — qué tan segura estás de haber separado bien esa fila puntual (bajá el puntaje si el texto parece mezclado entre columnas o filas). No inventes filas que no estén en el texto. Copiá cada nombre letra por letra, exactamente como aparece en el texto — no agregues, dupliques ni corrijas ninguna letra.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"entradas": [{"dni": "<dni o null>", "nombreCompleto": "<nombre tal como figura>", "carrera": "<carrera o null>", "confianzaExtraccion": <0 a 1>}]}`,
        config: {
          maxOutputTokens: MAX_TOKENS_LECTURA,
          responseMimeType: "application/json",
          thinkingConfig: SIN_PENSAMIENTO,
        },
      }),
    );

    // Cortada por longitud: NO tratar como "sin entradas" — eso es
    // indistinguible de un lote realmente vacío y llevó al bug real
    // documentado arriba.
    if (respuesta.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      ultimoError = new LecturaPdfTruncadaError(numeroLote);
      continue;
    }

    const texto2 = respuesta.text;
    if (!texto2) {
      ultimoError = new LecturaPdfSinFormatoError(numeroLote);
      continue;
    }

    const json = extraerJson(texto2) as { entradas?: EntradaExtraidaPdf[] } | null;
    if (!json || !Array.isArray(json.entradas)) {
      ultimoError = new LecturaPdfSinFormatoError(numeroLote);
      continue;
    }
    return json.entradas;
  }

  throw ultimoError;
}

// Divide el PDF en lotes de texto, sin llamar a la IA todavía. Se separa de
// la lectura en sí porque el procesamiento ahora es incremental — un lote
// por request de servidor — para no depender de ningún límite de duración de
// función (Vercel Hobby, el plan gratuito real de este proyecto, permite
// mucho menos que los varios minutos que puede tardar leer un padrón real
// contra la cuota gratuita de Gemini; ver /15-ia.md sección 8 y
// padron.service.ts). El PDF se vuelve a parsear en cada request de un lote
// (rápido, es solo extracción de texto, no IA) para no tener que persistir
// el texto completo entre requests.
export async function prepararLotesPadronPdf(pdfBuffer: Buffer): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const documento = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text: textoPorPagina } = await extractText(documento, { mergePages: false });

  const totalCaracteres = textoPorPagina.reduce((acc, t) => acc + t.trim().length, 0);
  const promedioCaracteresPorPagina = totalCaracteres / Math.max(1, textoPorPagina.length);
  if (promedioCaracteresPorPagina < 20) {
    throw new PdfSinTextoSeleccionableError();
  }

  return agruparEnLotes(textoPorPagina);
}

// Lee un único lote (0-indexado) ya preparado por prepararLotesPadronPdf().
export async function leerLotePadronPdf(
  lotes: string[],
  indice: number,
): Promise<EntradaExtraidaPdf[]> {
  return leerLoteTexto(lotes[indice], indice + 1);
}
