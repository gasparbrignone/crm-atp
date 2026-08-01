"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import {
  actualizarClasificacionPunteoAction,
  actualizarEstadoSeguimientoAction,
} from "@/app/(app)/punteo/actions";
import { ETIQUETA_ESTADO_SEGUIMIENTO, ORDEN_ESTADO_SEGUIMIENTO } from "@/lib/utils/punteo-labels";
import type { EstadoSeguimientoPunteo } from "@prisma/client";

interface Clasificacion {
  id: string;
  nombre: string;
}

// Clasificación y estado de seguimiento como controles directos, sin
// navegación adicional — /08-modulo-punteo-electoral.md sección 5.
export function ControlesPunteo({
  personaId,
  clasificaciones,
  clasificacionActualId,
  estadoActual,
}: {
  personaId: string;
  clasificaciones: Clasificacion[];
  clasificacionActualId: string;
  estadoActual: EstadoSeguimientoPunteo;
}) {
  const [, iniciarTransicion] = useTransition();

  return (
    <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Select
        label="Clasificación"
        defaultValue={clasificacionActualId}
        onChange={(e) => {
          const valor = e.target.value;
          iniciarTransicion(() => actualizarClasificacionPunteoAction(personaId, valor));
        }}
      >
        <option value="">Sin clasificar</option>
        {clasificaciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>

      <Select
        label="Estado de seguimiento"
        defaultValue={estadoActual}
        onChange={(e) => {
          const valor = e.target.value as EstadoSeguimientoPunteo;
          iniciarTransicion(() => actualizarEstadoSeguimientoAction(personaId, valor));
        }}
      >
        {ORDEN_ESTADO_SEGUIMIENTO.map((estado) => (
          <option key={estado} value={estado}>
            {ETIQUETA_ESTADO_SEGUIMIENTO[estado]}
          </option>
        ))}
      </Select>
    </Card>
  );
}
