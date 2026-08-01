import Link from "next/link";
import { MdAdd, MdArrowBack } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { listarRoles } from "@/lib/servicios/roles.service";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";

export default async function RolesPage() {
  await requerirPermiso("roles.gestionar");
  const [roles, puedeGestionar] = await Promise.all([
    listarRoles(),
    tienePermiso("roles.gestionar"),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/usuarios" className="text-texto-secundario hover:text-texto">
            <MdArrowBack size={20} />
          </Link>
          <h1 className="text-xl font-semibold text-texto">Roles</h1>
        </div>
        {puedeGestionar && (
          <Link href="/usuarios/roles/nuevo">
            <Button>
              <MdAdd size={18} />
              Nuevo rol
            </Button>
          </Link>
        )}
      </div>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Descripción</TableHeaderCell>
            <TableHeaderCell>Permisos</TableHeaderCell>
            <TableHeaderCell>Usuarios</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`/usuarios/roles/${r.id}`} className="font-medium text-secundario hover:underline">
                  {r.nombre}
                </Link>
              </TableCell>
              <TableCell>{r.descripcion ?? "—"}</TableCell>
              <TableCell>{r._count.permisos}</TableCell>
              <TableCell>{r._count.usuarios}</TableCell>
              <TableCell>
                {r.esRolSistema ? (
                  <span className="text-texto-secundario">Base del sistema</span>
                ) : (
                  <span className="text-secundario">Personalizado</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
