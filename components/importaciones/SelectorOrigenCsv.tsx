"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

interface Hoja {
  titulo: string;
  sheetId: number;
}

export interface DatosCsvCargado {
  nombreArchivo: string;
  contenidoCsv: string;
  encabezados: string[];
  filasPreview: Record<string, string>[];
}

interface SelectorOrigenCsvProps {
  onCargado: (datos: DatosCsvCargado) => void;
  listarHojasAction: (urlHoja: string) => Promise<{ spreadsheetId: string; hojas: Hoja[] }>;
  obtenerHojaCsvAction: (spreadsheetId: string, tituloHoja: string) => Promise<string>;
}

function parsearParaPreview(texto: string) {
  const parsed = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    preview: 5,
  });
  return { encabezados: parsed.meta.fields ?? [], filasPreview: parsed.data };
}

// Selector de origen compartido entre la importación de Personas (Fase 1) y
// de inscriptos a una Actividad (Fase 2) — /14-importaciones-exportaciones.md
// sección 4: Google Sheets se resuelve convirtiendo la hoja a texto CSV y
// reusando exactamente el mismo flujo de mapeo/preview ya construido para
// archivos subidos a mano, sin duplicar esa lógica en cada módulo.
export function SelectorOrigenCsv({
  onCargado,
  listarHojasAction,
  obtenerHojaCsvAction,
}: SelectorOrigenCsvProps) {
  const [origen, setOrigen] = useState<"archivo" | "sheets">("archivo");
  const [urlHoja, setUrlHoja] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaElegida, setHojaElegida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, iniciarTransicion] = useTransition();

  function onArchivoSeleccionado(archivo: File) {
    setError(null);
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result ?? "");
      const { encabezados, filasPreview } = parsearParaPreview(texto);
      onCargado({ nombreArchivo: archivo.name, contenidoCsv: texto, encabezados, filasPreview });
    };
    lector.readAsText(archivo, "UTF-8");
  }

  function buscarHojas() {
    setError(null);
    setHojas([]);
    setSpreadsheetId(null);
    iniciarTransicion(async () => {
      try {
        const resultado = await listarHojasAction(urlHoja);
        setSpreadsheetId(resultado.spreadsheetId);
        setHojas(resultado.hojas);
        if (resultado.hojas.length === 1) setHojaElegida(resultado.hojas[0].titulo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo leer la hoja.");
      }
    });
  }

  function importarHojaElegida() {
    if (!spreadsheetId || !hojaElegida) return;
    setError(null);
    iniciarTransicion(async () => {
      try {
        const contenidoCsv = await obtenerHojaCsvAction(spreadsheetId, hojaElegida);
        const { encabezados, filasPreview } = parsearParaPreview(contenidoCsv);
        onCargado({ nombreArchivo: `${hojaElegida} (Google Sheets)`, contenidoCsv, encabezados, filasPreview });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo leer la hoja.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-borde-chico border border-borde p-1">
        {(["archivo", "sheets"] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOrigen(o);
              setError(null);
            }}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              origen === o ? "bg-primario text-white" : "text-texto-secundario hover:bg-fondo-hover",
            )}
          >
            {o === "archivo" ? "Subir archivo" : "Google Sheets"}
          </button>
        ))}
      </div>

      {origen === "archivo" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-texto-secundario">
            La primera fila del archivo debe tener los nombres de columna.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) onArchivoSeleccionado(archivo);
            }}
            className="rounded-borde border border-borde p-3 text-sm"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            Pegá el link de la hoja. Tiene que estar compartida como &ldquo;Cualquiera con el
            enlace puede ver&rdquo;.
          </p>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-64 flex-1">
              <Input
                value={urlHoja}
                onChange={(e) => setUrlHoja(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </div>
            <Button onClick={buscarHojas} disabled={procesando || !urlHoja.trim()} variant="secundario">
              Buscar hojas
            </Button>
          </div>

          {hojas.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48">
                <Select
                  label="Pestaña"
                  value={hojaElegida}
                  onChange={(e) => setHojaElegida(e.target.value)}
                >
                  {hojas.map((h) => (
                    <option key={h.sheetId} value={h.titulo}>
                      {h.titulo}
                    </option>
                  ))}
                </Select>
              </div>
              <Button onClick={importarHojaElegida} disabled={procesando || !hojaElegida}>
                {procesando ? "Leyendo..." : "Usar esta hoja"}
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
