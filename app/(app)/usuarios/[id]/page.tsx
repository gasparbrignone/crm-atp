import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso, tienePermiso, obtenerUsuarioActual } from "@/lib/permisos/permisos";
import { obtenerUsuario } from "@/lib/servicios/usuarios.service";
import { prisma } from "@/lib/prisma/client";
import { Card } from "@/components/ui/Card";
import { CampoEditable } from "@/components/personas/CampoEditable";
import { actualizarCampoUsuarioAction } from "../actions";
import { SelectorRolUsuario } from "./SelectorRolUsuario";
import { BotonEstadoUsuario } from "./BotonEstadoUsuario";

const ETIQUETA_ACCION_HISTORIAL: Record<string, string> = {
  crear: "creó",
  editar: "editó",
  cambio_permiso: "cambió el rol de",
  otro: "modificó",
};

function formatoFechaHora(fecha: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

export default async function UsuarioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("usuarios.ver");
  const { id } = await params;

  const [usuario, roles, puedeGestionar, puedeGestionarRoles, usuarioActual, historial] =
    await Promise.all([
      obtenerUsuario(id),
      prisma.rol.findMany({ orderBy: { nombre: "asc" } }),
      tienePermiso("usuarios.gestionar"),
      tienePermiso("roles.gestionar"),
      obtenerUsuarioActual(),
      prisma.historialCambio.findMany({
        where: { entidad: "Usuario", entidadId: id },
        orderBy: { fecha: "desc" },
        include: { usuario: { select: { nombre: true, apellido: true } } },
        take: 50,
      }),
    ]);
  if (!usuario) notFound();

  const esUnoMismo = usuarioActual?.id === usuario.id;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link href="/usuarios" className="text-texto-secundario hover:text-texto">
          <MdArrowBack size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-texto">
          {usuario.apellido}, {usuario.nombre}
        </h1>
        <span className={usuario.estado === "activo" ? "text-exito" : "text-texto-secundario"}>
          · {usuario.estado === "activo" ? "Activo" : "Inactivo"}
        </span>
      </div>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoEditable
          personaId={usuario.id}
          campo="nombre"
          label="Nombre"
          valor={usuario.nombre}
          editable={puedeGestionar || esUnoMismo}
          accion={actualizarCampoUsuarioAction}
        />
        <CampoEditable
          personaId={usuario.id}
          campo="apellido"
          label="Apellido"
          valor={usuario.apellido}
          editable={puedeGestionar || esUnoMismo}
          accion={actualizarCampoUsuarioAction}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-texto-secundario">Email</span>
          <span className="text-sm text-texto">{usuario.email}</span>
        </div>
        <CampoEditable
          personaId={usuario.id}
          campo="telefono"
          label="Teléfono"
          valor={usuario.telefono ?? ""}
          editable={puedeGestionar || esUnoMismo}
          accion={actualizarCampoUsuarioAction}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            Rol
          </p>
          {puedeGestionarRoles && !esUnoMismo ? (
            <SelectorRolUsuario usuarioId={usuario.id} rolActualId={usuario.rolId} roles={roles} />
          ) : (
            <p className="text-sm text-texto">
              {usuario.rol.nombre}
              {esUnoMismo && (
                <span className="ml-2 text-xs text-texto-secundario">
                  (no podés cambiar tu propio rol)
                </span>
              )}
            </p>
          )}
        </div>

        {puedeGestionar && !esUnoMismo && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              Estado
            </p>
            <BotonEstadoUsuario usuarioId={usuario.id} estadoActual={usuario.estado} />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-texto">Historial</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-texto-secundario">Sin cambios registrados todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historial.map((h) => (
              <li key={h.id} className="text-sm text-texto">
                <span className="text-texto-secundario">{formatoFechaHora(h.fecha)}</span>{" "}
                {h.usuario ? `${h.usuario.nombre} ${h.usuario.apellido}` : "El sistema"}{" "}
                {ETIQUETA_ACCION_HISTORIAL[h.accion] ?? h.accion}
                {h.campo ? ` (${h.campo}${h.valorAnterior ? `: ${h.valorAnterior} → ${h.valorNuevo}` : ""})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
