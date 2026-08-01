"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { activarPadronAction, cerrarPadronAction } from "@/app/(app)/padron/[id]/actions";

// Activar/cerrar un padrón recalcula Persona.estado_padron para todo el
// sistema (/09-modulo-padron-electoral.md sección 7) y cierra automáticamente
// cualquier padrón activo anterior (RN-8) — acción con impacto amplio,
// confirmación explícita antes de ejecutar (/19-ux-ui.md sección 7).
export function PanelActivacion({
  padronId,
  estado,
  puedeActivarse,
  pendientes,
}: {
  padronId: string;
  estado: string;
  puedeActivarse: boolean;
  pendientes: number;
}) {
  const [modal, setModal] = useState<"activar" | "cerrar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, iniciarTransicion] = useTransition();
  const router = useRouter();

  function confirmarActivar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await activarPadronAction(padronId);
      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo activar el padrón.");
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function confirmarCerrar() {
    iniciarTransicion(async () => {
      await cerrarPadronAction(padronId);
      setModal(null);
      router.refresh();
    });
  }

  if (estado === "cerrado") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {estado === "borrador" && (
          <Button onClick={() => setModal("activar")} disabled={!puedeActivarse}>
            Activar padrón
          </Button>
        )}
        {estado === "activo" && (
          <Button variant="peligro" onClick={() => setModal("cerrar")}>
            Cerrar padrón
          </Button>
        )}
        {estado === "borrador" && !puedeActivarse && (
          <p className="self-center text-sm text-texto-secundario">
            Resolvé las {pendientes} entrada{pendientes === 1 ? "" : "s"} pendiente
            {pendientes === 1 ? "" : "s"} para poder activarlo.
          </p>
        )}
      </div>

      <Modal abierto={modal === "activar"} onCerrar={() => setModal(null)} titulo="Activar este padrón">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            Esto cierra automáticamente cualquier otro padrón activo y recalcula el estado de
            padrón de todas las Personas del sistema. No se puede deshacer con un clic.
          </p>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="fantasma" onClick={() => setModal(null)} disabled={procesando}>
              Cancelar
            </Button>
            <Button onClick={confirmarActivar} disabled={procesando}>
              {procesando ? "Activando..." : "Sí, activar"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal abierto={modal === "cerrar"} onCerrar={() => setModal(null)} titulo="Cerrar este padrón" variante="destructiva">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            El padrón se conserva para consulta histórica, pero deja de influir sobre el estado de
            padrón de las Personas (vuelve a &ldquo;No evaluado&rdquo; hasta que actives uno nuevo).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="fantasma" onClick={() => setModal(null)} disabled={procesando}>
              Cancelar
            </Button>
            <Button variant="peligro" onClick={confirmarCerrar} disabled={procesando}>
              {procesando ? "Cerrando..." : "Sí, cerrar"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
