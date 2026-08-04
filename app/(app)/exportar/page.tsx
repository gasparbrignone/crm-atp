import { tienePermiso, requerirPermiso } from "@/lib/permisos/permisos";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { BotonExportar } from "./BotonExportar";
import { ExportarPersonasForm } from "./ExportarPersonasForm";
import { ExportarPadronForm } from "./ExportarPadronForm";
import { exportarActividadesAction, exportarPunteoAction } from "./actions";

// Exportaciones — /14-importaciones-exportaciones.md sección 8: cada origen
// respeta el mismo permiso que ya haría falta para leer esos datos
// navegando el sistema normalmente (RN sección 9 de ese documento) — el
// permiso real se re-verifica en cada Server Action de acciones.ts, esto
// solo controla qué secciones se muestran.
export default async function ExportarPage() {
  await requerirPermiso("exportaciones.ejecutar");

  const [puedePersonas, puedePadron, puedePunteo, carreras, padrones] = await Promise.all([
    tienePermiso("personas.exportar"),
    tienePermiso("padron.exportar"),
    tienePermiso("punteo.exportar_propio"),
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.padronElectoral.findMany({ orderBy: { fechaCarga: "desc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto">Exportar datos</h1>
        <p className="text-sm text-texto-secundario">
          Formato CSV (se abre sin problema en Excel o Google Sheets). Cada exportación queda registrada
          con quién la ejecutó y cuándo.
        </p>
      </div>

      {puedePersonas && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Personas</h2>
          <ExportarPersonasForm carreras={carreras} />
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-texto">Actividades y participaciones</h2>
        <p className="text-xs text-texto-secundario">Una fila por participación, incluye estado de asistencia.</p>
        <BotonExportar accion={() => exportarActividadesAction()} />
      </Card>

      {puedePadron && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Padrón electoral</h2>
          <ExportarPadronForm padrones={padrones} />
        </Card>
      )}

      {puedePunteo && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Punteo</h2>
          <p className="text-xs text-texto-secundario">
            Tu propio punteo, salvo que tengas permiso para exportar el de todos los usuarios.
          </p>
          <BotonExportar accion={exportarPunteoAction} />
        </Card>
      )}
    </div>
  );
}
