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
  CAMPOS_INSCRIPCION_IMPORTABLES,
  ETIQUETA_CAMPO_INSCRIPCION,
  sugerirMapeoInscripcion,
  type CampoInscripcionImportable,
} from "@/lib/utils/csv-mapping-inscripciones";
import { importarInscriptosCsvAction, type ResultadoImportacionInscriptos } from "./actions";

type Paso = "subir" | "mapear" | "resultado";

interface Carrera {
  id: string;
  nombre: string;
}

// Importación de inscriptos a una actividad puntual —
// /07-modulo-participaciones.md sección 7: el dato real suele venir de un
// formulario/planilla externa (Sheets exportado a CSV), sin DNI. El matcheo
// contra Personas ya cargadas (teléfono, después nombre+apellido asistido
// por IA) ocurre server-side; acá solo se sube el archivo y se mapean
// columnas, igual que la importación de Personas de Fase 1.
export function ImportadorInscriptosCsv({
  actividadId,
  carreras,
}: {
  actividadId: string;
  carreras: Carrera[];
}) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [contenidoCsv, setContenidoCsv] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, CampoInscripcionImportable | "">>({});
  const [carreraDefaultId, setCarreraDefaultId] = useState("");
  const [anioDefault, setAnioDefault] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacionInscriptos | null>(null);
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
      setMapeo(sugerirMapeoInscripcion(campos));
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
      const resultado = await importarInscriptosCsvAction(
        actividadId,
        nombreArchivo,
        contenidoCsv,
        mapeo,
        carreraDefaultId || undefined,
        anioDefault ? Number(anioDefault) : undefined,
      );
      setResultado(resultado);
      setPaso("resultado");
    });
  }

  if (paso === "subir") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Subí el CSV de inscriptos a esta actividad (por ejemplo, exportado de la planilla de
          Google Sheets del formulario). La primera fila debe tener los nombres de columna.
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
                  [encabezado]: e.target.value as CampoInscripcionImportable | "",
                }))
              }
            >
              <option value="">No importar esta columna</option>
              {CAMPOS_INSCRIPCION_IMPORTABLES.map((campo) => (
                <option key={campo} value={campo}>
                  {ETIQUETA_CAMPO_INSCRIPCION[campo]}
                </option>
              ))}
            </Select>
          ))}
        </div>

        <div className="rounded-borde border border-borde p-3">
          <p className="mb-2 text-sm font-medium text-texto">
            Carrera y año por defecto (opcional)
          </p>
          <p className="mb-3 text-xs text-texto-secundario">
            Si esta actividad es de una carrera/año conocidos (ej. un repaso puntual), se aplica
            solo a personas nuevas o que todavía no tengan ese dato cargado — nunca pisa un valor
            existente.
          </p>
          <div className="flex flex-wrap gap-3">
            <Select
              value={carreraDefaultId}
              onChange={(e) => setCarreraDefaultId(e.target.value)}
              className="w-auto"
            >
              <option value="">Sin carrera por defecto</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
            <Select value={anioDefault} onChange={(e) => setAnioDefault(e.target.value)} className="w-auto">
              <option value="">Sin año por defecto</option>
              {[1, 2, 3, 4, 5, 6].map((a) => (
                <option key={a} value={a}>
                  Año {a}
                </option>
              ))}
            </Select>
          </div>
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
          : <strong className="text-exito">{resultado.exitosas} inscriptas</strong> de{" "}
          {resultado.totalFilas} filas
          {resultado.conError > 0 && (
            <>
              , <strong className="text-error">{resultado.conError} pendientes de revisión</strong>
            </>
          )}
          .
        </p>

        {resultado.errores.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-texto">
              Filas pendientes de revisión manual
            </p>
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
          <Link href={`/actividades/${actividadId}`}>
            <Button>Ver actividad</Button>
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
