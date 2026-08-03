import Link from "next/link";
import { MdEvent, MdWarning, MdHistory, MdAutoAwesome } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import {
  obtenerKpisAdmin,
  obtenerEvolucionPersonas,
  obtenerParticipacionPorTipoActividad,
  obtenerDistribucionPorCarreraYAnio,
  obtenerRankingActividadesPorAsistencia,
  obtenerAgregadosPunteoAdmin,
  obtenerPanelOperativo,
  obtenerDashboardPersonal,
  type RangoFecha,
} from "@/lib/servicios/dashboard.service";
import { obtenerInsightsDashboardCacheados } from "@/lib/ia/insights-cache";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { TarjetaKpi } from "@/components/dashboard/TarjetaKpi";
import { GraficoBarras } from "@/components/dashboard/GraficoBarras";
import { GraficoLinea } from "@/components/dashboard/GraficoLinea";
import { GraficoBarrasApiladas } from "@/components/dashboard/GraficoBarrasApiladas";
import {
  ETIQUETA_ESTADO_ACTIVIDAD,
  COLOR_ESTADO_ACTIVIDAD,
} from "@/lib/utils/actividad-labels";

const ETIQUETA_RANGO: Record<RangoFecha, string> = {
  semana: "Esta semana",
  mes: "Este mes",
  cuatrimestre: "Este cuatrimestre",
  todo: "Todo",
};

const ETIQUETA_ACCION_HISTORIAL: Record<string, string> = {
  crear: "creó",
  editar: "editó",
  archivar: "archivó",
  restaurar: "restauró",
  fusionar: "fusionó",
  exportar: "exportó",
  importar: "importó",
  login: "inició sesión",
  cambio_permiso: "cambió un permiso de",
  otro: "modificó",
};

function formatoFechaCorta(fecha: Date) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(fecha);
}

function formatoFechaHora(fecha: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const usuario = await requerirPermiso("dashboard.ver_personal");
  const sp = await searchParams;

  const [puedeVerAdmin, puedeVerPersonal] = await Promise.all([
    tienePermiso("dashboard.ver_administrativo"),
    tienePermiso("dashboard.ver_personal"),
  ]);

  const vista: "admin" | "personal" =
    sp.vista === "personal" ? "personal" : sp.vista === "admin" ? "admin" : puedeVerAdmin ? "admin" : "personal";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Dashboard</h1>
          <p className="text-sm text-texto-secundario">
            {vista === "admin"
              ? "Visibilidad agregada de la actividad de ATP."
              : "Tu actividad personal en el sistema."}
          </p>
        </div>
        {puedeVerAdmin && puedeVerPersonal && (
          <div className="flex gap-2">
            <Link href="/dashboard?vista=admin">
              <Button variant={vista === "admin" ? "primario" : "secundario"}>Administrativo</Button>
            </Link>
            <Link href="/dashboard?vista=personal">
              <Button variant={vista === "personal" ? "primario" : "secundario"}>Personal</Button>
            </Link>
          </div>
        )}
      </div>

      {vista === "admin" && puedeVerAdmin ? (
        <DashboardAdministrativo sp={sp} />
      ) : (
        <DashboardPersonal usuarioId={usuario.id} />
      )}
    </div>
  );
}

