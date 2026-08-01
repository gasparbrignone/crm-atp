"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { actualizarRolAction, eliminarRolAction } from "../actions";
import type { Permiso, Rol } from "@prisma/client";

interface RolConPermisos extends Rol {
  permisoIds: string[];
}

export function FormularioEditarRol({
  rol,
  permisos,
}: {
  rol: RolConPermisos;
  permisos: Permiso[];
}) {
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? "");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set(rol.permisoIds));
  const [error, setError] = useState<string | undefined>();
  const [pendiente, iniciarTransicion] = useTransition();
  const router = useRouter();

  const modulos = Array.from(new Set(permisos.map((p) => p.modulo)));

  function alternarPermiso(id: string) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function guardar() {
    if (seleccionados.size === 0) {
      setError("El rol necesita al menos un permiso.");
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await actualizarRolAction(
        rol.id,
        rol.esRolSistema ? { descripcion } : { nombre, descripcion },
        [...seleccionados],
      );
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setError(undefined);
      router.push("/usuarios/roles");
    });
  }

  function eliminar() {
    if (!window.confirm(`¿Eliminar el rol "${rol.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await eliminarRolAction(rol.id);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      router.push("/usuarios/roles");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Nombre del rol"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        disabled={rol.esRolSistema}
      />
      <Input label="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

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
                      <input
                        type="checkbox"
                        checked={seleccionados.has(p.id)}
                        onChange={() => alternarPermiso(p.id)}
                        className="mt-0.5"
                      />
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

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button onClick={guardar} disabled={pendiente}>
          {pendiente ? "Guardando..." : "Guardar cambios"}
        </Button>
        {!rol.esRolSistema && (
          <Button variant="peligro" onClick={eliminar} disabled={pendiente}>
            Eliminar rol
          </Button>
        )}
      </div>
    </div>
  );
}
