import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import {
  obtenerPadron,
  obtenerResumenPadron,
  listarEntradasPadron,
} from "@/lib/servicios/padron.service";
import { Card } from "@/components/ui/Card";
import { FilaPendiente } from "@/components/padron/FilaPendiente";
import { FilaSinCoincidencia } from "@/components/padron/FilaSinCoincidencia";
import { PanelActivacion } from "@/components/padron/PanelActivacion";

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  activo: "Activo",
  cerrado: "Cerrado",
};

interface CandidatoGuardado {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Revisión de matching de un padrón — /09-modulo-padron-electoral.md sección
// 6: agrupado por estado, con acción directa para resolver cada entrada. Un
// padrón no puede activarse mientras tenga entradas `pendiente` sin resolver.
export default async function PadronDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPermiso("padron.ver");
  const { id } = await params;

  const [padron, resumen, entradas, puedeGestionar] = await Promise.all([
    obtenerPadron(id),
    obtenerResumenPadron(id),
    listarEntradasPadron(id),
    tienePermiso("padron.gestionar"),
  ]);
  if (!padron) notFound();

  const pendientes = entradas.filter((e) => e.estadoMatching === "pendiente");
  const sinCoincidencia = entradas.filter((e) => e.estadoMatching === "sin_coincidencia");
  const vinculadas = entradas.filter(
    (e) => e.estadoMatching === "vinculado_automatico" || e.estadoMatching === "vinculado_manual",
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/padron"
        className="inline-flex w-fit items-center gap-1 text-sm text-texto-secundario hover:text-texto"
      >
        <MdArrowBack size={16} />
        Padrón electoral
      </Link>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-texto">{padron.nombre}</h1>
            <p className="text-sm text-texto-secundario">
              {ETIQUETA_ESTADO[padron.estado]}
              {padron.fechaEleccion &&
                ` · Elección: ${new Date(padron.fechaEleccion).toLocaleDateString("es-AR")}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-texto-secundario">
          <span>Total: {resumen.total}</span>
          <span>Vinculadas: {resumen.vinculado_automatico + resumen.vinculado_manual}</span>
          <span>Pendientes: {resumen.pendiente}</span>
          <span>Sin coincidencia: {resumen.sin_coincidencia}</span>
        </div>
        {puedeGestionar && (
          <PanelActivacion
            padronId={padron.id}
            estado={padron.estado}
            puedeActivarse={resumen.puedeActivarse}
            pendientes={resumen.pendiente}
          />
        )}
      </Card>

      {puedeGestionar && pendientes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-texto">
            Pendientes de confirmación ({pendientes.length})
          </h2>
          {pendientes.map((e) => {
            let candidatos: CandidatoGuardado[] = [];
            let motivo = "Coincidencia probable, sin confirmar.";
            try {
              const parseado = JSON.parse(e.candidatosSugeridos ?? "{}") as {
                motivo?: string;
                candidatos?: CandidatoGuardado[];
              };
              if (Array.isArray(parseado.candidatos)) candidatos = parseado.candidatos;
              if (parseado.motivo) motivo = parseado.motivo;
            } catch {
              candidatos = [];
            }
            return (
              <FilaPendiente
                key={e.id}
                padronId={padron.id}
                entradaId={e.id}
                dni={e.dni}
                nombreCompletoOriginal={e.nombreCompletoOriginal}
                motivo={motivo}
                candidatos={candidatos}
              />
            );
          })}
        </section>
      )}

      {puedeGestionar && sinCoincidencia.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-texto">
            Sin coincidencia ({sinCoincidencia.length})
          </h2>
          {sinCoincidencia.map((e) => (
            <FilaSinCoincidencia
              key={e.id}
              padronId={padron.id}
              entradaId={e.id}
              dni={e.dni}
              nombreCompletoOriginal={e.nombreCompletoOriginal}
            />
          ))}
        </section>
      )}

      {vinculadas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-texto">
            Vinculadas ({vinculadas.length})
          </h2>
          <Card padding="chico" className="flex flex-col divide-y divide-borde">
            {vinculadas.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 px-2 py-2 text-sm">
                <span className="text-texto-secundario">{e.nombreCompletoOriginal}</span>
                <span className="text-texto">
                  {e.persona ? `${e.persona.apellido}, ${e.persona.nombre}` : "—"}
                  <span className="ml-2 text-xs text-texto-secundario">
                    ({e.estadoMatching === "vinculado_automatico" ? "automático" : "manual"})
                  </span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {entradas.length === 0 && (
        <Card className="text-center text-sm text-texto-secundario">
          Todavía no se importó ninguna entrada.{" "}
          {puedeGestionar && (
            <Link href={`/padron/${padron.id}/importar`} className="text-secundario hover:underline">
              Importar CSV
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
