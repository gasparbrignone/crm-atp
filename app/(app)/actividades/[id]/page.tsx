import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso, tienePermiso, obtenerUsuarioActual } from "@/lib/permisos/permisos";
import {
  obtenerActividad,
  obtenerTasaAsistenciaPromedioPorTipo,
} from "@/lib/servicios/actividades.service";
import { prisma } from "@/lib/prisma/client";
import { CampoEditableActividad } from "@/components/actividades/CampoEditableActividad";
import { ParticipacionesPanel } from "@/components/actividades/ParticipacionesPanel";
import { PersonaTabs } from "@/components/personas/PersonaTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ETIQUETA_ESTADO_ACTIVIDAD,
  COLOR_ESTADO_ACTIVIDAD,
  ETIQUETA_MODALIDAD,
} from "@/lib/utils/actividad-labels";
import {
  actualizarCampoActividadAction,
  cambiarEstadoActividadFormAction,
  cancelarActividadAction,
} from "../actions";

function aDatetimeLocal(fecha: Date | null) {
  if (!fecha) return "";
  const d = new Date(fecha);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ActividadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("actividades.ver");
  const { id } = await params;

  const [actividad, tipos, responsables, carreras, actividadesPadre, usuario, puedeEditarBase, puedeGestionarTodas, puedeEliminar, puedeGestionarParticipaciones, puedeImportar, historial] =
    await Promise.all([
      obtenerActividad(id),
      prisma.tipoActividad.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      prisma.usuario.findMany({ where: { estado: "activo" }, orderBy: { nombre: "asc" } }),
      prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      prisma.actividad.findMany({
        where: { id: { not: id } },
        orderBy: { fechaInicio: "desc" },
        select: { id: true, nombre: true },
        take: 200,
      }),
      obtenerUsuarioActual(),
      tienePermiso("actividades.editar"),
      tienePermiso("actividades.gestionar_todas"),
      tienePermiso("actividades.eliminar"),
      tienePermiso("participaciones.gestionar"),
      tienePermiso("importaciones.ejecutar"),
      prisma.historialCambio.findMany({
        where: { entidad: "Actividad", entidadId: id },
        orderBy: { fecha: "desc" },
        include: { usuario: { select: { nombre: true, apellido: true } } },
        take: 100,
      }),
    ]);

  if (!actividad) notFound();

  const puedeEditar = puedeEditarBase && (puedeGestionarTodas || actividad.responsableId === usuario?.id);

  const tasaPropia = (() => {
    const activos = actividad.participaciones.filter((p) => p.estado !== "cancelado");
    if (activos.length === 0) return null;
    const asistieron = activos.filter((p) => p.estado === "asistio").length;
    return asistieron / activos.length;
  })();
  const tasaPromedioTipo = await obtenerTasaAsistenciaPromedioPorTipo(actividad.tipoActividadId, id);

  const opcionesTipo = tipos.map((t) => ({ value: t.id, label: t.nombre }));
  const opcionesResponsable = responsables.map((r) => ({
    value: r.id,
    label: `${r.nombre} ${r.apellido}`,
  }));
  const opcionesModalidad = [
    { value: "presencial", label: "Presencial" },
    { value: "virtual", label: "Virtual" },
    { value: "hibrida", label: "Híbrida" },
  ];
  const opcionesPadre = [
    { value: "", label: "Ninguna (actividad independiente)" },
    ...actividadesPadre.map((a) => ({ value: a.id, label: a.nombre })),
  ];
  const opcionesCarrera = [
    { value: "", label: "Sin carrera por defecto" },
    ...carreras.map((c) => ({ value: c.id, label: c.nombre })),
  ];
  const opcionesAnioActividad = [
    { value: "", label: "Sin año por defecto" },
    ...[1, 2, 3, 4, 5, 6].map((a) => ({ value: String(a), label: `Año ${a}` })),
  ];

  const activosCount = actividad.participaciones.filter((p) => p.estado !== "cancelado").length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/actividades"
        className="inline-flex w-fit items-center gap-1 text-sm text-texto-secundario hover:text-texto"
      >
        <MdArrowBack size={16} />
        Actividades
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: actividad.tipoActividad.color ?? "#64748b" }}
            >
              {actividad.tipoActividad.nombre}
            </span>
            <span
              className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_ACTIVIDAD[actividad.estado]}`}
            >
              {ETIQUETA_ESTADO_ACTIVIDAD[actividad.estado]}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-texto">{actividad.nombre}</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            {new Date(actividad.fechaInicio).toLocaleString("es-AR", {
              dateStyle: "full",
              timeStyle: "short",
            })}
            {" · "}
            {ETIQUETA_MODALIDAD[actividad.modalidad]}
            {actividad.lugar ? ` · ${actividad.lugar}` : ""}
          </p>
          <p className="mt-1 text-sm text-texto-secundario">
            Responsable: {actividad.responsable.nombre} {actividad.responsable.apellido} ·{" "}
            {activosCount} inscripto{activosCount === 1 ? "" : "s"}
            {actividad.cupoMaximo ? ` / ${actividad.cupoMaximo} cupos` : ""}
          </p>
          {actividad.actividadPadre && (
            <p className="mt-1 text-sm text-texto-secundario">
              Parte de{" "}
              <Link href={`/actividades/${actividad.actividadPadre.id}`} className="text-secundario hover:underline">
                {actividad.actividadPadre.nombre}
              </Link>
            </p>
          )}
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            {actividad.estado === "planificada" && (
              <FormAccionEstado actividadId={id} estado="en_curso" etiqueta="Marcar en curso" />
            )}
            {actividad.estado === "en_curso" && (
              <FormAccionEstado actividadId={id} estado="finalizada" etiqueta="Finalizar" />
            )}
            {puedeEliminar && (actividad.estado === "planificada" || actividad.estado === "en_curso") && (
              <form action={cancelarActividadAction.bind(null, id)}>
                <Button variant="peligro">Cancelar actividad</Button>
              </form>
            )}
          </div>
        )}
      </Card>

      <Card padding="ninguno">
        <PersonaTabs
          pestanas={[
            {
              id: "datos",
              etiqueta: "Datos generales",
              contenido: (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CampoEditableActividad
                    actividadId={id}
                    campo="nombre"
                    label="Nombre"
                    valor={actividad.nombre}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="tipoActividadId"
                    label="Tipo de actividad"
                    valor={actividad.tipoActividadId}
                    tipo="select"
                    opciones={opcionesTipo}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="fechaInicio"
                    label="Fecha y hora de inicio"
                    valor={aDatetimeLocal(actividad.fechaInicio)}
                    tipo="datetime-local"
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="fechaFin"
                    label="Fecha y hora de fin"
                    valor={aDatetimeLocal(actividad.fechaFin)}
                    tipo="datetime-local"
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="modalidad"
                    label="Modalidad"
                    valor={actividad.modalidad}
                    tipo="select"
                    opciones={opcionesModalidad}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="lugar"
                    label="Lugar"
                    valor={actividad.lugar ?? ""}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="cupoMaximo"
                    label="Cupo máximo"
                    valor={actividad.cupoMaximo ? String(actividad.cupoMaximo) : ""}
                    tipo="number"
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="responsableId"
                    label="Responsable"
                    valor={actividad.responsableId}
                    tipo="select"
                    opciones={opcionesResponsable}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="actividadPadreId"
                    label="Actividad padre"
                    valor={actividad.actividadPadreId ?? ""}
                    tipo="select"
                    opciones={opcionesPadre}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="carreraPorDefectoId"
                    label="Carrera por defecto de los inscriptos"
                    valor={actividad.carreraPorDefectoId ?? ""}
                    tipo="select"
                    opciones={opcionesCarrera}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <CampoEditableActividad
                    actividadId={id}
                    campo="anioPorDefecto"
                    label="Año por defecto de los inscriptos"
                    valor={actividad.anioPorDefecto ? String(actividad.anioPorDefecto) : ""}
                    tipo="select"
                    opciones={opcionesAnioActividad}
                    editable={puedeEditar}
                    accion={actualizarCampoActividadAction}
                  />
                  <div className="sm:col-span-2">
                    <CampoEditableActividad
                      actividadId={id}
                      campo="descripcion"
                      label="Descripción"
                      valor={actividad.descripcion ?? ""}
                      tipo="textarea"
                      editable={puedeEditar}
                      accion={actualizarCampoActividadAction}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CampoEditableActividad
                      actividadId={id}
                      campo="observaciones"
                      label="Observaciones"
                      valor={actividad.observaciones ?? ""}
                      tipo="textarea"
                      editable={puedeEditar}
                      accion={actualizarCampoActividadAction}
                    />
                  </div>
                </div>
              ),
            },
            {
              id: "inscriptos",
              etiqueta: "Inscriptos",
              contenido: (
                <ParticipacionesPanel
                  actividadId={id}
                  participaciones={actividad.participaciones}
                  cupoMaximo={actividad.cupoMaximo}
                  puedeGestionar={puedeGestionarParticipaciones}
                  aceptaInscripciones={actividad.estado === "planificada" || actividad.estado === "en_curso"}
                  mostrarModoAsistencia={
                    puedeGestionarParticipaciones &&
                    (actividad.estado === "en_curso" || actividad.estado === "finalizada")
                  }
                  puedeImportar={puedeImportar}
                />
              ),
            },
            ...(actividad.subActividades.length > 0
              ? [
                  {
                    id: "sub-actividades",
                    etiqueta: `Sub-actividades (${actividad.subActividades.length})`,
                    contenido: (
                      <div className="flex flex-col gap-2">
                        {actividad.subActividades.map((sub) => {
                          const activosSub = sub.participaciones.filter((p) => p.estado !== "cancelado");
                          const asistieronSub = sub.participaciones.filter((p) => p.estado === "asistio").length;
                          return (
                            <Link
                              key={sub.id}
                              href={`/actividades/${sub.id}`}
                              className="flex items-center justify-between rounded-borde border border-borde px-4 py-3 hover:bg-fondo-hover"
                            >
                              <div>
                                <p className="font-medium text-texto">{sub.nombre}</p>
                                <p className="text-xs text-texto-secundario">
                                  {sub.tipoActividad.nombre} ·{" "}
                                  {new Date(sub.fechaInicio).toLocaleDateString("es-AR")}
                                </p>
                              </div>
                              <span className="text-sm text-texto-secundario">
                                {asistieronSub} / {activosSub.length} asistieron
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ),
                  },
                ]
              : []),
            {
              id: "estadisticas",
              etiqueta: "Estadísticas",
              contenido: (
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between rounded-borde border border-borde px-4 py-3">
                    <span className="text-texto-secundario">Tasa de asistencia de esta actividad</span>
                    <span className="font-semibold text-texto">
                      {tasaPropia === null ? "Sin datos aún" : `${Math.round(tasaPropia * 100)}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-borde border border-borde px-4 py-3">
                    <span className="text-texto-secundario">
                      Promedio de asistencia en otras actividades de tipo &quot;{actividad.tipoActividad.nombre}&quot;
                    </span>
                    <span className="font-semibold text-texto">
                      {tasaPromedioTipo === null ? "Sin datos aún" : `${Math.round(tasaPromedioTipo * 100)}%`}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              id: "historial",
              etiqueta: "Historial",
              contenido: (
                <div className="flex flex-col divide-y divide-borde">
                  {historial.length === 0 && (
                    <p className="text-sm text-texto-secundario">Todavía no hay cambios registrados.</p>
                  )}
                  {historial.map((h) => (
                    <div key={h.id} className="py-2 text-sm">
                      <p className="text-texto">
                        <span className="font-medium">
                          {h.usuario ? `${h.usuario.nombre} ${h.usuario.apellido}` : "Sistema"}
                        </span>{" "}
                        {h.accion === "crear" && "creó la actividad"}
                        {h.accion === "editar" &&
                          `modificó ${h.campo ?? "un campo"}: "${h.valorAnterior ?? "—"}" → "${h.valorNuevo ?? "—"}"`}
                      </p>
                      <p className="text-xs text-texto-secundario">
                        {new Date(h.fecha).toLocaleString("es-AR")}
                      </p>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function FormAccionEstado({
  actividadId,
  estado,
  etiqueta,
}: {
  actividadId: string;
  estado: "en_curso" | "finalizada";
  etiqueta: string;
}) {
  return (
    <form action={cambiarEstadoActividadFormAction.bind(null, actividadId, estado)}>
      <Button variant="secundario">{etiqueta}</Button>
    </form>
  );
}
