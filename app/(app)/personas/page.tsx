import Link from "next/link";
import { MdAdd, MdSearch } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { listarPersonas } from "@/lib/servicios/personas.service";
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
import { ETIQUETA_ESTADO_PADRON, COLOR_ESTADO_PADRON } from "@/lib/utils/persona-labels";

// Listado paginado de Personas — ver /05-modulo-personas.md sección 6.
export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirPermiso("personas.ver");
  const sp = await searchParams;

  const filtros = {
    q: sp.q,
    carreraId: sp.carreraId,
    anio: sp.anio,
    estadoPadron: sp.estadoPadron,
    estadoFicha: sp.estadoFicha ?? "activa",
    pagina: sp.pagina ? Number(sp.pagina) : 1,
    porPagina: sp.porPagina ? Number(sp.porPagina) : 50,
  };

  const [{ personas, total, pagina, porPagina }, carreras] = await Promise.all([
    listarPersonas(filtros),
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  function hrefConFiltro(cambios: Record<string, string | undefined>) {
    const params = new URLSearchParams(
      Object.entries({ ...sp, ...cambios }).filter(
        (entrada): entrada is [string, string] => !!entrada[1],
      ),
    );
    return `/personas?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Personas</h1>
          <p className="text-sm text-texto-secundario">
            {total} persona{total === 1 ? "" : "s"} en la base
          </p>
        </div>
        <Link href="/personas/nueva">
          <Button>
            <MdAdd size={18} />
            Nueva persona
          </Button>
        </Link>
      </div>

      <Card padding="chico">
        <form className="flex flex-wrap items-end gap-3" action="/personas">
          <div className="w-full sm:min-w-[220px] sm:flex-1">
            <Input
              name="q"
              placeholder="Buscar por nombre, apellido, DNI o legajo"
              defaultValue={sp.q}
            />
          </div>
          <Select name="carreraId" defaultValue={sp.carreraId ?? ""} className="w-auto">
            <option value="">Todas las carreras</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select name="anio" defaultValue={sp.anio ?? ""} className="w-auto">
            <option value="">Todos los años</option>
            {[1, 2, 3, 4, 5, 6].map((a) => (
              <option key={a} value={a}>
                Año {a}
              </option>
            ))}
          </Select>
          <Select name="estadoPadron" defaultValue={sp.estadoPadron ?? ""} className="w-auto">
            <option value="">Todo estado de padrón</option>
            {Object.entries(ETIQUETA_ESTADO_PADRON).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="estadoFicha" defaultValue={sp.estadoFicha ?? "activa"} className="w-auto">
            <option value="activa">Activas</option>
            <option value="archivada">Archivadas</option>
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
            <TableHeaderCell>DNI</TableHeaderCell>
            <TableHeaderCell>Carrera</TableHeaderCell>
            <TableHeaderCell>Año</TableHeaderCell>
            <TableHeaderCell>Estado de padrón</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {personas.length === 0 && (
            <TableEmptyState>
              Todavía no cargaste ninguna Persona —{" "}
              <Link href="/personas/nueva" className="text-secundario hover:underline">
                dar de alta la primera
              </Link>
              .
            </TableEmptyState>
          )}
          {personas.map((persona) => (
            <TableRow key={persona.id}>
              <TableCell>
                <Link href={`/personas/${persona.id}`} className="group flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secundario/10 text-xs font-semibold text-secundario">
                    {persona.nombre[0]}
                    {persona.apellido[0]}
                  </span>
                  <span className="font-medium text-texto group-hover:text-secundario">
                    {persona.apellido}, {persona.nombre}
                  </span>
                </Link>
              </TableCell>
              <TableCell>{persona.dni ?? "—"}</TableCell>
              <TableCell>{persona.carrera?.nombre ?? "—"}</TableCell>
              <TableCell>{persona.anio ?? "—"}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_PADRON[persona.estadoPadron]}`}
                >
                  {ETIQUETA_ESTADO_PADRON[persona.estadoPadron]}
                </span>
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
              <Link href={hrefConFiltro({ pagina: String(pagina - 1) })}>
                <Button variant="secundario">Anterior</Button>
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={hrefConFiltro({ pagina: String(pagina + 1) })}>
                <Button variant="secundario">Siguiente</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
