"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { invitarUsuarioAction, type EstadoFormularioUsuario } from "../actions";
import type { Rol } from "@prisma/client";

const estadoInicial: EstadoFormularioUsuario = {};

// Alta de usuario — /10-usuarios-roles-permisos.md sección 6: el sistema
// envía la invitación por email vía Supabase Auth, no se comparten
// contraseñas manualmente.
export function FormularioInvitarUsuario({ roles }: { roles: Rol[] }) {
  const [estado, formAction, enviando] = useActionState(invitarUsuarioAction, estadoInicial);
  const router = useRouter();

  useEffect(() => {
    if (!estado.error && estado !== estadoInicial) {
      router.push("/usuarios");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nombre" name="nombre" required autoFocus />
      <Input label="Apellido" name="apellido" required />
      <Input label="Email" name="email" type="email" required ayuda="Se le va a enviar una invitación a esta dirección" />
      <Select label="Rol" name="rolId" required defaultValue="">
        <option value="" disabled>
          Elegí un rol
        </option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </Select>

      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Enviando invitación..." : "Enviar invitación"}
      </Button>
    </form>
  );
}
