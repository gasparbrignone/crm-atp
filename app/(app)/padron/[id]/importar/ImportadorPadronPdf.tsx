"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { iniciarImportacionPadronPdfAction, procesarSiguienteLotePadronAction } from "./actions";

type Paso = "subir" | "procesando" | "resultado" | "error";

interface ResumenFinal {
  procesadas: number;
  omitidas: number;
  filasOmitidas: { numeroFila: number; motivo: string }[];
}

const REINTENTOS_MAXIMOS_POR_LOTE = 8;
const ESPERA_ENTRE_REINTENTOS_MS = 4000;

function arrayBufferABase64(buffer: ArrayBuffer): string {
  let binario = "";
  const bytes = new Uint8Array(buffer);
  const tamanioChunk = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanioChunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanioChunk));
  }
  return btoa(binario);
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Carga directa del padrón oficial en PDF — /09-modulo-padron-electoral.md
// sección 4. Lectura 100% determinística desde 2026-08-04 (lib/padron/lectura-padron.ts,
// sin ninguna llamada a IA — ver CLAUDE.md sección 7, S6, y
// PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md). Se procesa lote por lote (un
// request de servidor corto por vez) en vez de una sola llamada larga
// porque este proyecto corre en el plan gratuito de Vercel (límite real de
// 300s por función, ver CLAUDE.md sección 10) y el matching de miles de
// filas contra la base real puede tardar más que eso en una sola pasada —
// ya no por cuota de un proveedor externo, sino por volumen de consultas a
// Postgres. Si un lote puntual falla (por ejemplo, un corte transitorio de
// conexión a la base), se reintenta ese mismo lote automáticamente sin
// perder lo ya procesado.
export function ImportadorPadronPdf({ padronId }: { padronId: string }) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenFinal | null>(null);
  const [progreso, setProgreso] = useState<{ lotesProcesados: number; lotesTotales: number } | null>(
    null,
  );

  async function procesarTodosLosLotes() {
    const acumulado: ResumenFinal = { procesadas: 0, omitidas: 0, filasOmitidas: [] };

    for (;;) {
      let resultado = null;
      let intento = 0;
      // Un lote puntual puede fallar por un corte transitorio de conexión a
      // la base o de la función por duración — no es un error del padrón en
      // sí, así que se reintenta el mismo lote antes de rendirse.
      while (intento < REINTENTOS_MAXIMOS_POR_LOTE) {
        try {
          resultado = await procesarSiguienteLotePadronAction(padronId);
          break;
        } catch {
          intento++;
          if (intento >= REINTENTOS_MAXIMOS_POR_LOTE) {
            throw new Error(
              "Un lote del padrón no se pudo procesar después de varios intentos. El progreso ya hecho no se perdió — probá de nuevo en unos minutos.",
            );
          }
          await esperar(ESPERA_ENTRE_REINTENTOS_MS);
        }
      }
      if (!resultado) break;

      acumulado.procesadas += resultado.procesadasEnEsteLote;
      acumulado.omitidas += resultado.omitidasEnEsteLote;
      acumulado.filasOmitidas.push(...resultado.filasOmitidasEnEsteLote);
      setProgreso({ lotesProcesados: resultado.lotesProcesados, lotesTotales: resultado.lotesTotales });

      if (resultado.completado) return acumulado;
    }
    return acumulado;
  }

  function onArchivoSeleccionado(archivo: File) {
    setError(null);
    setNombreArchivo(archivo.name);
    setPaso("procesando");
    setProgreso(null);

    const lector = new FileReader();
    lector.onload = async () => {
      const base64 = arrayBufferABase64(lector.result as ArrayBuffer);
      try {
        const { totalLotes } = await iniciarImportacionPadronPdfAction(padronId, archivo.name, base64);
        setProgreso({ lotesProcesados: 0, lotesTotales: totalLotes });
        const resumenFinal = await procesarTodosLosLotes();
        setResumen(resumenFinal);
        setPaso("resultado");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo procesar el PDF. Puede ser un documento muy grande o un error temporal de conexión — probá de nuevo o con un archivo más chico.",
        );
        setPaso("error");
      }
    };
    lector.readAsArrayBuffer(archivo);
  }

  if (paso === "subir" || paso === "error") {
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
        <p className="text-sm text-texto">Leyendo &ldquo;{nombreArchivo}&rdquo;...</p>
        {progreso && progreso.lotesTotales > 0 && (
          <div className="flex w-full max-w-xs flex-col gap-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-fondo-hover">
              <div
                className="h-full rounded-full bg-primario transition-all"
                style={{ width: `${(progreso.lotesProcesados / progreso.lotesTotales) * 100}%` }}
              />
            </div>
            <p className="text-xs text-texto-secundario">
              Lote {progreso.lotesProcesados} de {progreso.lotesTotales}
            </p>
          </div>
        )}
        <p className="text-xs text-texto-secundario">
          Puede tardar varios minutos si el documento tiene muchas páginas. No cierres esta
          pestaña.
        </p>
      </div>
    );
  }

  if (paso === "resultado" && resumen) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto">
          Se extrajeron <strong className="text-exito">{resumen.procesadas} entradas</strong>
          {resumen.omitidas > 0 && (
            <>
              , <strong className="text-error">{resumen.omitidas} omitidas</strong> por no poder leer
              DNI o nombre
            </>
          )}
          . Ahora falta revisar el matching antes de poder activar este padrón.
        </p>

        {resumen.filasOmitidas.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-texto">Filas omitidas</p>
            <ul className="text-sm text-texto-secundario">
              {resumen.filasOmitidas.map((f) => (
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
