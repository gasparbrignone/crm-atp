"use client";

import { useActionState } from "react";
import type { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { fusionarPersonasAction, type EstadoFusionPersonas } from "../../actions";

type PersonaConDetalle = Prisma.PersonaGetPayload<{
  include: { carrera: true; telefonos: true; emails: true };
}>;

interface CampoComparable {
  campo: "nombre" | "apellido" | "dni" | "legajo" | "carreraId" | "anio" | "instagram" | "observacionesGenerales";
  etiqueta: string;
  valorDefinitiva: string;
  valorDescartada: string;
}

function valoresComparables(
  definitiva: PersonaConDetalle,
  descartada: PersonaConDetalle,
): CampoComparable[] {
  return [
    { campo: "nombre", etiqueta: "Nombre", valorDefinitiva: definitiva.nombre, valorDescartada: descartada.nombre },
    {
      campo: "apellido",
      etiqueta: "Apellido",
      valorDefinitiva: definitiva.apellido,
      valorDescartada: descartada.apellido,
    },
    { campo: "dni", etiqueta: "DNI", valorDefinitiva: definitiva.dni ?? "", valorDescartada: descartada.dni ?? "" },
    {
      campo: "legajo",
      etiqueta: "Legajo",
      valorDefinitiva: definitiva.legajo ?? "",
      valorDescartada: descartada.legajo ?? "",
    },
    {
      campo: "carreraId",
      etiqueta: "Carrera",
      valorDefinitiva: definitiva.carrera?.nombre ?? "",
      valorDescartada: descartada.carrera?.nombre ?? "",
    },
    {
      campo: "anio",
      etiqueta: "Año",
      valorDefinitiva: definitiva.anio ? String(definitiva.anio) : "",
      valorDescartada: descartada.anio ? String(descartada.anio) : "",
    },
    {
      campo: "instagram",
      etiqueta: "Instagram",
      valorDefinitiva: definitiva.instagram ?? "",
      valorDescartada: descartada.instagram ?? "",
    },
    {
      campo: "observacionesGenerales",
      etiqueta: "Observaciones generales",
      valorDefinitiva: definitiva.observacionesGenerales ?? "",
      valorDescartada: descartada.observacionesGenerales ?? "",
    },
  ];
}

// Sugerencia por defecto (/05-modulo-personas.md sección 8.2): el valor no
// vacío gana; si ambos tienen datos, se conserva el de la definitiva.
function origenPorDefecto(campo: CampoComparable): "definitiva" | "descartada" {
  if (!campo.valorDefinitiva && campo.valorDescartada) return "descartada";
  return "definitiva";
}

export function FormularioFusion({
  definitiva,
  descartada,
}: {
  definitiva: PersonaConDetalle;
  descartada: PersonaConDetalle;
}) {
  const estadoInicial: EstadoFusionPersonas = {};
  const [estado, formAction, enviando] = useActionState(
    fusionarPersonasAction.bind(null, definitiva.id, descartada.id),
    estadoInicial,
  );

  const campos = valoresComparables(definitiva, descartada);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1 text-xs font-semibold text-texto-secundario">
        <span>Se conserva ({definitiva.nombre} {definitiva.apellido})</span>
        <span />
        <span>Se descarta ({descartada.nombre} {descartada.apellido})</span>
      </div>

      {campos.map((campo) => {
        const iguales = campo.valorDefinitiva === campo.valorDescartada;
        const defecto = origenPorDefecto(campo);
        return (
          <div key={campo.campo} className="rounded-borde-chico border border-borde p-3">
            <p className="mb-2 text-xs font-semibold text-texto-secundario">{campo.etiqueta}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`campo_${campo.campo}`}
                  value="definitiva"
                  defaultChecked={defecto === "definitiva"}
                  disabled={iguales}
                />
                <span className="text-texto">{campo.valorDefinitiva || "—"}</span>
              </label>
              <span className="text-texto-secundario">vs</span>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`campo_${campo.campo}`}
                  value="descartada"
                  defaultChecked={defecto === "descartada"}
                  disabled={iguales}
                />
                <span className="text-texto">{campo.valorDescartada || "—"}</span>
              </label>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-texto-secundario">
        Los teléfonos, emails, actividades y punteo de ambas fichas se combinan automáticamente — no hace
        falta elegirlos acá.
      </p>

      {estado.error && (
        <div role="alert" className="rounded-borde border border-error bg-error/10 p-3 text-sm text-error">
          {estado.error}
        </div>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Fusionando..." : "Confirmar fusión"}
      </Button>
    </form>
  );
}
