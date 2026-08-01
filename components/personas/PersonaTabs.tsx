"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface Pestana {
  id: string;
  etiqueta: string;
  contenido: ReactNode;
}

// Ficha de detalle organizada en pestañas — ver /05-modulo-personas.md sección 4.
export function PersonaTabs({ pestanas }: { pestanas: Pestana[] }) {
  const [activa, setActiva] = useState(pestanas[0]?.id);

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-borde overflow-x-auto">
        {pestanas.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={activa === p.id}
            onClick={() => setActiva(p.id)}
            className={cn(
              "min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold",
              activa === p.id
                ? "border-primario text-primario"
                : "border-transparent text-texto-secundario hover:text-texto",
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="py-4">{pestanas.find((p) => p.id === activa)?.contenido}</div>
    </div>
  );
}
