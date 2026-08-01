import { PDFDocument } from "pdf-lib";
import { obtenerClienteAnthropic, MODELO_IA_DOCUMENTOS } from "@/lib/ia/cliente-anthropic";

// Lectura automática de padrones en PDF — /15-ia.md sección 4 y
// /09-modulo-padron-electoral.md sección 4. En lugar de OCR + parsing con
// reglas rígidas, se usa la lectura nativa de documentos de Claude
// directamente sobre el PDF (tablas con alineación irregular, encabezados
// repetidos, páginas escaneadas como imagen). Se procesa en lotes de páginas
// (sección 10 de /15-ia.md: "no como una única llamada bloqueante sobre un
// documento completo"), tanto para acotar el tamaño de cada request como
// para que un error de lectura en un lote no arruine el documento entero.

const PAGINAS_POR_LOTE = 12;

export interface EntradaExtraidaPdf {
  dni: string | null;
  nombreCompleto: string;
  carrera: string | null;
  confianzaExtraccion: number;
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

async function leerLotePaginas(pdfBytes: Uint8Array): Promise<EntradaExtraidaPdf[]> {
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const cliente = obtenerClienteAnthropic();

  const respuesta = await cliente.messages.create({
    model: MODELO_IA_DOCUMENTOS,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `Este es un padrón electoral universitario (listado de personas habilitadas para votar). Extraé cada fila de persona que aparezca en estas páginas.

Para cada persona extraé: DNI (o null si no es legible/no está), nombre completo tal como figura en el original, carrera (si el documento la incluye, si no null), y un puntaje de confianza de extracción entre 0 y 1 — qué tan segura estás de haber leído bien ESA fila puntual (bajá el puntaje ante texto borroso, tachaduras, superposición, o cualquier ambigüedad de lectura). Esto es un puntaje de qué tan bien leíste el dato, no de si la persona existe en otro lado.

No inventes filas que no estén en el documento. Si una página no tiene datos de personas (portada, índice), no generes entradas para ella.

Respondé ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional:
{"entradas": [{"dni": "<dni o null>", "nombreCompleto": "<nombre tal como figura>", "carrera": "<carrera o null>", "confianzaExtraccion": <0 a 1>}]}`,
          },
        ],
      },
    ],
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === "text");
  if (!bloqueTexto || bloqueTexto.type !== "text") return [];

  const json = extraerJson(bloqueTexto.text) as { entradas?: EntradaExtraidaPdf[] } | null;
  return json?.entradas ?? [];
}

export interface ProgresoLectura {
  loteActual: number;
  totalLotes: number;
}

// Divide el PDF en lotes de páginas (pdf-lib, sin dependencias nativas) y
// procesa cada lote como un documento independiente. `onProgreso` permite a
// quien llama reportar avance (ej. loguear o actualizar un contador) mientras
// dura el procesamiento, ya que un padrón real puede tener muchas páginas.
export async function leerEntradasPadronPdf(
  pdfBuffer: Buffer,
  onProgreso?: (progreso: ProgresoLectura) => void,
): Promise<EntradaExtraidaPdf[]> {
  const documentoOriginal = await PDFDocument.load(pdfBuffer);
  const totalPaginas = documentoOriginal.getPageCount();
  const totalLotes = Math.ceil(totalPaginas / PAGINAS_POR_LOTE);

  const todasLasEntradas: EntradaExtraidaPdf[] = [];

  for (let lote = 0; lote < totalLotes; lote++) {
    const inicio = lote * PAGINAS_POR_LOTE;
    const fin = Math.min(inicio + PAGINAS_POR_LOTE, totalPaginas);

    const documentoLote = await PDFDocument.create();
    const indices = Array.from({ length: fin - inicio }, (_, i) => inicio + i);
    const paginas = await documentoLote.copyPages(documentoOriginal, indices);
    for (const pagina of paginas) documentoLote.addPage(pagina);

    const bytesLote = await documentoLote.save();
    const entradasLote = await leerLotePaginas(bytesLote);
    todasLasEntradas.push(...entradasLote);

    onProgreso?.({ loteActual: lote + 1, totalLotes });
  }

  return todasLasEntradas;
}
