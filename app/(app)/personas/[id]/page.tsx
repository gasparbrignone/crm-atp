import { notFound } from "next/navigation";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { obtenerPersona } from "@/lib/servicios/personas.service";
import { prisma } from "@/lib/prisma/client";
import { CampoEditable } from "@/components/personas/CampoEditable";
import { PersonaTabs } from "@/components/personas/PersonaTabs";
import { Button } from "@/components/ui/Button";
import { ETIQUETA_ESTADO_PADRON, COLOR_ESTADO_PADRON } from "@/lib/utils/persona-labels";
import { actualizarCampoPersonaAction, archivarPersonaAction, restaurarPersonaAction } from "../actions";

export default async function PersonaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("personas.ver");
  const { id } = await params;

  const [persona, carreras, puedeEditar, puedeArchivar] = await Promise.all([
    obtenerPersona(id),
    prisma.carrera.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    tienePermiso("personas.editar"),
    tienePermiso("personas.archivar"),
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-texto">
            {persona.nombre} {persona.apellido}
          </h1>
          <p className="text-sm text-texto-secundario">
            {persona.carrera?.nombre ?? "Sin carrera"} {persona.anio ? `· Año ${persona.anio}` : ""}
            {" · "}
            <span className={COLOR_ESTADO_PADRON[persona.estadoPadron]}>
              {ETIQUETA_ESTADO_PADRON[persona.estadoPadron]}
            </span>
            {persona.estadoFicha === "archivada" && (
              <span className="ml-2 rounded-borde bg-borde px-2 py-0.5 text-xs">Archivada</span>
            )}
          </p>
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
      </div>

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
              </div>
            ),
          },
          {
            id: "actividades",
            etiqueta: "Actividades",
            contenido: (
              <p className="text-sm text-texto-secundario">
                Disponible desde la Fase 2 (ver /20-roadmap.md).
              </p>
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
    </div>
  );
}
