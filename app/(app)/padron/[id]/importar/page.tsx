import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPadron } from "@/lib/servicios/padron.service";
import { Card } from "@/components/ui/Card";
import { ImportadorPadronCsv } from "./ImportadorPadronCsv";

export default async function ImportarPadronPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("padron.importar");
  const { id } = await params;

  const padron = await obtenerPadron(id);
  if (!padron) notFound();
  if (padron.estado !== "borrador") redirect(`/padron/${id}`);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-texto">Importar entradas — {padron.nombre}</h1>
        <p className="text-sm text-texto-secundario">
          Subí el archivo del padrón exportado a CSV. Cada fila se compara automáticamente contra
          las Personas ya cargadas (DNI primero, después nombre).
        </p>
      </div>
      <Card>
        <ImportadorPadronCsv padronId={padron.id} />
      </Card>
    </div>
  );
}
