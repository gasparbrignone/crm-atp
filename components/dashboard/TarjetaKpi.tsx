import { MdArrowUpward, MdArrowDownward } from "react-icons/md";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

interface TarjetaKpiProps {
  etiqueta: string;
  valor: string;
  valorAnterior?: number | null;
  valorActualCrudo?: number;
  sufijoTendencia?: string;
}

// Tarjeta de KPI con tendencia — /11-dashboards.md sección 2: "cada indicador
// relevante se acompaña, donde tenga sentido, de su tendencia". Sin gráfico:
// un número con contexto temporal no necesita una visualización, solo la
// cifra y la dirección del cambio (ver skill de dataviz — "a veces la
// respuesta no es un gráfico").
export function TarjetaKpi({
  etiqueta,
  valor,
  valorAnterior,
  valorActualCrudo,
  sufijoTendencia = "vs. período anterior",
}: TarjetaKpiProps) {
  const tieneTendencia =
    valorAnterior !== undefined && valorAnterior !== null && valorActualCrudo !== undefined;
  const delta = tieneTendencia ? valorActualCrudo! - valorAnterior! : null;

  return (
    <Card className="flex flex-col gap-1.5">
      <p className="text-sm text-texto-secundario">{etiqueta}</p>
      <p className="text-2xl font-semibold text-texto tabular-nums">{valor}</p>
      {tieneTendencia && delta !== null && (
        <p
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            delta > 0 && "text-exito",
            delta < 0 && "text-error",
            delta === 0 && "text-texto-secundario",
          )}
        >
          {delta > 0 && <MdArrowUpward size={14} />}
          {delta < 0 && <MdArrowDownward size={14} />}
          {delta === 0 ? "Sin cambios" : `${delta > 0 ? "+" : ""}${delta}`} {sufijoTendencia}
        </p>
      )}
    </Card>
  );
}
