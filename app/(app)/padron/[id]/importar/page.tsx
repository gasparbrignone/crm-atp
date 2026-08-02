import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPadron } from "@/lib/servicios/padron.service";
import { Card } from "@/components/ui/Card";
import { SelectorFuenteImportacion } from "./SelectorFuenteImportacion";

// El procesamiento de PDF ahora se hace lote por lote (ver
// procesarSiguienteLotePadronAction), un request de servidor por lote, en
// vez de una sola llamada — la lectura completa de un padrón real puede
// tardar varios minutos contra la cuota gratuita de Gemini (15 req/min, ver
// /15-ia.md sección 8), mucho más de lo que aguanta una sola función
// serverless, pero cada lote individual entra cómodo en el máximo real del
// plan gratuito de Vercel (Hobby, con Fluid Compute: 300s de default Y de
// máximo — confirmado contra la documentación oficial 2026-08-02, no 60 ni
// 800 como se asumió por error en intentos previos). Si un lote puntual se
// pasa igual (un reintento largo por cuota), el cliente simplemente
// reintenta ese mismo lote — no se pierde progreso porque cada lote se
// cuenta como procesado recién cuando termina con éxito.
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
