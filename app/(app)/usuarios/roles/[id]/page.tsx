import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerRolConPermisos, listarCatalogoPermisos } from "@/lib/servicios/roles.service";
import { Card } from "@/components/ui/Card";
import { FormularioEditarRol } from "./FormularioEditarRol";

export default async function EditarRolPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPermiso("roles.gestionar");
  const { id } = await params;

  const [rol, permisos] = await Promise.all([
    obtenerRolConPermisos(id),
    listarCatalogoPermisos(),
  ]);
  if (!rol) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/usuarios/roles" className="text-texto-secundario hover:text-texto">
          <MdArrowBack size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-texto">Editar rol: {rol.nombre}</h1>
      </div>
      {rol.esRolSistema && (
        <p className="rounded-borde border border-alerta bg-alerta/10 p-3 text-sm text-texto">
          Este es uno de los 4 roles base del sistema. No se puede renombrar ni eliminar, pero
          cambiar sus permisos afecta a todos los usuarios que lo tienen asignado — hacelo con
          cuidado.
        </p>
      )}
      <Card>
        <FormularioEditarRol rol={rol} permisos={permisos} />
      </Card>
    </div>
  );
}
