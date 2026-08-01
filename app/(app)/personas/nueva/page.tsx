import Link from "next/link";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { FormularioNuevaPersona } from "./FormularioNuevaPersona";

// Alta manual — objetivo: menos de 30 segundos desde mobile
// (/05-modulo-personas.md sección 3, /20-roadmap.md Fase 1). Nombre y
// apellido son los únicos campos obligatorios; el resto se completa después.
export default async function NuevaPersonaPage() {
  await requerirPermiso("personas.crear");
  const carreras = await prisma.carrera.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-texto">Nueva persona</h1>
        <Link href="/personas" className="text-sm text-secundario hover:underline">
          Cancelar
        </Link>
      </div>
      <Card>
        <FormularioNuevaPersona carreras={carreras} />
      </Card>
    </div>
  );
}
