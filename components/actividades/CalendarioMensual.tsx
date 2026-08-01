import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface ActividadCalendario {
  id: string;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  tipoActividad: { nombre: string; color: string | null };
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function claveDia(fecha: Date) {
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
}

// Vista de calendario mensual — /06-modulo-actividades.md sección 7 (vista de
// calendario por defecto, intercambiable con la de lista). Server Component
// puro: solo navegación por Link, sin interactividad de cliente.
export function CalendarioMensual({
  anio,
  mes,
  actividades,
  hrefBase,
}: {
  anio: number;
  mes: number; // 0-11
  actividades: ActividadCalendario[];
  hrefBase: (params: Record<string, string>) => string;
}) {
  const primerDiaMes = new Date(anio, mes, 1);
  const ultimoDiaMes = new Date(anio, mes + 1, 0);
  // Offset para que la semana empiece en lunes (getDay(): 0=domingo).
  const offsetInicio = (primerDiaMes.getDay() + 6) % 7;

  const celdas: (Date | null)[] = [];
  for (let i = 0; i < offsetInicio; i++) celdas.push(null);
  for (let d = 1; d <= ultimoDiaMes.getDate(); d++) celdas.push(new Date(anio, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);

  const actividadesPorDia = new Map<string, ActividadCalendario[]>();
  for (const act of actividades) {
    const inicio = new Date(act.fechaInicio);
    const fin = act.fechaFin ? new Date(act.fechaFin) : inicio;
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const finCursor = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
    let guard = 0;
    while (cursor <= finCursor && guard < 62) {
      const clave = claveDia(cursor);
      const lista = actividadesPorDia.get(clave) ?? [];
      lista.push(act);
      actividadesPorDia.set(clave, lista);
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  const hoy = new Date();
  const mesAnteriorFecha = new Date(anio, mes - 1, 1);
  const mesSiguienteFecha = new Date(anio, mes + 1, 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href={hrefBase({
            anio: String(mesAnteriorFecha.getFullYear()),
            mes: String(mesAnteriorFecha.getMonth() + 1),
          })}
          className="rounded-borde-chico px-3 py-2 text-sm font-medium text-texto-secundario hover:bg-fondo-hover"
        >
          ← Anterior
        </Link>
        <h2 className="text-sm font-semibold text-texto">
          {MESES[mes]} {anio}
        </h2>
        <Link
          href={hrefBase({
            anio: String(mesSiguienteFecha.getFullYear()),
            mes: String(mesSiguienteFecha.getMonth() + 1),
          })}
          className="rounded-borde-chico px-3 py-2 text-sm font-medium text-texto-secundario hover:bg-fondo-hover"
        >
          Siguiente →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-borde border border-borde bg-borde text-xs">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="bg-fondo-hover px-2 py-1.5 text-center font-semibold text-texto-secundario">
            {d}
          </div>
        ))}
        {celdas.map((fecha, i) => {
          if (!fecha) return <div key={i} className="min-h-24 bg-fondo-superficie/40" />;
          const lista = actividadesPorDia.get(claveDia(fecha)) ?? [];
          const esHoy = claveDia(fecha) === claveDia(hoy);
          return (
            <div key={i} className="flex min-h-24 flex-col gap-1 bg-fondo-superficie p-1.5">
              <span
                className={cn(
                  "self-start rounded-full px-1.5 text-[11px] font-semibold",
                  esHoy ? "bg-primario text-white" : "text-texto-secundario",
                )}
              >
                {fecha.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {lista.slice(0, 3).map((act) => (
                  <Link
                    key={act.id}
                    href={`/actividades/${act.id}`}
                    title={act.nombre}
                    className="truncate rounded px-1 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: act.tipoActividad.color ?? "#64748b" }}
                  >
                    {act.nombre}
                  </Link>
                ))}
                {lista.length > 3 && (
                  <span className="px-1 text-[10px] text-texto-secundario">
                    +{lista.length - 3} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
