"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";

interface CampoEditableActividadProps {
  actividadId: string;
  campo: string;
  valor: string;
  label: string;
  tipo?: "text" | "number" | "select" | "textarea" | "datetime-local";
  opciones?: { value: string; label: string }[];
  editable: boolean;
  accion: (actividadId: string, campo: string, valor: string) => Promise<{ error?: string }>;
}

// Edición inline por campo — mismo patrón que
// /components/personas/CampoEditable.tsx (/06-modulo-actividades.md sección
// 4.2: igual criterio que en Personas, con historial de cambios por campo).
export function CampoEditableActividad({
  actividadId,
  campo,
  valor,
  label,
  tipo = "text",
  opciones,
  editable,
  accion,
}: CampoEditableActividadProps) {
  const [editando, setEditando] = useState(false);
  const [valorLocal, setValorLocal] = useState(valor);
  const [error, setError] = useState<string | undefined>();
  const [pendiente, iniciarTransicion] = useTransition();

  function guardar(nuevoValor: string) {
    if (nuevoValor === valor) {
      setEditando(false);
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await accion(actividadId, campo, nuevoValor);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setError(undefined);
      setValorLocal(nuevoValor);
      setEditando(false);
    });
  }

  const valorMostrado =
    tipo === "select" ? (opciones?.find((o) => o.value === valorLocal)?.label ?? valorLocal) : valorLocal;

  if (!editable) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-texto-secundario">{label}</span>
        <span className="whitespace-pre-wrap text-sm text-texto">{valorMostrado || "—"}</span>
      </div>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex flex-col gap-0.5 rounded-borde px-1 py-0.5 text-left hover:bg-borde/30"
      >
        <span className="text-xs text-texto-secundario">{label}</span>
        <span className="whitespace-pre-wrap text-sm text-texto">
          {valorMostrado || "Sin completar"}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-texto-secundario">{label}</span>
      {tipo === "select" ? (
        <select
          autoFocus
          defaultValue={valorLocal}
          disabled={pendiente}
          onBlur={(e) => guardar(e.target.value)}
          className="min-h-11 rounded-borde border border-secundario bg-fondo-superficie px-3 text-sm"
        >
          {opciones?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : tipo === "textarea" ? (
        <textarea
          autoFocus
          rows={3}
          defaultValue={valorLocal}
          disabled={pendiente}
          onBlur={(e) => guardar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
          }}
          className="rounded-borde border border-secundario bg-fondo-superficie px-3 py-2 text-sm"
        />
      ) : (
        <input
          autoFocus
          type={tipo}
          defaultValue={valorLocal}
          disabled={pendiente}
          onBlur={(e) => guardar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tipo !== "datetime-local") e.currentTarget.blur();
            if (e.key === "Escape") setEditando(false);
          }}
          className={cn(
            "min-h-11 rounded-borde border border-secundario bg-fondo-superficie px-3 text-sm",
          )}
        />
      )}
      {error && (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      )}
    </div>
  );
}
