import Link from "next/link";
import { MdGroup } from "react-icons/md";
import { prisma } from "@/lib/prisma/client";
import { tienePermiso } from "@/lib/permisos/permisos";
import { Card } from "@/components/ui/Card";

export default async function DashboardPage() {
  const puedeVerPersonas = await tienePermiso("personas.ver");
  const totalPersonas = puedeVerPersonas
    ? await prisma.persona.count({ where: { estadoFicha: "activa" } })
    : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-texto">Dashboard</h1>
        <p className="text-sm text-texto-secundario">
          Los paneles completos con más indicadores llegan en la Fase 3 (ver /20-roadmap.md).
        </p>
      </div>

      {totalPersonas !== null && (
        <Link href="/personas" className="block max-w-xs">
          <Card className="flex items-center gap-4 transition-shadow hover:shadow-flotante">
            <span className="flex h-11 w-11 items-center justify-center rounded-borde-chico bg-secundario/10 text-secundario">
              <MdGroup size={22} />
            </span>
            <div>
              <p className="text-2xl font-semibold text-texto">{totalPersonas}</p>
              <p className="text-sm text-texto-secundario">Personas activas</p>
            </div>
          </Card>
        </Link>
      )}
    </div>
  );
}
