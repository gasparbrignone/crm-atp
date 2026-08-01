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
  CAMPOS_PERSONA_IMPORTABLES,
  ETIQUETA_CAMPO_PERSONA,
  sugerirMapeo,
  type CampoPersonaImportable,
} from "@/lib/utils/csv-mapping";
import { ejecutarImportacionCsvAction, type ResultadoImportacion } from "./actions";

type Paso = "subir" | "mapear" | "resultado";

// Flujo general de importación — /14-importaciones-exportaciones.md sección 3:
// selección de archivo → mapeo de columnas → vista previa → procesamiento →
// revisión de resultados. Sin matching inteligente (Fase 1, ver /20-roadmap.md).
export function ImportadorPersonasCsv() {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [contenidoCsv, setContenidoCsv] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, CampoPersonaImportable | "">>({});
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
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
      setMapeo(sugerirMapeo(campos));
      setPaso("mapear");
    };
    lector.readAsText(archivo, "UTF-8");
  }

  function confirmar() {
    const tieneNombreYApellido =
      Object.values(mapeo).includes("nombre") && Object.values(mapeo).includes("apellido");
    if (!tieneNombreYApellido) {
      setError("Mapeá al menos las columnas de Nombre y Apellido antes de continuar.");
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await ejecutarImportacionCsvAction(nombreArchivo, contenidoCsv, mapeo);
      setResultado(resultado);
      setPaso("resultado");
    });
  }

  if (paso === "subir") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Subí un archivo CSV con tus contactos. La primera fila debe tener los nombres de
          columna.
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
          Revisá a qué campo corresponde cada columna. Ya sugerimos lo que pudimos reconocer —
          corregí lo que haga falta.
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
                  [encabezado]: e.target.value as CampoPersonaImportable | "",
                }))
              }
            >
              <option value="">No importar esta columna</option>
              {CAMPOS_PERSONA_IMPORTABLES.map((campo) => (
                <option key={campo} value={campo}>
                  {ETIQUETA_CAMPO_PERSONA[campo]}
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
            {procesando ? "Importando..." : "Confirmar importación"}
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
          Importación {resultado.estado === "completado" ? "completada" : "completada con errores"}
          : <strong className="text-exito">{resultado.exitosas} exitosas</strong> de{" "}
          {resultado.totalFilas} filas
          {resultado.conError > 0 && (
            <>
              , <strong className="text-error">{resultado.conError} con error</strong>
            </>
          )}
          {resultado.duplicados > 0 && <> ({resultado.duplicados} por DNI duplicado)</>}.
        </p>

        {resultado.errores.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-texto">Detalle de errores</p>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Fila</TableHeaderCell>
                  <TableHeaderCell>Motivo</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {resultado.errores.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.numeroFila}</TableCell>
                    <TableCell>{e.mensajeError}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex gap-2">
          <Link href="/personas">
            <Button>Ver Personas</Button>
          </Link>
          <Button variant="fantasma" onClick={() => setPaso("subir")}>
            Importar otro archivo
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
