"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  vincularEntradaManualAction,
  marcarEntradaSinCoincidenciaAction,
} from "@/app/(app)/padron/[id]/actions";

interface Candidato {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Revisión de coincidencia probable pero no automática —
// /09-modulo-padron-electoral.md sección 6: "se muestran lado a lado la
// entrada del padrón y la ficha candidata, con acción de un clic para
// confirmar o rechazar".
export function FilaPendiente({
  padronId,
  entradaId,
  dni,
  nombreCompletoOriginal,
  motivo,
  candidatos,
}: {
  padronId: string;
  entradaId: string;
  dni: string;
  nombreCompletoOriginal: string;
  motivo: string;
  candidatos: Candidato[];
}) {
  const [resuelto, setResuelto] = useState(false);
  const [procesando, iniciarTransicion] = useTransition();

  if (resuelto) return null;

  function confirmar(personaId: string) {
    iniciarTransicion(async () => {
      await vincularEntradaManualAction(padronId, entradaId, personaId);
      setResuelto(true);
    });
  }

  function rechazar() {
    iniciarTransicion(async () => {
      await marcarEntradaSinCoincidenciaAction(padronId, entradaId);
      setResuelto(true);
    });
  }

  return (
    <Card padding="chico" className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-texto">{nombreCompletoOriginal}</p>
        <p className="text-xs text-texto-secundario">DNI {dni} · {motivo}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {candidatos.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-borde-chico border border-borde px-3 py-2"
          >
            <span className="text-sm text-texto">
              {c.apellido}, {c.nombre}
              {c.dni ? <span className="text-texto-secundario"> · DNI {c.dni}</span> : null}
            </span>
            <Button
              variant="secundario"
              onClick={() => confirmar(c.id)}
              disabled={procesando}
              className="min-h-8 px-3 text-xs"
            >
              Es esta persona
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="fantasma"
        onClick={rechazar}
        disabled={procesando}
        className="w-fit min-h-8 px-3 text-xs"
      >
        Ninguna es correcta / sin coincidencia
      </Button>
    </Card>
  );
}
