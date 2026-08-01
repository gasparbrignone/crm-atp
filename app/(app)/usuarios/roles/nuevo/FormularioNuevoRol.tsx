"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { crearRolAction, type EstadoFormularioRol } from "../actions";
import type { Permiso } from "@prisma/client";

const estadoInicial: EstadoFormularioRol = {};

// Roles personalizados — /10-usuarios-roles-permisos.md sección 7: cualquier
// combinación del catálogo de permisos, sin cambio de código.
export function FormularioNuevoRol({ permisos }: { permisos: Permiso[] }) {
  const [estado, formAction, enviando] = useActionState(crearRolAction, estadoInicial);
  const router = useRouter();

  useEffect(() => {
    if (!estado.error && estado !== estadoInicial) {
      router.push("/usuarios/roles");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const modulos = Array.from(new Set(permisos.map((p) => p.modulo)));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nombre del rol" name="nombre" required autoFocus />
      <Input label="Descripción" name="descripcion" />

      <div>
        <p className="mb-2 text-sm font-semibold text-texto">Permisos</p>
        <div className="flex flex-col gap-4">
          {modulos.map((modulo) => (
            <div key={modulo}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                {modulo}
              </p>
              <div className="flex flex-col gap-1.5">
                {permisos
                  .filter((p) => p.modulo === modulo)
                  .map((p) => (
                    <label key={p.id} className="flex items-start gap-2 text-sm text-texto">
                      <input type="checkbox" name="permisoIds" value={p.id} className="mt-0.5" />
                      <span>
                        <span className="font-mono text-xs text-texto-secundario">{p.codigo}</span>
                        <span className="block">{p.descripcion}</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Creando..." : "Crear rol"}
      </Button>
    </form>
  );
}
