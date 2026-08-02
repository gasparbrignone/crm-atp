"use client";

import { useState, useTransition } from "react";
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
import { SelectorOrigenCsv, type DatosCsvCargado } from "@/components/importaciones/SelectorOrigenCsv";
import {
  importarInscriptosCsvAction,
  listarHojasDeCalculoAction,
  obtenerHojaComoCsvAction,
  type ResultadoImportacionInscriptos,
} from "./actions";

type Paso = "subir" | "mapear" | "resultado";

// Importación de inscriptos a una actividad puntual —
// /07-modulo-participaciones.md sección 7: el dato real suele venir de un
// formulario/planilla externa (Sheets exportado a CSV), sin DNI. El matcheo
// contra Personas ya cargadas (teléfono, después nombre+apellido asistido
// por IA) ocurre server-side; acá solo se sube el archivo y se mapean
// columnas, igual que la importación de Personas de Fase 1. La carrera/año
// por defecto ya no se pide acá — es una propiedad de la Actividad misma
// (ver pestaña "Datos generales"), se aplica sola a cada inscripto.
export function ImportadorInscriptosCsv({ actividadId }: { actividadId: string }) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [contenidoCsv, setContenidoCsv] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, CampoInscripcionImportable | "">>({});
  const [resultado, setResultado] = useState<ResultadoImportacionInscriptos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, iniciarTransicion] = useTransition();

  function onCsvCargado(datos: DatosCsvCargado) {
    setError(null);
    setNombreArchivo(datos.nombreArchivo);
    setContenidoCsv(datos.contenidoCsv);
    setEncabezados(datos.encabezados);
    setFilasPreview(datos.filasPreview);
    setMapeo(sugerirMapeoInscripcion(datos.encabezados));
    setPaso("mapear");
  }

  function confirmar() {
    const tieneNombre =
      Object.values(mapeo).includes("nombreCompleto") ||
      (Object.values(mapeo).includes("nombre") && Object.values(mapeo).includes("apellido"));
    if (!tieneNombre) {
      setError(
        "Mapeá al menos el nombre (una columna de nombre completo, o nombre + apellido por separado).",
      );
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await importarInscriptosCsvAction(
        actividadId,
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
      <SelectorOrigenCsv
        onCargado={onCsvCargado}
        listarHojasAction={listarHojasDeCalculoAction}
        obtenerHojaCsvAction={obtenerHojaComoCsvAction}
      />
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
          {resultado.altasNuevas > 0 && (
            <> ({resultado.altasNuevas} como personas nuevas, ya aparecen en el listado de Personas)</>
          )}
          {resultado.conError > 0 && (
            <>
              , <strong className="text-error">{resultado.conError} pendientes de revisión</strong>
            </>
          )}
          .
        </p>

        {resultado.errores.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-texto">Filas pendientes de revisión manual</p>
            {resultado.errores.map((e, i) => (
              <div key={i} className="rounded-borde border border-borde p-3">
                <p className="text-sm text-texto">
                  <span className="font-medium">Fila {e.numeroFila}:</span> {e.motivo}
                </p>
                {e.candidatos.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                      ¿Es alguna de estas personas?
                    </p>
                    <ul className="flex flex-col gap-1">
                      {e.candidatos.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/personas/${c.id}`}
                            target="_blank"
                            className="text-sm text-secundario hover:underline"
                          >
                            {c.apellido}, {c.nombre}
                            {c.telefono ? ` · ${c.telefono}` : ""} →
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-texto-secundario">
                      Si es una de estas, inscribila desde la ficha de la actividad (buscador de
                      &ldquo;Agregar persona&rdquo;). Si es alguien nuevo, dala de alta desde Personas.
                    </p>
                  </div>
                )}
              </div>
            ))}
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
