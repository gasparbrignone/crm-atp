import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { listarPadrones } from "@/lib/servicios/padron.service";
import { ETIQUETA_TIPO_PADRON } from "@/lib/utils/padron-labels";
import { Button } from "@/components/ui/Button";
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

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  activo: "Activo",
  cerrado: "Cerrado",
};

const COLOR_ESTADO: Record<string, string> = {
  borrador: "text-texto-secundario",
  activo: "text-exito",
  cerrado: "text-texto-secundario",
};

// Listado de padrones — /09-modulo-padron-electoral.md sección 8. Solo un
// padrón puede estar `activo` a la vez (RN-8); el resto queda para consulta
// histórica.
export default async function PadronPage() {
  await requerirPermiso("padron.ver");
  const [padrones, puedeImportar] = await Promise.all([
    listarPadrones(),
    tienePermiso("padron.importar"),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Padrón electoral</h1>
          <p className="text-sm text-texto-secundario">
            Quién está habilitado para votar en la elección vigente, según el padrón oficial.
          </p>
        </div>
        {puedeImportar && (
          <Link href="/padron/nuevo">
            <Button>
              <MdAdd size={18} />
              Nuevo padrón
            </Button>
          </Link>
        )}
      </div>

      <Card padding="ninguno">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Padrón</TableHeaderCell>
              <TableHeaderCell>Fecha de elección</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Entradas</TableHeaderCell>
              <TableHeaderCell>Cargado</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {padrones.length === 0 && (
              <TableEmptyState>Todavía no se cargó ningún padrón.</TableEmptyState>
            )}
            {padrones.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/padron/${p.id}`} className="font-medium text-secundario hover:underline">
                    {p.nombre}
                  </Link>
                </TableCell>
                <TableCell>{ETIQUETA_TIPO_PADRON[p.tipo]}</TableCell>
                <TableCell>
                  {p.fechaEleccion
                    ? new Date(p.fechaEleccion).toLocaleDateString("es-AR")
                    : "Sin especificar"}
                </TableCell>
                <TableCell>
                  <span className={`font-medium ${COLOR_ESTADO[p.estado]}`}>
                    {ETIQUETA_ESTADO[p.estado]}
                  </span>
                </TableCell>
                <TableCell>{p._count.entradas}</TableCell>
                <TableCell>{new Date(p.fechaCarga).toLocaleDateString("es-AR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
