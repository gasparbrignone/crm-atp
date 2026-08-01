import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack, MdVisibility } from "react-icons/md";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPunteoDePersona, listarClasificacionesPunteo } from "@/lib/servicios/punteo.service";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { ControlesPunteo } from "@/components/punteo/ControlesPunteo";
import { ComentariosPunteo } from "@/components/punteo/ComentariosPunteo";

// Ficha de punteo de una persona — /08-modulo-punteo-electoral.md sección 5:
// clasificación, estado de seguimiento y comentarios como controles directos
// en la misma pantalla, sin navegación adicional. `?usuario=` habilita a la
// conducción (punteo.ver_todos) a revisar el punteo de otro militante sobre
// esta persona — ese acceso queda auditado en obtenerPunteoDePersona().
export default async function PunteoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ personaId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const usuario = await requerirPermiso("punteo.ver_propio");
  const puedeVerTodos = usuario.rol.permisos.some((rp) => rp.permiso.codigo === "punteo.ver_todos");
  const { personaId } = await params;
  const sp = await searchParams;
  const verComoUsuarioId = sp.usuario;

  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { id: true, nombre: true, apellido: true, estadoFicha: true },
  });
  if (!persona || persona.estadoFicha === "fusionada") notFound();

  const [punteo, clasificaciones] = await Promise.all([
    obtenerPunteoDePersona({ usuarioId: usuario.id, puedeVerTodos }, personaId, verComoUsuarioId),
    listarClasificacionesPunteo(),
  ]);

  const usuarioObjetivo = verComoUsuarioId ?? usuario.id;
  const esPropio = usuarioObjetivo === usuario.id;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/punteo"
        className="inline-flex w-fit items-center gap-1 text-sm text-texto-secundario hover:text-texto"
      >
        <MdArrowBack size={16} />
        Mi punteo
      </Link>

      <Card className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secundario/10 text-lg font-semibold text-secundario">
          {persona.nombre[0]}
          {persona.apellido[0]}
        </span>
        <div>
          <h1 className="text-lg font-semibold text-texto">
            {persona.apellido}, {persona.nombre}
          </h1>
          <Link href={`/personas/${persona.id}`} className="text-sm text-secundario hover:underline">
            Ver ficha completa
          </Link>
        </div>
      </Card>

      {!esPropio && (
        <Card padding="chico" className="flex items-center gap-2 border-alerta/40 bg-alerta/10 text-sm text-texto">
          <MdVisibility size={16} className="shrink-0" />
          Estás viendo el punteo de otro usuario sobre esta persona (solo lectura). Este acceso
          queda registrado.
        </Card>
      )}

      {esPropio ? (
        <ControlesPunteo
          personaId={persona.id}
          clasificaciones={clasificaciones}
          clasificacionActualId={punteo?.clasificacionId ?? ""}
          estadoActual={punteo?.estadoSeguimiento ?? "sin_iniciar"}
        />
      ) : (
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-texto-secundario">Clasificación</p>
          <p className="text-sm font-medium text-texto">
            {punteo?.clasificacion?.nombre ?? "Sin clasificar"}
          </p>
          <p className="mt-2 text-sm text-texto-secundario">Estado de seguimiento</p>
          <p className="text-sm font-medium text-texto">
            {punteo?.estadoSeguimiento ?? "sin_iniciar"}
          </p>
        </Card>
      )}

      <ComentariosPunteo
        personaId={persona.id}
        comentarios={punteo?.comentarios ?? []}
        soloLectura={!esPropio}
      />
    </div>
  );
}
