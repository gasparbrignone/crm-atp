"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { actualizarPerfilAction, type EstadoFormularioPerfil } from "./actions";
import type { UsuarioConPermisos } from "@/lib/permisos/permisos";

const estadoInicial: EstadoFormularioPerfil = {};

export function FormularioPerfil({ usuario }: { usuario: UsuarioConPermisos }) {
  const [estado, formAction, enviando] = useActionState(actualizarPerfilAction, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nombre" name="nombre" required defaultValue={usuario.nombre} />
      <Input label="Apellido" name="apellido" required defaultValue={usuario.apellido} />
      <Input label="Teléfono" name="telefono" type="tel" defaultValue={usuario.telefono ?? ""} />

      <div className="border-t border-borde pt-4">
        <h2 className="text-sm font-semibold text-texto">Notificaciones por email</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Las notificaciones en la app nunca se desactivan — esto solo controla si además recibís un
          resumen periódico por email.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            name="recibirDigestEmail"
            defaultChecked={usuario.recibirDigestEmail}
            className="h-4 w-4 rounded border-borde"
          />
          Recibir resumen por email
        </label>
        <div className="mt-3">
          <Select
            label="Frecuencia"
            name="frecuenciaDigestEmail"
            defaultValue={usuario.frecuenciaDigestEmail}
          >
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
          </Select>
        </div>
      </div>

      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-exito">Guardado.</p>}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
