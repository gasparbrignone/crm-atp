"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";
import {
  CAMPOS_PADRON_IMPORTABLES,
  ETIQUETA_CAMPO_PADRON,
  sugerirMapeoPadron,
  type CampoPadronImportable,
} from "@/lib/utils/csv-mapping-padron";
import { importarEntradasPadronCsvAction } from "./actions";

type Paso = "subir" | "mapear" | "resultado";

interface Resultado {
  procesadas: number;
  omitidas: number;
  totalFilas: number;
  filasOmitidas: { numeroFila: number; motivo: string }[];
}

// Carga de un padrón vía CSV/Excel exportado — /09-modulo-padron-electoral.md
// sección 4. La lectura nativa de PDF queda para la Fase 7.
export function ImportadorPadronCsv({ padronId }: { padronId: string }) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [contenidoCsv, setContenidoCsv] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, CampoPadronImportable | "">>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, iniciarTransicion] = useTransition();

  function onArchivoSeleccionado(archivo: File) {
    setError(null);
    setNombreArchivo(archivo.name);
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result ?? "");
      setContenidoCsv(texto);
      const parsed = Papa.parse<Record<string, string>>(texto, {
        header: true,
        skipEmptyLines: true,
        preview: 5,
      });
      const campos = parsed.meta.fields ?? [];
      setEncabezados(campos);
      setFilasPreview(parsed.data);
      setMapeo(sugerirMapeoPadron(campos));
      setPaso("mapear");
    };
    lector.readAsText(archivo, "UTF-8");
  }

  function confirmar() {
    const tieneDni = Object.values(mapeo).includes("dni");
    const tieneNombre =
      Object.values(mapeo).includes("nombreCompleto") ||
      (Object.values(mapeo).includes("nombre") && Object.values(mapeo).includes("apellido"));
    if (!tieneDni || !tieneNombre) {
      setError(
        "Mapeá al menos DNI y el nombre (una columna de nombre completo, o nombre + apellido por separado).",
      );
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await importarEntradasPadronCsvAction(
        padronId,
        nombreArchivo,
        contenidoCsv,
        mapeo,
      );
      setResultado(resultado);
      setPaso("resultado");
    });
  }

  if (paso === "subir") {
    return (
      <div className="flex flex-col gap-4">
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
    );
  }

  if (paso === "mapear") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Revisá a qué campo corresponde cada columna. Ya sugerimos lo que pudimos reconocer.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {encabezados.map((encabezado) => (
            <Select
              key={encabezado}
              label={encabezado}
              value={mapeo[encabezado] ?? ""}
              onChange={(e) =>
                setMapeo((m) => ({
                  ...m,
                  [encabezado]: e.target.value as CampoPadronImportable | "",
                }))
              }
            >
              <option value="">No importar esta columna</option>
              {CAMPOS_PADRON_IMPORTABLES.map((campo) => (
                <option key={campo} value={campo}>
                  {ETIQUETA_CAMPO_PADRON[campo]}
                </option>
              ))}
            </Select>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-texto">
            Vista previa (primeras {filasPreview.length} filas)
          </p>
          <Table>
            <TableHead>
              <tr>
                {encabezados.map((h) => (
                  <TableHeaderCell key={h}>{h}</TableHeaderCell>
                ))}
              </tr>
            </TableHead>
            <TableBody>
              {filasPreview.map((fila, i) => (
                <TableRow key={i}>
                  {encabezados.map((h) => (
                    <TableCell key={h}>{fila[h]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={confirmar} disabled={procesando}>
            {procesando ? "Procesando..." : "Confirmar importación"}
          </Button>
          <Button variant="fantasma" onClick={() => setPaso("subir")} disabled={procesando}>
            Elegir otro archivo
          </Button>
        </div>
      </div>
    );
  }

  if (paso === "resultado" && resultado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto">
          Se procesaron <strong className="text-exito">{resultado.procesadas} entradas</strong> de{" "}
          {resultado.totalFilas} filas
          {resultado.omitidas > 0 && (
            <>
              , <strong className="text-error">{resultado.omitidas} omitidas</strong> por falta de
              DNI o nombre
            </>
          )}
          . Ahora falta revisar el matching antes de poder activar este padrón.
        </p>

        {resultado.filasOmitidas.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-texto">Filas omitidas</p>
            <ul className="text-sm text-texto-secundario">
              {resultado.filasOmitidas.map((f) => (
                <li key={f.numeroFila}>
                  Fila {f.numeroFila}: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href={`/padron/${padronId}`}>
          <Button>Ir a revisar el matching</Button>
        </Link>
      </div>
    );
  }

  return null;
}
