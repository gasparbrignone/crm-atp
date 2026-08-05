"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MdDeleteOutline } from "react-icons/md";
import { eliminarPadronAction } from "@/app/(app)/padron/[id]/actions";

// Borrado rápido desde el listado — solo para padrones en "borrador" (ver
// PadronNoEsBorradorError en padron.service.ts). Confirmación nativa del
// navegador, mismo patrón liviano ya usado en BotonEstadoUsuario.tsx, no un
// modal completo — acá es una fila de una tabla, no la pantalla de detalle.
export function BotonBorrarPadron({ padronId, nombre }: { padronId: string; nombre: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();
  const router = useRouter();

  function borrar() {
    if (!window.confirm(`¿Borrar el padrón "${nombre}"? No se puede deshacer.`)) return;
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await eliminarPadronAction(padronId);
      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo borrar el padrón.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={borrar}
        disabled={pendiente}
        className="rounded p-1.5 text-texto-secundario hover:bg-error/10 hover:text-error disabled:opacity-50"
        aria-label={`Borrar padrón ${nombre}`}
        title="Borrar padrón"
      >
        <MdDeleteOutline size={18} />
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
