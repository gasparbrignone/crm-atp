import Link from "next/link";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { listarCatalogoPermisos } from "@/lib/servicios/roles.service";
import { Card } from "@/components/ui/Card";
import { FormularioNuevoRol } from "./FormularioNuevoRol";

export default async function NuevoRolPage() {
  await requerirPermiso("roles.gestionar");
  const permisos = await listarCatalogoPermisos();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-texto">Nuevo rol</h1>
        <Link href="/usuarios/roles" className="text-sm text-secundario hover:underline">
          Cancelar
        </Link>
      </div>
      <Card>
        <FormularioNuevoRol permisos={permisos} />
      </Card>
    </div>
  );
}
