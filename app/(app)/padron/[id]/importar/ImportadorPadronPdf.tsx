"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { importarEntradasPadronPdfAction } from "./actions";

type Paso = "subir" | "procesando" | "resultado";

interface Resultado {
  procesadas: number;
  omitidas: number;
  totalFilas: number;
  filasOmitidas: { numeroFila: number; motivo: string }[];
}

function arrayBufferABase64(buffer: ArrayBuffer): string {
  let binario = "";
  const bytes = new Uint8Array(buffer);
  const tamanioChunk = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanioChunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanioChunk));
  }
  return btoa(binario);
}

// Carga directa del padrón oficial en PDF — /09-modulo-padron-electoral.md
// sección 4 y /15-ia.md sección 4: caso principal del módulo, la IA lee el
// documento página por página (incluso escaneado) sin OCR ni parsing rígido.
export function ImportadorPadronPdf({ padronId }: { padronId: string }) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [, iniciarTransicion] = useTransition();

  function onArchivoSeleccionado(archivo: File) {
    setError(null);
    setNombreArchivo(archivo.name);
    setPaso("procesando");

    const lector = new FileReader();
    lector.onload = () => {
      const base64 = arrayBufferABase64(lector.result as ArrayBuffer);
      iniciarTransicion(async () => {
        try {
          const resultado = await importarEntradasPadronPdfAction(padronId, archivo.name, base64);
          setResultado(resultado);
          setPaso("resultado");
        } catch {
          setError(
            "No se pudo procesar el PDF. Puede ser un documento muy grande o un error temporal de la IA — probá de nuevo o con un archivo más chico.",
          );
          setPaso("subir");
        }
      });
    };
    lector.readAsArrayBuffer(archivo);
  }

  if (paso === "subir") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Subí el PDF del padrón tal como lo publica la facultad, incluso si son páginas
          escaneadas. Documentos grandes pueden tardar varios minutos en procesarse.
        </p>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) onArchivoSeleccionado(archivo);
          }}
          className="rounded-borde border border-borde p-3 text-sm"
        />
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (paso === "procesando") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-borde border-t-primario" />
        <p className="text-sm text-texto">Leyendo &ldquo;{nombreArchivo}&rdquo; con IA...</p>
        <p className="text-xs text-texto-secundario">
          Puede tardar varios minutos si el documento tiene muchas páginas. No cierres esta
          pestaña.
        </p>
      </div>
    );
  }

  if (paso === "resultado" && resultado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto">
          La IA extrajo <strong className="text-exito">{resultado.procesadas} entradas</strong> de{" "}
          {resultado.totalFilas} filas leídas
          {resultado.omitidas > 0 && (
            <>
              , <strong className="text-error">{resultado.omitidas} omitidas</strong> por no poder
              leer DNI o nombre
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
