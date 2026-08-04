import Link from "next/link";
import { MdArrowForward } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { listarCatalogo, listarParametrosGenerales } from "@/lib/servicios/configuracion.service";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import { TablaCatalogo } from "./TablaCatalogo";
import { ParametrosGenerales } from "./ParametrosGenerales";

const PESTANAS = [
  { id: "carrera", etiqueta: "Carreras" },
  { id: "tipoActividad", etiqueta: "Tipos de actividad" },
  { id: "etiqueta", etiqueta: "Etiquetas" },
  { id: "clasificacionPunteo", etiqueta: "Clasificación de punteo" },
  { id: "parametros", etiqueta: "Parámetros generales" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

// Configuración del sistema — /18-configuracion-sistema.md: módulo
// exclusivamente administrativo (RN-4, sección 10), acceso restringido a
// configuracion.gestionar. Organizado en pestañas (sección 9): catálogos +
// parámetros generales acá; Roles y permisos ya vive en /usuarios/roles
// (Fase 4), enlazado desde acá en vez de duplicarlo.
export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirPermiso("configuracion.gestionar");
  const sp = await searchParams;
  const pestanaActiva: IdPestana = (PESTANAS.find((p) => p.id === sp.tab)?.id ?? "carrera") as IdPestana;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto">Configuración</h1>
        <p className="text-sm text-texto-secundario">
          Catálogos editables y parámetros generales del sistema.{" "}
          <Link href="/usuarios/roles" className="inline-flex items-center gap-1 text-primario hover:underline">
            Gestionar roles y permisos <MdArrowForward size={14} />
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-borde">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={`/configuracion?tab=${p.id}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              pestanaActiva === p.id
                ? "border-primario text-primario"
                : "border-transparent text-texto-secundario hover:text-texto",
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </div>

      <Card>
        <ContenidoPestana pestana={pestanaActiva} />
      </Card>
    </div>
  );
}

async function ContenidoPestana({ pestana }: { pestana: IdPestana }) {
  if (pestana === "parametros") {
    const parametros = await listarParametrosGenerales();
    return <ParametrosGenerales parametros={parametros} />;
  }

  const titulos: Record<Exclude<IdPestana, "parametros">, string> = {
    carrera: "Carreras",
    tipoActividad: "Tipos de actividad",
    etiqueta: "Etiquetas",
    clasificacionPunteo: "Clasificación de punteo",
  };

  const valores = await listarCatalogo(pestana);
  return (
    <TablaCatalogo
      tipo={pestana}
      titulo={titulos[pestana]}
      valores={valores}
      permiteFusion={pestana === "etiqueta"}
    />
  );
}
