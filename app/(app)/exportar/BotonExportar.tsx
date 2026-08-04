"use client";

import { useState, useTransition } from "react";
import { MdFileDownload } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import type { ResultadoExport } from "./actions";
import { descargarCsv } from "./descargar-csv";

// Dispara la Server Action, arma el CSV como Blob en el navegador y lo
// descarga — el archivo nunca pasa por una URL pública, se genera en el
// response de la Server Action y se descarta apenas termina la descarga.
export function BotonExportar({
  accion,
  etiqueta = "Exportar CSV",
}: {
  accion: () => Promise<ResultadoExport>;
  etiqueta?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function descargar() {
    setError(null);
    iniciar(async () => {
      try {
        descargarCsv(await accion());
      } catch {
        setError("No se pudo generar la exportación. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secundario" onClick={descargar} disabled={pendiente}>
        <MdFileDownload size={18} />
        {pendiente ? "Generando..." : etiqueta}
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
