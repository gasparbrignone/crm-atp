"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import {
  buscarPersonasParaFusionAction,
  type CandidatoBusquedaFusion,
} from "@/app/(app)/personas/fusionar/actions";

// Punto de entrada manual del flujo de fusión — /05-modulo-personas.md
// sección 8.2 ("iniciado por una sugerencia de IA o por una detección manual
// del usuario"). Busca otra ficha por nombre/apellido/DNI y lleva al usuario
// a la comparación lado a lado, con la ficha actual como definitiva.
export function BuscarDuplicadoFusion({ personaId }: { personaId: string }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CandidatoBusquedaFusion[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const router = useRouter();

  function onChange(valor: string) {
    setQ(valor);
    iniciarBusqueda(async () => {
      const encontrados = await buscarPersonasParaFusionAction(personaId, valor);
      setResultados(encontrados);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label="Fusionar con otra ficha"
        placeholder="Buscar por nombre, apellido o DNI..."
        value={q}
        onChange={(e) => onChange(e.target.value)}
        ayuda="Si esta ficha y otra son la misma persona, buscala acá para revisar y fusionar."
      />
      {buscando && <p className="text-xs text-texto-secundario">Buscando...</p>}
      {!buscando && resultados.length > 0 && (
        <div className="flex flex-col divide-y divide-borde rounded-borde-chico border border-borde">
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => router.push(`/personas/fusionar/${personaId}/${r.id}`)}
              className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-fondo-hover"
            >
              <span className="text-texto">
                {r.nombre} {r.apellido}
              </span>
              {r.dni && <span className="text-xs text-texto-secundario">DNI {r.dni}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
