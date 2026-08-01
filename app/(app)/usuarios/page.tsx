import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { listarUsuarios } from "@/lib/servicios/usuarios.service";
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

function formatoFecha(fecha: Date | null) {
  if (!fecha) return "Nunca";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(
    fecha,
  );
}

// Listado de usuarios del sistema — /10-usuarios-roles-permisos.md sección 6.
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirPermiso("usuarios.ver");
  const sp = await searchParams;

  const filtros = {
    q: sp.q,
    rolId: sp.rolId,
    estado: sp.estado,
    pagina: sp.pagina ? Number(sp.pagina) : 1,
  };

  const [{ usuarios, total, pagina, porPagina }, roles, puedeGestionar] = await Promise.all([
    listarUsuarios(filtros),
    prisma.rol.findMany({ orderBy: { nombre: "asc" } }),
    tienePermiso("usuarios.gestionar"),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  function hrefConFiltro(cambios: Record<string, string | undefined>) {
    const params = new URLSearchParams(
      Object.entries({ ...sp, ...cambios }).filter(
        (entrada): entrada is [string, string] => !!entrada[1],
      ),
    );
    return `/usuarios?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Usuarios</h1>
          <p className="text-sm text-texto-secundario">
            {total} usuario{total === 1 ? "" : "s"} del sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/usuarios/roles">
            <Button variant="secundario">Roles</Button>
          </Link>
          {puedeGestionar && (
            <Link href="/usuarios/nuevo">
              <Button>
                <MdAdd size={18} />
                Invitar usuario
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card padding="chico">
        <form className="flex flex-wrap items-end gap-3" action="/usuarios">
          <div className="w-full sm:min-w-[220px] sm:flex-1">
            <Input name="q" placeholder="Buscar por nombre, apellido o email" defaultValue={sp.q} />
          </div>
          <Select name="rolId" defaultValue={sp.rolId ?? ""} className="w-auto">
            <option value="">Todos los roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
          <Select name="estado" defaultValue={sp.estado ?? ""} className="w-auto">
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </Select>
          <Button type="submit" variant="secundario">
            Filtrar
          </Button>
        </form>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Rol</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Último acceso</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {usuarios.length === 0 && <TableEmptyState>No se encontraron usuarios.</TableEmptyState>}
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link href={`/usuarios/${u.id}`} className="font-medium text-secundario hover:underline">
                  {u.apellido}, {u.nombre}
                </Link>
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.rol.nombre}</TableCell>
              <TableCell>
                <span className={u.estado === "activo" ? "text-exito" : "text-texto-secundario"}>
                  {u.estado === "activo" ? "Activo" : "Inactivo"}
                </span>
              </TableCell>
              <TableCell>{formatoFecha(u.ultimoAcceso)}</TableCell>
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
