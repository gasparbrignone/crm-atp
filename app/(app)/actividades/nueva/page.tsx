import Link from "next/link";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { FormularioActividad } from "../FormularioActividad";

// Alta de actividad — /06-modulo-actividades.md sección 4.
export default async function NuevaActividadPage() {
  const usuario = await requerirPermiso("actividades.crear");

  const [tipos, responsables, actividadesPadre] = await Promise.all([
    prisma.tipoActividad.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.usuario.findMany({ where: { estado: "activo" }, orderBy: { nombre: "asc" } }),
    prisma.actividad.findMany({
      where: { estado: { in: ["planificada", "en_curso"] } },
      orderBy: { fechaInicio: "desc" },
      select: { id: true, nombre: true },
      take: 200,
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-texto">Nueva actividad</h1>
        <Link href="/actividades" className="text-sm text-secundario hover:underline">
          Cancelar
        </Link>
      </div>
      <Card>
        <FormularioActividad
          tipos={tipos}
          responsables={responsables}
          actividadesPadre={actividadesPadre}
          responsableIdDefault={usuario.id}
        />
      </Card>
    </div>
  );
}
