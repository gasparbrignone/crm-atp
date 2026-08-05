// Lectura de padrones en PDF — determinística, sin IA, desde 2026-08-04.
//
// Hasta esta fecha, el paso de "estructurar el texto extraído del PDF en
// filas" (DNI, nombre, carrera) lo resolvía Gemini (ver git history de
// lib/ia/lectura-padron-pdf.ts, ya eliminado). Se reemplazó por completo
// después de que el proyecto de Google AI Studio quedara bloqueado
// ("PERMISSION_DENIED... contact support") con un padrón real a mitad de
// carga — el TERCER incidente real de disponibilidad de un proveedor de IA
// para este módulo puntual (Anthropic sin saldo 2026-08-02, cuota diaria de
// Gemini agotada 2026-08-03, proyecto de Gemini bloqueado 2026-08-04).
//
// La razón de fondo para el reemplazo no es solo la disponibilidad: al
// inspeccionar el texto real extraído de un padrón real (`unpdf`, sin
// ningún procesamiento), el formato resultó ser un reporte tabular
// perfectamente regular línea por línea —
//   "<Nº> <Apellido, Nombre> <CARRERA EN MAYÚSCULA> <Legajo o \"-\"> <Documento> <Calidad>"
// — no el "layout irregular" que la documentación original asumía
// (corregido en /15-ia.md sección 4.1). Es exactamente el caso que
// /CLAUDE.md sección 4 describe como el que NO amerita IA: "un algoritmo
// determinístico siempre que la tarea sea estructuralmente bien definida".
// Validado contra el padrón real de Medicina (Reporte Padrón de Consejo
// Directivo, 79 páginas): **5356/5356 filas extraídas correctamente**, el
// mismo número que antes solo se lograba con Gemini y un tamaño de lote muy
// ajustado (ver el bug histórico de pérdida de filas documentado más abajo).
//
// Precisión ≠ 100% garantizada para SIEMPRE: si algún padrón futuro viene en
// un formato distinto (otra carrera, otro reporte de origen), las líneas que
// no calcen con el patrón esperado no se pierden silenciosamente — quedan
// reportadas como "línea no reconocida" (ver parsearLotePadron), mismo
// mecanismo de "nunca fallar en silencio" que el resto del proyecto. Si eso
// llegara a pasar con volumen real, hay que mirar el patrón nuevo y ajustar
// esta función — no reintroducir IA como parche.

export interface EntradaExtraidaPdf {
  dni: string | null;
  nombreCompleto: string;
  carrera: string | null;
  // Se mantiene por compatibilidad con resolverDatosMatchingEntrada()
  // (padron.service.ts), que decide si una fila con confianza de extracción
  // baja debe forzarse a revisión manual — ver /15-ia.md sección 4.2. Un
  // parser determinístico no tiene "casi seguro" intermedio: si la línea
  // matcheó el patrón esperado, se extrajo bien (1); si no matcheó, no
  // genera una entrada, queda en `lineasNoReconocidas` (ver más abajo).
  confianzaExtraccion: 1;
}

export interface ResultadoParseoLote {
  entradas: EntradaExtraidaPdf[];
  lineasNoReconocidas: string[];
}

// El PDF no tiene texto seleccionable (ej. escaneado como imagen) — este
// lector no hace OCR/lectura de imagen. Los padrones que carga ATP son
// siempre PDF con texto seleccionable (confirmado con Gaspar, 2026-08-02);
// si algún día no lo fuera, falla explícito en vez de devolver 0 filas
// silenciosamente.
export class PdfSinTextoSeleccionableError extends Error {
  constructor() {
    super(
      "Este PDF no tiene texto seleccionable (parece un escaneo o imagen). Este importador solo lee PDFs con texto seleccionable.",
    );
    this.name = "PdfSinTextoSeleccionableError";
  }
}

// Mismo tamaño de lote que en la versión con IA — ya no hace falta por
// límite de cuota (no hay llamadas externas), pero se mantiene para no
// romper la experiencia de "barra de progreso" del cliente durante padrones
// grandes, y como cota razonable de trabajo por request de servidor.
const CARACTERES_POR_LOTE = 24000;

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

// Divide el PDF en lotes de texto — sigue siendo dos etapas (preparar +
// procesar lote por lote) por el resto del pipeline (matching contra la
// base, ver padron.service.ts), no por esta extracción en sí, que hoy es
// prácticamente instantánea.
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

