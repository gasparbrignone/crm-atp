import Papa from "papaparse";

// Importación desde Google Sheets — /14-importaciones-exportaciones.md
// sección 4: el usuario pega el enlace de una hoja compartida, el sistema la
// lee y expone sus columnas para el mismo mapeo que CSV. Se usa una API key
// (Google Sheets API), no OAuth: alcanza para hojas compartidas como
// "cualquiera con el link, lector" — decisión registrada con Gaspar
// (2026-08-01), ya que las planillas de trabajo de ATP se comparten así. Si
// en el futuro hiciera falta leer hojas privadas, ahí sí se necesitaría el
// flujo OAuth completo (fuera de alcance de esta implementación).

export class HojaDeCalculoNoAccesibleError extends Error {
  constructor() {
    super(
      "No se pudo leer la hoja. Verificá que el link sea correcto y que esté compartida como \"Cualquiera con el enlace puede ver\".",
    );
    this.name = "HojaDeCalculoNoAccesibleError";
  }
}

export function extraerIdDeSheets(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

function obtenerApiKey(): string {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) throw new Error("GOOGLE_SHEETS_API_KEY no está configurada.");
  return key;
}

export interface HojaDeCalculo {
  titulo: string;
  sheetId: number;
}

export async function listarHojas(spreadsheetId: string): Promise<HojaDeCalculo[]> {
  const apiKey = obtenerApiKey();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new HojaDeCalculoNoAccesibleError();

  const json = (await respuesta.json()) as {
    sheets?: { properties: { sheetId: number; title: string } }[];
  };
  return (json.sheets ?? []).map((s) => ({ titulo: s.properties.title, sheetId: s.properties.sheetId }));
}

// Convierte la hoja indicada a texto CSV para reusar exactamente el mismo
// flujo de mapeo/preview/procesamiento ya construido para archivos CSV
// subidos a mano (Fase 1/2) — sin duplicar esa lógica.
export async function obtenerHojaComoCsv(spreadsheetId: string, tituloHoja: string): Promise<string> {
  const apiKey = obtenerApiKey();
  const rango = encodeURIComponent(tituloHoja);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rango}?key=${apiKey}`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new HojaDeCalculoNoAccesibleError();

  const json = (await respuesta.json()) as { values?: string[][] };
  const filas = json.values ?? [];
  return Papa.unparse(filas);
}