async function DashboardAdministrativo({ sp }: { sp: Record<string, string | undefined> }) {
  const rango: RangoFecha =
    sp.rango === "semana" || sp.rango === "cuatrimestre" || sp.rango === "todo" ? sp.rango : "mes";
  const filtros = { rango, carreraId: sp.carreraId, tipoActividadId: sp.tipoActividadId };

  const puedeVerRankingMilitantes = await tienePermiso("punteo.ver_todos");

  const [
    carreras,
    tiposActividad,
    kpis,
    evolucion,
    participacionPorTipo,
    distribucionCarreraAnio,
    ranking,
    agregadosPunteo,
    panelOperativo,
  ] = await Promise.all([
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.tipoActividad.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    obtenerKpisAdmin(filtros),
    obtenerEvolucionPersonas(filtros),
    obtenerParticipacionPorTipoActividad(filtros),
    obtenerDistribucionPorCarreraYAnio(),
    obtenerRankingActividadesPorAsistencia(filtros),
    obtenerAgregadosPunteoAdmin(puedeVerRankingMilitantes),
    obtenerPanelOperativo(),
  ]);

  const insights = await obtenerInsightsDashboardCacheados({
    rango: ETIQUETA_RANGO[rango],
    kpis,
    participacionPorTipo,
    distribucionCarreraAnio,
    rankingActividades: ranking.map((a) => ({ nombre: a.nombre, tasaAsistencia: a.tasaAsistencia })),
    coberturaPunteo: agregadosPunteo.cobertura,
    distribucionClasificacion: agregadosPunteo.distribucionClasificacion,
  }).catch(() => []);

  const gruposCarreraAnio = Object.values(
    distribucionCarreraAnio.reduce<Record<string, { etiqueta: string; segmentos: { etiqueta: string; valor: number }[] }>>(
      (acc, fila) => {
        acc[fila.carrera] ??= { etiqueta: fila.carrera, segmentos: [] };
        acc[fila.carrera].segmentos.push({
          etiqueta: fila.anio ? String(fila.anio) : "Sin año",
          valor: fila.cantidad,
        });
        return acc;
      },
      {},
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card padding="chico">
        <form className="flex flex-wrap items-end gap-3" action="/dashboard">
          <input type="hidden" name="vista" value="admin" />
          <Select name="rango" defaultValue={rango} className="w-auto">
            {Object.entries(ETIQUETA_RANGO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="carreraId" defaultValue={sp.carreraId ?? ""} className="w-auto">
            <option value="">Todas las carreras</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select name="tipoActividadId" defaultValue={sp.tipoActividadId ?? ""} className="w-auto">
            <option value="">Todos los tipos de actividad</option>
            {tiposActividad.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secundario">
            Filtrar
          </Button>
        </form>
      </Card>

      {insights.length > 0 && (
        <Card>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-texto">
            <MdAutoAwesome size={16} /> Lo más relevante de este período
          </h2>
          <ul className="flex flex-col gap-2">
            {insights.map((insight, i) => (
              <li key={i} className="text-sm text-texto">
                {insight.seccion ? (
                  <a href={`#seccion-${insight.seccion}`} className="hover:underline">
                    {insight.texto}
                  </a>
                ) : (
                  insight.texto
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaKpi
          etiqueta="Personas activas totales"
          valor={String(kpis.personasActivas.valor)}
          valorActualCrudo={kpis.personasActivas.valor}
          valorAnterior={kpis.personasActivas.valorAnterior}
        />
        <TarjetaKpi
          etiqueta="Personas nuevas cargadas"
          valor={String(kpis.personasNuevas.valor)}
          valorActualCrudo={kpis.personasNuevas.valor}
          valorAnterior={kpis.personasNuevas.valorAnterior}
        />
        <TarjetaKpi
          etiqueta="Actividades realizadas"
          valor={String(kpis.actividadesFinalizadas.valor)}
          valorActualCrudo={kpis.actividadesFinalizadas.valor}
          valorAnterior={kpis.actividadesFinalizadas.valorAnterior}
        />
        <TarjetaKpi
          etiqueta="Tasa de asistencia promedio"
          valor={kpis.tasaAsistencia !== null ? `${Math.round(kpis.tasaAsistencia * 100)}%` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card id="seccion-evolucion">
          <h2 className="mb-3 text-sm font-semibold text-texto">Personas cargadas en el tiempo</h2>
          <GraficoLinea
            puntos={evolucion.map((e) => ({ etiqueta: e.periodo, valor: e.cantidad }))}
          />
        </Card>
        <Card id="seccion-participacionPorTipo">
          <h2 className="mb-3 text-sm font-semibold text-texto">Participación por tipo de actividad</h2>
          <GraficoBarras
            items={participacionPorTipo.map((p) => ({
              etiqueta: p.nombre,
              valor: p.cantidad,
              color: p.color ?? undefined,
            }))}
          />
        </Card>
        <Card id="seccion-distribucionCarrera">
          <h2 className="mb-3 text-sm font-semibold text-texto">Distribución de personas por carrera y año</h2>
          <GraficoBarrasApiladas grupos={gruposCarreraAnio} />
        </Card>
        <Card id="seccion-rankingActividades">
          <h2 className="mb-3 text-sm font-semibold text-texto">Ranking de actividades por asistencia</h2>
          {ranking.length === 0 ? (
            <p className="py-8 text-center text-sm text-texto-secundario">
              Sin actividades finalizadas en este período.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ranking.map((a, i) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 shrink-0 text-texto-secundario">{i + 1}</span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color ?? "var(--color-chart-serie-1)" }}
                  />
                  <span className="flex-1 truncate text-texto">{a.nombre}</span>
                  <span className="shrink-0 font-semibold text-texto tabular-nums">
                    {Math.round(a.tasaAsistencia * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card id="seccion-coberturaPunteo">
          <h2 className="mb-3 text-sm font-semibold text-texto">Cobertura de punteo</h2>
          {agregadosPunteo.cobertura.cobertura === null ? (
            <p className="py-8 text-center text-sm text-texto-secundario">
              Todavía no hay un padrón activo con personas habilitadas.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-3xl font-semibold text-texto tabular-nums">
                {Math.round(agregadosPunteo.cobertura.cobertura * 100)}%
              </p>
              <p className="text-sm text-texto-secundario">
                {agregadosPunteo.cobertura.conPunteo} de {agregadosPunteo.cobertura.personasEnPadron} personas
                habilitadas del padrón activo tienen al menos un punteo cargado.
              </p>
            </div>
          )}
        </Card>
        <Card id="seccion-distribucionClasificacion">
          <h2 className="mb-3 text-sm font-semibold text-texto">Distribución de clasificación de punteo</h2>
          {agregadosPunteo.distribucionClasificacion.every((c) => c.cantidad === 0) ? (
            <p className="py-8 text-center text-sm text-texto-secundario">Todavía no hay punteos cargados.</p>
          ) : (
            <GraficoBarras
              items={agregadosPunteo.distribucionClasificacion.map((c) => ({
                etiqueta: c.nombre,
                valor: c.cantidad,
                color: c.color ?? undefined,
              }))}
            />
          )}
        </Card>
        {agregadosPunteo.rankingMilitantes && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-texto">Ranking de militantes por volumen de punteo</h2>
            {agregadosPunteo.rankingMilitantes.length === 0 ? (
              <p className="py-8 text-center text-sm text-texto-secundario">
                Todavía nadie tiene punteo en seguimiento.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {agregadosPunteo.rankingMilitantes.map((m, i) => (
                  <div key={m.usuarioId} className="flex items-center gap-3 text-sm">
                    <span className="w-5 shrink-0 text-texto-secundario">{i + 1}</span>
                    <span className="flex-1 truncate text-texto">{m.nombre}</span>
                    <span className="shrink-0 font-semibold text-texto tabular-nums">{m.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-texto">Panel de estado operativo</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              <MdEvent size={14} /> Próximos 7 días
            </p>
            {panelOperativo.actividadesProximas.length === 0 ? (
              <p className="text-sm text-texto-secundario">No hay actividades planificadas.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {panelOperativo.actividadesProximas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/actividades/${a.id}`} className="truncate text-secundario hover:underline">
                      {a.nombre}
                    </Link>
                    <span className="shrink-0 text-xs text-texto-secundario">
                      {formatoFechaCorta(a.fechaInicio)} · {a.tipoActividad.nombre}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              <MdWarning size={14} /> Importaciones con errores pendientes
            </p>
            {panelOperativo.importacionesConErrores.length === 0 ? (
              <p className="text-sm text-texto-secundario">Sin errores pendientes de revisión.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {panelOperativo.importacionesConErrores.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-texto">{job.entidadDestino}</span>
                    <span className="shrink-0 text-xs text-error">
                      {job.filasConError} de {job.totalFilas ?? "?"} filas con error
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

async function DashboardPersonal({ usuarioId }: { usuarioId: string }) {
  const { misActividades, miHistorialReciente } = await obtenerDashboardPersonal(usuarioId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-texto">
          <MdEvent size={16} /> Mis actividades
        </h2>
        {misActividades.length === 0 ? (
          <p className="py-8 text-center text-sm text-texto-secundario">
            No sos responsable de ninguna actividad planificada o en curso.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {misActividades.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/actividades/${a.id}`}
                    className="block truncate text-sm font-medium text-secundario hover:underline"
                  >
                    {a.nombre}
                  </Link>
                  <p className="text-xs text-texto-secundario">
                    {formatoFechaCorta(a.fechaInicio)} · {a.tipoActividad.nombre} ·{" "}
                    <span className={COLOR_ESTADO_ACTIVIDAD[a.estado]}>
                      {ETIQUETA_ESTADO_ACTIVIDAD[a.estado]}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-xs text-texto-secundario tabular-nums">
                  {a.inscriptos}
                  {a.cupoMaximo ? `/${a.cupoMaximo}` : ""} inscriptos
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-texto">
          <MdHistory size={16} /> Mi historial reciente
        </h2>
        {miHistorialReciente.length === 0 ? (
          <p className="py-8 text-center text-sm text-texto-secundario">
            Todavía no registraste ninguna acción.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {miHistorialReciente.map((h) => (
              <li key={h.id} className="text-sm text-texto">
                <span className="text-texto-secundario">{formatoFechaHora(h.fecha)}</span>{" "}
                {ETIQUETA_ACCION_HISTORIAL[h.accion] ?? h.accion} {h.entidad.toLowerCase()}
                {h.campo ? ` (${h.campo})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
