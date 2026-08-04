"use client";

import { useState, useTransition } from "react";
import { MdFileDownload } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { Carrera } from "@prisma/client";
import { exportarPersonasAction } from "./actions";
import { descargarCsv } from "./descargar-csv";

export function ExportarPersonasForm({ carreras }: { carreras: Carrera[] }) {
  const [carreraId, setCarreraId] = useState("");
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        label="Carrera (opcional)"
        value={carreraId}
        onChange={(e) => setCarreraId(e.target.value)}
        className="w-56"
      >
        <option value="">Todas</option>
        {carreras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
      <Button
        variant="secundario"
        disabled={pendiente}
        onClick={() => iniciar(async () => descargarCsv(await exportarPersonasAction(carreraId)))}
      >
        <MdFileDownload size={18} />
        {pendiente ? "Generando..." : "Exportar CSV"}
      </Button>
    </div>
  );
}
