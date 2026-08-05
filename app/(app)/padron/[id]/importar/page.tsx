import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPadron } from "@/lib/servicios/padron.service";
import { Card } from "@/components/ui/Card";
import { SelectorFuenteImportacion } from "./SelectorFuenteImportacion";

// El procesamiento de PDF se hace lote por lote (ver
// procesarSiguienteLotePadronAction), un request de servidor por lote, en
// vez de una sola llamada — la lectura del PDF en sí es 100% determinística
// desde 2026-08-04 (lib/padron/lectura-padron.ts, sin IA, ver CLAUDE.md
// sección 7 S6), pero el matching de miles de filas contra la base real
// (miles de consultas a Postgres) puede tardar más que el máximo real del
// plan gratuito de Vercel (Hobby, con Fluid Compute: 300s de default Y de
// máximo — confirmado contra la documentación oficial 2026-08-02, no 60 ni
// 800 como se asumió por error en intentos previos) si se hiciera todo en
// una sola función. Cada lote individual entra cómodo en ese límite. Si un
// lote puntual falla (corte transitorio de conexión), el cliente
// simplemente reintenta ese mismo lote — no se pierde progreso porque cada
// lote se cuenta como procesado recién cuando termina con éxito.
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
