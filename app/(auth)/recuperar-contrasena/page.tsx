"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { solicitarRecuperacion, type EstadoRecuperarContrasena } from "./actions";

const estadoInicial: EstadoRecuperarContrasena = {};

export default function RecuperarContrasenaPage() {
  const [estado, formAction, enviando] = useActionState(solicitarRecuperacion, estadoInicial);

  if (estado.enviado) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-texto">
          Si el email está registrado, te enviamos un link para restablecer tu contraseña.
        </p>
        <Link href="/login" className="text-sm text-secundario hover:underline">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">
        Ingresá tu email y te mandamos un link para restablecer tu contraseña.
      </p>
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Enviando..." : "Enviar link de recuperación"}
      </Button>
      <Link href="/login" className="text-center text-sm text-secundario hover:underline">
        Volver a ingresar
      </Link>
    </form>
  );
}
