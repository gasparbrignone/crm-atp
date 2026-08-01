"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { iniciarSesion, type EstadoLogin } from "./actions";

const estadoInicial: EstadoLogin = {};

export default function LoginPage() {
  const [estado, formAction, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Input
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Ingresando..." : "Ingresar"}
      </Button>
      <Link
        href="/recuperar-contrasena"
        className="text-center text-sm text-secundario hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
