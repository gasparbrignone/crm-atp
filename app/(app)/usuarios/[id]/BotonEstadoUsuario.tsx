"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cambiarEstadoUsuarioAction } from "../actions";
import type { EstadoUsuario } from "@prisma/client";

// Ciclo de vida — /10-usuarios-roles-permisos.md sección 8: nunca se
// elimina, solo se desactiva/reactiva. Si el usuario es responsable de
// actividades planificadas/en curso, el servidor devuelve la lista para que
// se reasignen primero (misma edición inline ya disponible en cada ficha de
// actividad).
export function BotonEstadoUsuario({
  usuarioId,
  estadoActual,
}: {
  usuarioId: string;
  estadoActual: EstadoUsuario;
}) {
  const [estado, setEstado] = useState(estadoActual);
  const [error, setError] = useState<string | undefined>();
  const [actividadesSinReasignar, setActividadesSinReasignar] = useState<
    { id: string; nombre: string }[]
  >([]);
  const [pendiente, iniciarTransicion] = useTransition();

  function alternar() {
    const nuevoEstado = estado === "activo" ? "inactivo" : "activo";
    if (
      nuevoEstado === "inactivo" &&
      !window.confirm("¿Desactivar a este usuario? No va a poder iniciar sesión.")
    ) {
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoUsuarioAction(usuarioId, nuevoEstado);
      if (resultado.error) {
        setError(resultado.error);
        setActividadesSinReasignar(resultado.actividadesSinReasignar ?? []);
        return;
      }
      setError(undefined);
      setActividadesSinReasignar([]);
      setEstado(nuevoEstado);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={estado === "activo" ? "peligro" : "secundario"}
        disabled={pendiente}
        onClick={alternar}
        className="w-fit"
      >
        {estado === "activo" ? "Desactivar usuario" : "Reactivar usuario"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {actividadesSinReasignar.length > 0 && (
        <ul className="flex flex-col gap-1">
          {actividadesSinReasignar.map((a) => (
            <li key={a.id}>
              <Link href={`/actividades/${a.id}`} className="text-sm text-secundario hover:underline">
                {a.nombre} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
