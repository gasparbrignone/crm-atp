"use client";

import { useState, useTransition } from "react";
import { MdFileDownload } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { PadronElectoral } from "@prisma/client";
import { exportarPadronAction } from "./actions";
import { descargarCsv } from "./descargar-csv";

export function ExportarPadronForm({ padrones }: { padrones: PadronElectoral[] }) {
  const [padronId, setPadronId] = useState(padrones[0]?.id ?? "");
  const [pendiente, iniciar] = useTransition();

  if (padrones.length === 0) {
    return <p className="text-sm text-texto-secundario">No hay padrones cargados todavía.</p>;
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label="Padrón" value={padronId} onChange={(e) => setPadronId(e.target.value)} className="w-64">
        {padrones.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} ({p.estado})
          </option>
        ))}
      </Select>
      <Button
        variant="secundario"
        disabled={pendiente || !padronId}
        onClick={() => iniciar(async () => descargarCsv(await exportarPadronAction(padronId)))}
      >
        <MdFileDownload size={18} />
        {pendiente ? "Generando..." : "Exportar CSV"}
      </Button>
    </div>
  );
}
