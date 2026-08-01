"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

// Estado de error de vista — ver /19-ux-ui.md sección 8: mensaje en lenguaje
// simple, sin jerga técnica, con una acción de reintento cuando es posible.
// No expone stack traces ni errores crudos de Prisma/Postgres (/03-arquitectura.md
// sección 13).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const esPermiso = error.name === "ErrorPermisoDenegado" || error.name === "ErrorSinSesion";

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-base font-semibold text-texto">
        {esPermiso ? "No tenés acceso a esta sección." : "Algo salió mal."}
      </p>
      <p className="max-w-sm text-sm text-texto-secundario">
        {esPermiso
          ? "Si creés que deberías tener acceso, hablá con un Administrador."
          : "Intentá de nuevo. Si el problema sigue, avisale a un Administrador."}
      </p>
      <div className="flex gap-2">
        {!esPermiso && <Button onClick={reset}>Reintentar</Button>}
        <Link href="/dashboard">
          <Button variant="secundario">Ir al dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
