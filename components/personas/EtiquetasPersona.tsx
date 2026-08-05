"use client";

import { useState, useTransition } from "react";
import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  agregarEtiquetaAction,
  quitarEtiquetaAction,
  crearYAgregarEtiquetaAction,
} from "@/app/(app)/personas/actions";
import { estiloEtiqueta } from "@/lib/utils/etiqueta-color";

interface EtiquetaAsignada {
  id: string;
  nombre: string;
  color: string | null;
}

// Gestión de etiquetas de una Persona — /05-modulo-personas.md sección 7.
// Compartidas por toda la organización (no privadas por usuario, a
// diferencia de ClasificacionPunteo). Cualquiera con personas.editar puede
// asignar/crear, sin permiso adicional.
export function EtiquetasPersona({
  personaId,
  asignadas,
  disponibles,
  editable,
}: {
  personaId: string;
  asignadas: EtiquetaAsignada[];
  disponibles: EtiquetaAsignada[];
  editable: boolean;
}) {
  const [seleccionAgregar, setSeleccionAgregar] = useState("");
  const [nombreNueva, setNombreNueva] = useState("");
  const [pendiente, iniciar] = useTransition();

  const idsAsignadas = new Set(asignadas.map((e) => e.id));
  const paraAgregar = disponibles.filter((e) => !idsAsignadas.has(e.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {asignadas.length === 0 && (
          <p className="text-sm text-texto-secundario">Sin etiquetas asignadas todavía.</p>
        )}
        {asignadas.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={estiloEtiqueta(e.color)}
          >
            {e.nombre}
            {editable && (
              <button
                type="button"
                onClick={() => iniciar(() => agregarQuitar("quitar", e.id))}
                disabled={pendiente}
                className="rounded-full hover:bg-black/10"
                aria-label={`Quitar etiqueta ${e.nombre}`}
              >
                <MdClose size={12} />
              </button>
            )}
          </span>
        ))}
      </div>

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          {paraAgregar.length > 0 && (
            <div className="flex items-end gap-2">
              <select
                value={seleccionAgregar}
                onChange={(e) => setSeleccionAgregar(e.target.value)}
                className="min-h-11 rounded-borde border border-borde bg-fondo-superficie px-3 text-sm"
              >
                <option value="">Agregar etiqueta existente...</option>
                {paraAgregar.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secundario"
                disabled={!seleccionAgregar || pendiente}
                onClick={() => {
                  const id = seleccionAgregar;
                  setSeleccionAgregar("");
                  iniciar(() => agregarQuitar("agregar", id));
                }}
              >
                Agregar
              </Button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <Input
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              placeholder="Crear y asignar etiqueta nueva"
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="secundario"
              disabled={!nombreNueva.trim() || pendiente}
              onClick={() => {
                const nombre = nombreNueva.trim();
                setNombreNueva("");
                iniciar(() => crearYAgregarEtiquetaAction(personaId, nombre));
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  async function agregarQuitar(accion: "agregar" | "quitar", etiquetaId: string) {
    if (accion === "agregar") await agregarEtiquetaAction(personaId, etiquetaId);
    else await quitarEtiquetaAction(personaId, etiquetaId);
  }
}
