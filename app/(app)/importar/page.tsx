import { requerirPermiso } from "@/lib/permisos/permisos";
import { Card } from "@/components/ui/Card";
import { ImportadorPersonasCsv } from "./ImportadorPersonasCsv";

export default async function ImportarPage() {
  await requerirPermiso("importaciones.ejecutar");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">Importar Personas desde CSV</h1>
      <Card>
        <ImportadorPersonasCsv />
      </Card>
    </div>
  );
}
