"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { actualizarContrasena, type EstadoActualizarContrasena } from "./actions";

const estadoInicial: EstadoActualizarContrasena = {};

export default function ActualizarContrasenaPage() {
  const [estado, formAction, enviando] = useActionState(actualizarContrasena, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">Elegí tu nueva contraseña.</p>
      <Input
        label="Nueva contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
      />
      <Input
        label="Confirmar contraseña"
        name="confirmacion"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
      />
      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Guardando..." : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
