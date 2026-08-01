import { notFound } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { ImportadorInscriptosCsv } from "./ImportadorInscriptosCsv";

export default async function ImportarInscriptosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("importaciones.ejecutar");
  const { id } = await params;

  const [actividad, carreras] = await Promise.all([
    prisma.actividad.findUnique({ where: { id }, select: { id: true, nombre: true } }),
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
  ]);
  if (!actividad) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-texto">Importar inscriptos desde CSV</h1>
        <p className="text-sm text-texto-secundario">Actividad: {actividad.nombre}</p>
      </div>
      <Card>
        <ImportadorInscriptosCsv actividadId={actividad.id} carreras={carreras} />
      </Card>
    </div>
  );
}
