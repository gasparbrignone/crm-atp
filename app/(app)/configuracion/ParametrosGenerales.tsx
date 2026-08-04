"use client";

import { useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ConfiguracionSistema } from "@prisma/client";
import { actualizarParametroGeneralAction } from "./actions";

// Parámetros generales — /18-configuracion-sistema.md sección 8: tabla
// clave-valor intencionalmente chica, sin agregar parámetros especulativos.
export function ParametrosGenerales({ parametros }: { parametros: ConfiguracionSistema[] }) {
  const [, iniciar] = useTransition();

  return (
    <div className="space-y-4">
      {parametros.map((p) => (
        <form
          key={p.clave}
          action={(formData) =>
            iniciar(() => actualizarParametroGeneralAction(p.clave, String(formData.get("valor") ?? "")))
          }
          className="flex flex-col gap-2 border-b border-borde pb-4 last:border-b-0 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-texto">{p.clave}</p>
            {p.descripcion && <p className="text-xs text-texto-secundario">{p.descripcion}</p>}
          </div>
          <div className="flex gap-2">
            <Input name="valor" defaultValue={p.valor} className="w-48" />
            <Button type="submit" variant="secundario">
              Guardar
            </Button>
          </div>
        </form>
      ))}
    </div>
  );
}
