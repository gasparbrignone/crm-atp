import Link from "next/link";
import { MdAdd, MdSearch } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { listarPersonas } from "@/lib/servicios/personas.service";
import { prisma } from "@/lib/prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { TablaPersonasSeleccionable } from "@/components/personas/TablaPersonasSeleccionable";
import { ETIQUETA_ESTADO_PADRON } from "@/lib/utils/persona-labels";
import { ETIQUETA_TIPO_PADRON } from "@/lib/utils/padron-labels";

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
    estadoPadronCD: sp.estadoPadronCD,
    estadoPadronCE: sp.estadoPadronCE,
    estadoFicha: sp.estadoFicha ?? "activa",
    etiquetaId: sp.etiquetaId,
    pagina: sp.pagina ? Number(sp.pagina) : 1,
    porPagina: sp.porPagina ? Number(sp.porPagina) : 50,
  };

  const [{ personas, total, pagina, porPagina }, carreras, etiquetas, puedeInscribirMasivo, puedeEtiquetarMasivo] =
    await Promise.all([
      listarPersonas(filtros),
      prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      prisma.etiqueta.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      tienePermiso("participaciones.gestionar_masivo"),
      tienePermiso("personas.editar"),
    ]);

  const actividadesDisponibles = puedeInscribirMasivo
    ? await prisma.actividad.findMany({
        where: { estado: { in: ["planificada", "en_curso"] } },
        orderBy: { fechaInicio: "asc" },
        select: { id: true, nombre: true, cupoMaximo: true },
        take: 200,
      })
    : [];

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
          <Select name="estadoPadronCD" defaultValue={sp.estadoPadronCD ?? ""} className="w-auto">
            <option value="">{ETIQUETA_TIPO_PADRON.consejo_directivo}: todos</option>
            {Object.entries(ETIQUETA_ESTADO_PADRON).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_PADRON.consejo_directivo}: {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="estadoPadronCE" defaultValue={sp.estadoPadronCE ?? ""} className="w-auto">
            <option value="">{ETIQUETA_TIPO_PADRON.centro_estudiantes}: todos</option>
            {Object.entries(ETIQUETA_ESTADO_PADRON).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_PADRON.centro_estudiantes}: {etiqueta}
              </option>
            ))}
          </Select>
          <Select name="estadoFicha" defaultValue={sp.estadoFicha ?? "activa"} className="w-auto">
            <option value="activa">Activas</option>
            <option value="archivada">Archivadas</option>
          </Select>
          <Select name="etiquetaId" defaultValue={sp.etiquetaId ?? ""} className="w-auto">
            <option value="">Todas las etiquetas</option>
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secundario">
            <MdSearch size={18} />
            Filtrar
          </Button>
        </form>
      </Card>

      <TablaPersonasSeleccionable
        personas={personas}
        seleccionable={puedeInscribirMasivo}
        actividadesDisponibles={actividadesDisponibles}
        puedeEtiquetarMasivo={puedeEtiquetarMasivo}
        etiquetasDisponibles={etiquetas}
      />

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
