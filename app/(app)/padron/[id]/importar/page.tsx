import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPadron } from "@/lib/servicios/padron.service";
import { Card } from "@/components/ui/Card";
import { SelectorFuenteImportacion } from "./SelectorFuenteImportacion";

// El procesamiento de PDF llama a la IA en lotes de páginas y puede tardar
// varios minutos en documentos grandes (/15-ia.md sección 10) — ver nota en
// PROMPT-CONTINUAR.md sobre el límite real dependiendo del plan de Vercel.
export const maxDuration = 300;

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
          Subí el padrón oficial (PDF, incluso escaneado) o un CSV/Excel exportado. Cada fila se
          compara automáticamente contra las Personas ya cargadas (DNI primero, después nombre).
        </p>
      </div>
      <Card>
        <SelectorFuenteImportacion padronId={padron.id} />
      </Card>
    </div>
  );
}
