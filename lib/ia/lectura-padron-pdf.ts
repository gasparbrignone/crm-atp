import { obtenerClienteAnthropic, MODELO_IA_LIVIANO } from "@/lib/ia/cliente-anthropic";

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

// ~90 filas de padrón por lote (a ~65 caracteres por fila) — deja margen
// generoso para que la respuesta en JSON nunca se acerque al límite de
// salida, evitando el bug de truncamiento silencioso ya sufrido con lotes
// más grandes.
const CARACTERES_POR_LOTE = 6000;
const MAX_TOKENS_LECTURA = 8192;

// Padrones reales de ATP corren decenas de páginas (~1 lote por página, ver
// medición 2026-08-01: Medicina dio 79 lotes) — leerlos en serie superaba el
// límite de 300s de la función serverless de Vercel (timeout real observado
// en producción, no hipotético). Se procesan en paralelo con este límite de
// concurrencia para no pasarse de los rate limits razonables de la cuenta de
// Anthropic mientras se corta el tiempo total a una fracción del que tomaría
// en serie.
const CONCURRENCIA_LECTURA = 20;

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

async function leerLoteTexto(texto: string, numeroLote: number): Promise<EntradaExtraidaPdf[]> {
  const cliente = obtenerClienteAnthropic();

  const respuesta = await cliente.messages.create({
    model: MODELO_IA_LIVIANO,
    max_tokens: MAX_TOKENS_LECTURA,
    messages: [
      {
        role: "user",
        content: `Este es texto extraído de un padrón electoral universitario (listado de personas habilitadas para votar), tal como aparece en el PDF original — el orden de lectura por columna puede venir levemente desordenado.

Texto:
${texto}

Extraé cada fila de persona. Para cada una: DNI (o null si no está o no es legible), nombre completo tal como figura en el original, carrera (si el texto la incluye, si no null), y un puntaje de confianza de extracción entre 0 y 1 — qué tan segura estás de haber separado bien esa fila puntual (bajá el puntaje si el texto parece mezclado entre columnas o filas). No inventes filas que no estén en el texto.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"entradas": [{"dni": "<dni o null>", "nombreCompleto": "<nombre tal como figura>", "carrera": "<carrera o null>", "confianzaExtraccion": <0 a 1>}]}`,
      },
    ],
  });

  // Cortada por longitud: NO tratar como "sin entradas" — eso es
  // indistinguible de un lote realmente vacío y llevó al bug real
  // documentado arriba. Mejor fallar fuerte y dejar que el usuario reintente.
  if (respuesta.stop_reason === "max_tokens") {
    throw new LecturaPdfTruncadaError(numeroLote);
  }

  const bloqueTexto = respuesta.content.find((b) => b.type === "text");
  if (!bloqueTexto || bloqueTexto.type !== "text") {
    throw new LecturaPdfSinFormatoError(numeroLote);
  }

  const json = extraerJson(bloqueTexto.text) as { entradas?: EntradaExtraidaPdf[] } | null;
  if (!json || !Array.isArray(json.entradas)) {
    throw new LecturaPdfSinFormatoError(numeroLote);
  }
  return json.entradas;
}

export interface ProgresoLectura {
  loteActual: number;
  totalLotes: number;
}

export async function leerEntradasPadronPdf(
  pdfBuffer: Buffer,
  onProgreso?: (progreso: ProgresoLectura) => void,
): Promise<EntradaExtraidaPdf[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const documento = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text: textoPorPagina } = await extractText(documento, { mergePages: false });

  const totalCaracteres = textoPorPagina.reduce((acc, t) => acc + t.trim().length, 0);
  const promedioCaracteresPorPagina = totalCaracteres / Math.max(1, textoPorPagina.length);
  if (promedioCaracteresPorPagina < 20) {
    throw new PdfSinTextoSeleccionableError();
  }

  const lotes = agruparEnLotes(textoPorPagina);
  const resultadosPorLote: EntradaExtraidaPdf[][] = new Array(lotes.length);
  let completados = 0;
  let siguienteIndice = 0;

  async function trabajador() {
    while (siguienteIndice < lotes.length) {
      const indice = siguienteIndice++;
      resultadosPorLote[indice] = await leerLoteTexto(lotes[indice], indice + 1);
      completados++;
      onProgreso?.({ loteActual: completados, totalLotes: lotes.length });
    }
  }

  const cantidadTrabajadores = Math.min(CONCURRENCIA_LECTURA, lotes.length);
  await Promise.all(Array.from({ length: cantidadTrabajadores }, trabajador));

  return resultadosPorLote.flat();
}