// Líneas de encabezado/filtro que el reporte repite en cada página — no son
// datos de ninguna persona, se descartan sin reportarlas como "no
// reconocidas" (no es un error, es ruido esperado del formato del reporte).
const PATRON_LINEA_ENCABEZADO =
  /^(Reporte |Filtro$|Todas las |Ubicación es|Responsable |Propuesta es|Fecha (Desde|Hasta)|Cantidad de Materias|Egreso Desde|Año Académico|Solo Reinscriptos|Forma de Aprobaci|Nº Nombre)/;

// Formato real de fila, validado contra el padrón real de Medicina
// (5356/5356 filas): "<Nº> <Apellido, Nombre> <CARRERA> <Legajo> <Documento> <Calidad>".
// - Documento: numérico (DNI argentino, 6-8 dígitos habitual) o alfanumérico
//   (documentos extranjeros vistos en datos reales: "Ba500358", "Gk666670" —
//   estudiantes extranjeros con documento de su país de origen, no DNI
//   argentino puro). 6-12 caracteres cubre ambos casos vistos.
// - Legajo: "-" (sin legajo asignado todavía) o formato "<letra>-<núm>/<núm>".
// - Calidad: una sola letra (A = apto, P = pendiente de algo, según el
//   propio reporte de origen — no se interpreta acá, se guarda tal cual el
//   dato en observaciones si hiciera falta en el futuro, hoy no se usa).
const PATRON_FILA = /^(\d+)\s+(.+?)\s+(-|[A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ0-9\-/]*)\s+([A-Za-z0-9]{6,12})\s+([A-Za-z])\s*$/;

// Un token cuenta como parte de la CARRERA (no del nombre) si está
// completamente en mayúsculas y tiene 3+ caracteres — el piso de 3 excluye
// iniciales sueltas de nombre compuesto que por casualidad son una letra
// mayúscula suelta (caso real encontrado en los datos: "Fils-Aimé, Marie
// Gérarda J MEDICINA", donde "J" es parte del nombre, no de la carrera).
// Ninguna carrera real de la facultad tiene una palabra de 1-2 letras.
function esTokenDeCarrera(token: string): boolean {
  return token.length >= 3 && token === token.toUpperCase() && /^[A-ZÑÁÉÍÓÚ]+$/.test(token);
}

// Separa "Apellido, Nombre CARRERA" (un solo string capturado por
// PATRON_FILA) en nombre completo y carrera, caminando desde el final
// mientras los tokens sean "de carrera" (mayúsculas, 3+ caracteres) — cubre
// carreras de más de una palabra (ej. "TERAPIA OCUPACIONAL").
function separarNombreYCarrera(nombreYCarrera: string): { nombre: string; carrera: string | null } {
  const tokens = nombreYCarrera.trim().split(/\s+/);
  let i = tokens.length;
  while (i > 0 && esTokenDeCarrera(tokens[i - 1])) i--;
  const carrera = tokens.slice(i).join(" ");
  const nombre = tokens.slice(0, i).join(" ");
  return { nombre, carrera: carrera || null };
}

function parsearFilaPadron(linea: string): EntradaExtraidaPdf | null {
  const match = linea.match(PATRON_FILA);
  if (!match) return null;

  // El legajo (grupo 3) y la calidad (grupo 5) no se usan hoy — ver
  // comentario de PATRON_FILA — no se destructuran para no arrastrar
  // variables sin uso.
  const [, , nombreYCarrera, , documento] = match;

  const { nombre, carrera } = separarNombreYCarrera(nombreYCarrera);
  if (!nombre || !nombre.includes(",")) return null; // sin la coma "Apellido, Nombre" no hay separación confiable

  return {
    dni: documento,
    nombreCompleto: nombre,
    carrera,
    confianzaExtraccion: 1,
  };
}

// Punto de entrada: parsea un lote de texto (ya extraído por
// prepararLotesPadronPdf) en filas de persona. Nunca lanza excepción por una
// línea individual rara — las líneas que no matchean el patrón esperado
// quedan en `lineasNoReconocidas` para que el llamador las reporte como
// omitidas (mismo mecanismo de "nunca fallar en silencio" que el resto del
// proyecto — ver padron.service.ts), en vez de perderlas.
export function parsearLotePadron(texto: string): ResultadoParseoLote {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const entradas: EntradaExtraidaPdf[] = [];
  const lineasNoReconocidas: string[] = [];

  for (const linea of lineas) {
    if (PATRON_LINEA_ENCABEZADO.test(linea)) continue;
    const entrada = parsearFilaPadron(linea);
    if (entrada) entradas.push(entrada);
    else lineasNoReconocidas.push(linea);
  }

  return { entradas, lineasNoReconocidas };
}
