import Link from "next/link";
import { MdAdd, MdSearch, MdViewList, MdCalendarMonth } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { listarActividades, listarActividadesEnRango } from "@/lib/servicios/actividades.service";
import { prisma } from "@/lib/prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";
import { CalendarioMensual } from "@/components/actividades/CalendarioMensual";
import {
  ETIQUETA_ESTADO_ACTIVIDAD,
  COLOR_ESTADO_ACTIVIDAD,
  ETIQUETA_MODALIDAD,
} from "@/lib/utils/actividad-labels";

// Listado de Actividades — vista de calendario (por defecto) y vista de
// lista, intercambiables — /06-modulo-actividades.md sección 7.
export default async function ActividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirPermiso("actividades.ver");
  const sp = await searchParams;
  const vista = sp.vista === "lista" ? "lista" : "calendario";

  const [tipos, responsables] = await Promise.all([
    prisma.tipoActividad.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.usuario.findMany({ where: { estado: "activo" }, orderBy: { nombre: "asc" } }),
  ]);

  function hrefConFiltro(cambios: Record<string, string | undefined>) {
    const params = new URLSearchParams(
      Object.entries({ ...sp, ...cambios }).filter(
        (entrada): entrada is [string, string] => !!entrada[1],
      ),
    );
    return `/actividades?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Actividades</h1>
          <p className="text-sm text-texto-secundario">
            Repasos, simulacros, congresos y todo evento que organice ATP.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={hrefConFiltro({ vista: vista === "lista" ? "calendario" : "lista" })}>
            <Button variant="secundario">
              {vista === "lista" ? <MdCalendarMonth size={18} /> : <MdViewList size={18} />}
              {vista === "lista" ? "Ver calendario" : "Ver lista"}
            </Button>
          </Link>
          <Link href="/actividades/nueva">
            <Button>
              <MdAdd size={18} />
              Nueva actividad
            </Button>
          </Link>
        </div>
      </div>

      {vista === "lista" ? (
        <VistaLista
          sp={sp}
          tipos={tipos}
          responsables={responsables}
          hrefConFiltro={hrefConFiltro}
        />
      ) : (
        <VistaCalendario sp={sp} hrefConFiltro={hrefConFiltro} />
      )}
    </div>
  );
}

async function VistaLista({
  sp,
  tipos,
  responsables,
  hrefConFiltro,
}: {
  sp: Record<string, string | undefined>;
  tipos: { id: string; nombre: string }[];
  responsables: { id: string; nombre: string; apellido: string }[];
  hrefConFiltro: (cambios: Record<string, string | undefined>) => string;
}) {
  const filtros = {
    q: sp.q,
    tipoActividadId: sp.tipoActividadId,
    estado: sp.estado,
    modalidad: sp.modalidad,
    responsableId: sp.responsableId,
    pagina: sp.pagina ? Number(sp.pagina) : 1,
    porPagina: sp.porPagina ? Number(sp.porPagina) : 25,
  };

  const { actividades, total, pagina, porPagina } = await listarActividades(filtros);
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <>
      <Card padding="chico">
        <form className="flex flex-wrap items-end gap-3" action="/actividades">
          <input type="hidden" name="vista" value="lista" />
          <div className="min-w-[220px] flex-1">
            <Input name="q" placeholder="Buscar por nombre o lugar" defaultValue={sp.q} />
          </div>
          <Select name="tipoActividadId" defaultValue={sp.tipoActividadId ?? ""} className="w-auto">
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <Select name="estado" defaultValue={sp.estado ?? ""} className="w-auto">
            <option value="">Todo estado</option>
            {Object.entries(ETIQUETA_ESTADO_ACTIVIDAD).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="modalidad" defaultValue={sp.modalidad ?? ""} className="w-auto">
            <option value="">Toda modalidad</option>
            {Object.entries(ETIQUETA_MODALIDAD).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="responsableId" defaultValue={sp.responsableId ?? ""} className="w-auto">
            <option value="">Todo responsable</option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} {r.apellido}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secundario">
            <MdSearch size={18} />
            Filtrar
          </Button>
        </form>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Fecha</TableHeaderCell>
            <TableHeaderCell>Modalidad</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Inscriptos</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {actividades.length === 0 && (
            <TableEmptyState>
              Todavía no cargaste ninguna actividad —{" "}
              <Link href="/actividades/nueva" className="text-secundario hover:underline">
                dar de alta la primera
              </Link>
              .
            </TableEmptyState>
          )}
          {actividades.map((actividad) => (
            <TableRow key={actividad.id}>
              <TableCell>
                <Link
                  href={`/actividades/${actividad.id}`}
                  className="font-medium text-texto hover:text-secundario"
                >
                  {actividad.nombre}
                </Link>
                {actividad.actividadPadre && (
                  <p className="text-xs text-texto-secundario">
                    Parte de {actividad.actividadPadre.nombre}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: actividad.tipoActividad.color ?? "#64748b" }}
                >
                  {actividad.tipoActividad.nombre}
                </span>
              </TableCell>
              <TableCell>
                {new Date(actividad.fechaInicio).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </TableCell>
              <TableCell>{ETIQUETA_MODALIDAD[actividad.modalidad]}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_ACTIVIDAD[actividad.estado]}`}
                >
                  {ETIQUETA_ESTADO_ACTIVIDAD[actividad.estado]}
                </span>
              </TableCell>
              <TableCell>
                {actividad._count.participaciones}
                {actividad.cupoMaximo ? ` / ${actividad.cupoMaximo}` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-texto-secundario">
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={hrefConFiltro({ vista: "lista", pagina: String(pagina - 1) })}>
                <Button variant="secundario">Anterior</Button>
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={hrefConFiltro({ vista: "lista", pagina: String(pagina + 1) })}>
                <Button variant="secundario">Siguiente</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

async function VistaCalendario({
  sp,
  hrefConFiltro,
}: {
  sp: Record<string, string | undefined>;
  hrefConFiltro: (cambios: Record<string, string | undefined>) => string;
}) {
  const hoy = new Date();
  const anio = sp.anio ? Number(sp.anio) : hoy.getFullYear();
  const mes = sp.mes ? Number(sp.mes) - 1 : hoy.getMonth();

  const desde = new Date(anio, mes, 1);
  const hasta = new Date(anio, mes + 1, 0, 23, 59, 59);
  const actividades = await listarActividadesEnRango(desde, hasta);

  return (
    <Card>
      <CalendarioMensual
        anio={anio}
        mes={mes}
        actividades={actividades}
        hrefBase={(params) => hrefConFiltro({ vista: "calendario", ...params })}
      />
    </Card>
  );
}
