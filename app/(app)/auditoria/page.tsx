import Link from "next/link";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import {
  listarAuditoriaGlobal,
  listarEntidadesAuditadas,
  type FiltrosAuditoriaGlobal,
} from "@/lib/servicios/auditoria.service";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableEmptyState } from "@/components/ui/Table";
import { tiempoRelativo } from "@/lib/utils/tiempo-relativo";
import type { AccionHistorial } from "@prisma/client";
import { ExportarAuditoriaBoton } from "./ExportarAuditoriaBoton";

const ACCIONES: AccionHistorial[] = [
  "crear",
  "editar",
  "archivar",
  "restaurar",
  "fusionar",
  "exportar",
  "importar",
  "login",
  "cambio_permiso",
  "otro",
];

// Vista de auditoría global — /17-auditoria-historial.md sección 7. Filtros
// por usuario/entidad/acción/rango de fechas, búsqueda por entidad puntual,
// exportable a CSV. Exclusivo del rol Administrador (auditoria.ver).
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirPermiso("auditoria.ver");
  const sp = await searchParams;
  const puedeVerPunteo = await tienePermiso("punteo.ver_todos");

  const filtros: FiltrosAuditoriaGlobal = {
    usuarioId: sp.usuarioId || undefined,
    entidad: sp.entidad || undefined,
    accion: (sp.accion as AccionHistorial) || undefined,
    entidadIdBusqueda: sp.entidadId || undefined,
    desde: sp.desde ? new Date(sp.desde) : undefined,
    hasta: sp.hasta ? new Date(`${sp.hasta}T23:59:59`) : undefined,
  };
  const pagina = sp.pagina ? Number(sp.pagina) : 1;

  const [{ eventos, total, paginas }, entidades, usuarios] = await Promise.all([
    listarAuditoriaGlobal(filtros, pagina, puedeVerPunteo),
    listarEntidadesAuditadas(puedeVerPunteo),
    prisma.usuario.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, apellido: true } }),
  ]);

  function hrefConFiltro(cambios: Record<string, string | undefined>) {
    const params = new URLSearchParams(
      Object.entries({ ...sp, ...cambios }).filter((e): e is [string, string] => !!e[1]),
    );
    return `/auditoria?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Auditoría</h1>
          <p className="text-sm text-texto-secundario">{total} evento(s)</p>
        </div>
        <ExportarAuditoriaBoton filtros={filtros} />
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Select name="usuarioId" label="Usuario" defaultValue={sp.usuarioId ?? ""} className="w-48">
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.apellido}
              </option>
            ))}
          </Select>
          <Select name="entidad" label="Entidad" defaultValue={sp.entidad ?? ""} className="w-44">
            <option value="">Todas</option>
            {entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Select name="accion" label="Acción" defaultValue={sp.accion ?? ""} className="w-40">
            <option value="">Todas</option>
            {ACCIONES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Input type="date" name="desde" label="Desde" defaultValue={sp.desde ?? ""} className="w-40" />
          <Input type="date" name="hasta" label="Hasta" defaultValue={sp.hasta ?? ""} className="w-40" />
          <Input
            name="entidadId"
            label="Id de entidad puntual"
            defaultValue={sp.entidadId ?? ""}
            className="w-56"
            placeholder="Pegar un id..."
          />
          <Button type="submit" variant="secundario">
            Filtrar
          </Button>
          {(sp.usuarioId || sp.entidad || sp.accion || sp.desde || sp.hasta || sp.entidadId) && (
            <Link href="/auditoria">
              <Button variant="fantasma" type="button">
                Limpiar
              </Button>
            </Link>
          )}
        </form>
      </Card>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Fecha</TableHeaderCell>
            <TableHeaderCell>Usuario</TableHeaderCell>
            <TableHeaderCell>Entidad</TableHeaderCell>
            <TableHeaderCell>Acción</TableHeaderCell>
            <TableHeaderCell>Detalle</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {eventos.length === 0 && <TableEmptyState>Sin eventos con estos filtros.</TableEmptyState>}
          {eventos.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-texto-secundario">
                <span title={e.fecha.toString()}>{tiempoRelativo(e.fecha)}</span>
              </TableCell>
              <TableCell>{e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : "(proceso automático)"}</TableCell>
              <TableCell>
                <span className="font-mono text-xs">{e.entidad}</span>
                <span className="ml-1.5 text-xs text-texto-secundario">{e.entidadId.slice(0, 8)}…</span>
              </TableCell>
              <TableCell>
                <span className="rounded-full bg-fondo-hover px-2 py-0.5 text-xs font-medium">{e.accion}</span>
              </TableCell>
              <TableCell className="max-w-md text-texto-secundario">
                {e.campo && (
                  <span>
                    <strong className="text-texto">{e.campo}</strong>
                    {e.valorAnterior !== null && e.valorNuevo !== null && (
                      <>
                        : {e.valorAnterior} → {e.valorNuevo}
                      </>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {paginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-texto-secundario">
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={hrefConFiltro({ pagina: String(pagina - 1) })}>
                <Button variant="secundario">Anterior</Button>
              </Link>
            )}
            {pagina < paginas && (
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
