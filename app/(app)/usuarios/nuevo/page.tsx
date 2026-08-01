import Link from "next/link";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { FormularioInvitarUsuario } from "./FormularioInvitarUsuario";

export default async function InvitarUsuarioPage() {
  await requerirPermiso("usuarios.gestionar");
  const roles = await prisma.rol.findMany({ orderBy: { nombre: "asc" } });

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-texto">Invitar usuario</h1>
        <Link href="/usuarios" className="text-sm text-secundario hover:underline">
          Cancelar
        </Link>
      </div>
      <Card>
        <FormularioInvitarUsuario roles={roles} />
      </Card>
    </div>
  );
}
