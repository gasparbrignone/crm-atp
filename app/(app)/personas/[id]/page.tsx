import { notFound } from "next/navigation";
import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { obtenerPersona } from "@/lib/servicios/personas.service";
import { listarParticipacionesDePersona } from "@/lib/servicios/participaciones.service";
import { prisma } from "@/lib/prisma/client";
import { CampoEditable } from "@/components/personas/CampoEditable";
import { BuscarDuplicadoFusion } from "@/components/personas/BuscarDuplicadoFusion";
import { PersonaTabs } from "@/components/personas/PersonaTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ETIQUETA_ESTADO_PADRON, COLOR_ESTADO_PADRON } from "@/lib/utils/persona-labels";
import { ETIQUETA_TIPO_PADRON } from "@/lib/utils/padron-labels";
import {
  ETIQUETA_ESTADO_PARTICIPACION,
  COLOR_ESTADO_PARTICIPACION,
} from "@/lib/utils/actividad-labels";
import { actualizarCampoPersonaAction, archivarPersonaAction, restaurarPersonaAction } from "../actions";

export default async function PersonaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("personas.ver");
  const { id } = await params;

  const [persona, carreras, puedeEditar, puedeArchivar, puedeFusionar, participaciones] = await Promise.all([
    obtenerPersona(id),
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    tienePermiso("personas.editar"),
    tienePermiso("personas.archivar"),
    tienePermiso("personas.fusionar_duplicados"),
    listarParticipacionesDePersona(id),
  ]);

  if (!persona) notFound();

  const opcionesCarrera = [
    { value: "", label: "Sin especificar" },
    ...carreras.map((c) => ({ value: c.id, label: c.nombre })),
  ];
  const opcionesAnio = [
    { value: "", label: "Sin especificar" },
    ...[1, 2, 3, 4, 5, 6].map((a) => ({ value: String(a), label: String(a) })),
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/personas"
        className="inline-flex w-fit items-center gap-1 text-sm text-texto-secundario hover:text-texto"
      >
        <MdArrowBack size={16} />
        Personas
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secundario/10 text-lg font-semibold text-secundario">
            {persona.nombre[0]}
            {persona.apellido[0]}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-texto">
              {persona.nombre} {persona.apellido}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texto-secundario">
              <span>
                {persona.carrera?.nombre ?? "Sin carrera"}
                {persona.anio ? ` · Año ${persona.anio}` : ""}
              </span>
              <span
                className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-0.5 text-xs font-medium ${COLOR_ESTADO_PADRON[persona.estadoPadronCD]}`}
              >
                {ETIQUETA_TIPO_PADRON.consejo_directivo}: {ETIQUETA_ESTADO_PADRON[persona.estadoPadronCD]}
              </span>
              <span
                className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-0.5 text-xs font-medium ${COLOR_ESTADO_PADRON[persona.estadoPadronCE]}`}
              >
                {ETIQUETA_TIPO_PADRON.centro_estudiantes}: {ETIQUETA_ESTADO_PADRON[persona.estadoPadronCE]}
              </span>
              {persona.estadoFicha === "archivada" && (
                <span className="inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-0.5 text-xs font-medium text-texto-secundario">
                  Archivada
                </span>
              )}
            </p>
          </div>
        </div>
        {puedeArchivar && (
          <form
            action={
              persona.estadoFicha === "archivada"
                ? restaurarPersonaAction.bind(null, persona.id)
                : archivarPersonaAction.bind(null, persona.id)
            }
          >
            <Button variant={persona.estadoFicha === "archivada" ? "secundario" : "peligro"}>
              {persona.estadoFicha === "archivada" ? "Restaurar" : "Archivar"}
            </Button>
          </form>
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
                <CampoEditable
                  personaId={persona.id}
                  campo="nombre"
                  label="Nombre"
                  valor={persona.nombre}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="apellido"
                  label="Apellido"
                  valor={persona.apellido}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="dni"
                  label="DNI"
                  valor={persona.dni ?? ""}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="legajo"
                  label="Legajo"
                  valor={persona.legajo ?? ""}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="carreraId"
                  label="Carrera"
                  valor={persona.carreraId ?? ""}
                  tipo="select"
                  opciones={opcionesCarrera}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="anio"
                  label="Año"
                  valor={persona.anio ? String(persona.anio) : ""}
                  tipo="select"
                  opciones={opcionesAnio}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <CampoEditable
                  personaId={persona.id}
                  campo="instagram"
                  label="Instagram"
                  valor={persona.instagram ?? ""}
                  editable={puedeEditar}
                  accion={actualizarCampoPersonaAction}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-texto-secundario">Teléfono principal</span>
                  <span className="text-sm text-texto">
                    {persona.telefonos.find((t) => t.esPrincipal)?.numero ?? "Sin completar"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-texto-secundario">Email principal</span>
                  <span className="text-sm text-texto">
                    {persona.emails.find((e) => e.esPrincipal)?.email ?? "Sin completar"}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <CampoEditable
                    personaId={persona.id}
                    campo="observacionesGenerales"
                    label="Observaciones generales"
                    valor={persona.observacionesGenerales ?? ""}
                    editable={puedeEditar}
                    accion={actualizarCampoPersonaAction}
                  />
                </div>
                {puedeFusionar && persona.estadoFicha !== "fusionada" && (
                  <div className="sm:col-span-2">
                    <BuscarDuplicadoFusion personaId={persona.id} />
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "actividades",
            etiqueta: "Actividades",
            contenido: (
              <div className="flex flex-col divide-y divide-borde">
                {participaciones.length === 0 && (
                  <p className="text-sm text-texto-secundario">
                    Todavía no participó de ninguna actividad.
                  </p>
                )}
                {participaciones.map((p) => (
                  <Link
                    key={p.id}
                    href={`/actividades/${p.actividadId}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:text-secundario"
                  >
                    <div>
                      <p className="text-sm font-medium text-texto">{p.actividad.nombre}</p>
                      <p className="text-xs text-texto-secundario">
                        {p.actividad.tipoActividad.nombre} ·{" "}
                        {new Date(p.actividad.fechaInicio).toLocaleDateString("es-AR")}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_PARTICIPACION[p.estado]}`}
                    >
                      {ETIQUETA_ESTADO_PARTICIPACION[p.estado]}
                    </span>
                  </Link>
                ))}
              </div>
            ),
          },
          {
            id: "punteo",
            etiqueta: "Punteo",
            contenido: (
              <p className="text-sm text-texto-secundario">
                Disponible desde la Fase 5 (ver /20-roadmap.md).
              </p>
            ),
          },
          {
            id: "historial",
            etiqueta: "Historial",
            contenido: (
              <p className="text-sm text-texto-secundario">
                La línea de tiempo completa se agrega en la Fase 12 (ver /20-roadmap.md). Los
                cambios ya se están registrando desde ahora.
              </p>
            ),
          },
        ]}
        />
      </Card>
    </div>
  );
}
