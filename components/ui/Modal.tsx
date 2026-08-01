"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  /** Usar para acciones destructivas o irreversibles — ver /19-ux-ui.md sección 7. */
  variante?: "default" | "destructiva";
}

// Componente base del design system — ver /19-ux-ui.md sección 7 (modal de
// confirmación para acciones destructivas o irreversibles: baja lógica, fusión,
// cierre de padrón). Navegación completa por teclado (Escape cierra, foco
// atrapado en el diálogo) — ver sección 9, accesibilidad.
export function Modal({ abierto, onCerrar, titulo, children, variante = "default" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abierto, onCerrar]);

  if (!abierto || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onCerrar}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-md rounded-borde border bg-fondo-superficie p-6 shadow-flotante focus:outline-none",
          variante === "destructiva" ? "border-error" : "border-borde",
        )}
      >
        <h2 id="modal-titulo" className="text-base font-semibold text-texto">
          {titulo}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
