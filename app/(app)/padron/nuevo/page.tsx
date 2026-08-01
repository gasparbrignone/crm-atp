import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { Card } from "@/components/ui/Card";
import { FormularioNuevoPadron } from "./FormularioNuevoPadron";

export default async function NuevoPadronPage() {
  await requerirPermiso("padron.importar");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Link
        href="/padron"
        className="inline-flex w-fit items-center gap-1 text-sm text-texto-secundario hover:text-texto"
      >
        <MdArrowBack size={16} />
        Padrón electoral
      </Link>

      <Card className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold text-texto">Nuevo padrón</h1>
          <p className="text-sm text-texto-secundario">
            Después de crearlo vas a poder subir el archivo (CSV/Excel) con las entradas.
          </p>
        </div>
        <FormularioNuevoPadron />
      </Card>
    </div>
  );
}
