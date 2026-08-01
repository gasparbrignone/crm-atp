import { notFound } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerActividad } from "@/lib/servicios/actividades.service";
import { ModoAsistencia } from "@/components/actividades/ModoAsistencia";

// Modo asistencia — pantalla dedicada, pensada mobile-first, para el registro
// rápido de asistencia el día del evento (/07-modulo-participaciones.md
// sección 4). Requiere participaciones.gestionar, no solo actividades.ver.
export default async function AsistenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirPermiso("participaciones.gestionar");
  const { id } = await params;

  const actividad = await obtenerActividad(id);
  if (!actividad) notFound();

  return (
    <ModoAsistencia
      actividadId={id}
      actividadNombre={actividad.nombre}
      participaciones={actividad.participaciones}
    />
  );
}
