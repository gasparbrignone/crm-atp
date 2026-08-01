"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { ImportadorPadronCsv } from "./ImportadorPadronCsv";
import { ImportadorPadronPdf } from "./ImportadorPadronPdf";

type Fuente = "pdf" | "csv";

export function SelectorFuenteImportacion({ padronId }: { padronId: string }) {
  const [fuente, setFuente] = useState<Fuente>("pdf");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-borde-chico border border-borde p-1">
        {(["pdf", "csv"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFuente(f)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              fuente === f ? "bg-primario text-white" : "text-texto-secundario hover:bg-fondo-hover",
            )}
          >
            {f === "pdf" ? "PDF" : "CSV / Excel"}
          </button>
        ))}
      </div>

      {fuente === "pdf" ? (
        <ImportadorPadronPdf padronId={padronId} />
      ) : (
        <ImportadorPadronCsv padronId={padronId} />
      )}
    </div>
  );
}
