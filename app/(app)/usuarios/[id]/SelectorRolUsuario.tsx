"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { cambiarRolUsuarioAction } from "../actions";
import type { Rol } from "@prisma/client";

// Cambio de rol — /10-usuarios-roles-permisos.md sección 9: queda
// registrado en HistorialCambio con la acción cambio_permiso. Confirmación
// explícita antes de aplicar, dado el impacto en lo que ese usuario puede
// ver y hacer.
export function SelectorRolUsuario({
  usuarioId,
  rolActualId,
  roles,
}: {
  usuarioId: string;
  rolActualId: string;
  roles: Rol[];
}) {
  const [rolId, setRolId] = useState(rolActualId);
  const [error, setError] = useState<string | undefined>();
  const [pendiente, iniciarTransicion] = useTransition();

  function onChange(nuevoRolId: string) {
    const rol = roles.find((r) => r.id === nuevoRolId);
    if (!rol) return;
    if (!window.confirm(`¿Cambiar el rol de este usuario a "${rol.nombre}"?`)) {
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await cambiarRolUsuarioAction(usuarioId, nuevoRolId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setError(undefined);
      setRolId(nuevoRolId);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={rolId}
        disabled={pendiente}
        onChange={(e) => onChange(e.target.value)}
        className="w-auto"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
