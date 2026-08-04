import Link from "next/link";
import { obtenerUsuarioActual, ErrorSinSesion } from "@/lib/permisos/permisos";
import { listarHistorialNotificaciones } from "@/lib/servicios/notificaciones.service";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { tiempoRelativo } from "@/lib/utils/tiempo-relativo";
import { enlaceDeNotificacion } from "@/lib/utils/notificacion-enlace";
import { cn } from "@/lib/utils/cn";
import { MarcarTodasLeidasBoton } from "./MarcarTodasLeidasBoton";
import type { Notificacion } from "@prisma/client";

const ETIQUETA_TIPO: Record<Notificacion["tipo"], string> = {
  informativa: "Informativa",
  accionable: "Accionable",
  alerta: "Alerta",
};

const ESTILO_TIPO: Record<Notificacion["tipo"], string> = {
  informativa: "bg-secundario/10 text-secundario",
  accionable: "bg-primario/10 text-primario",
  alerta: "bg-error/10 text-error",
};

// Historial completo de notificaciones — /13-notificaciones.md sección 6:
// "útil para reconstruir qué pasó esta semana si el usuario estuvo
// desconectado unos días". Sin permiso adicional: cualquier usuario ve su
// propio historial.
export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) throw new ErrorSinSesion();

  const sp = await searchParams;
  const pagina = sp.pagina ? Number(sp.pagina) : 1;

  const { notificaciones, total, paginas } = await listarHistorialNotificaciones(usuario.id, pagina);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-texto">Notificaciones</h1>
          <p className="text-sm text-texto-secundario">{total} en total</p>
        </div>
        <MarcarTodasLeidasBoton />
      </div>

      <Card className="divide-y divide-borde p-0">
        {notificaciones.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-texto-secundario">
            No tenés notificaciones todavía.
          </p>
        )}
        {notificaciones.map((notif) => {
          const href = enlaceDeNotificacion(notif.entidadRelacionada, notif.entidadRelacionadaId);
          const contenido = (
            <div className={cn("flex gap-3 px-4 py-3", !notif.leida && "bg-primario/5")}>
              <span
                className={cn(
                  "mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  ESTILO_TIPO[notif.tipo],
                )}
              >
                {ETIQUETA_TIPO[notif.tipo]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-texto">{notif.titulo}</p>
                <p className="mt-0.5 text-sm text-texto-secundario">{notif.mensaje}</p>
                <p className="mt-1 text-xs text-texto-secundario" title={notif.fechaCreacion.toString()}>
                  {tiempoRelativo(notif.fechaCreacion)}
                  {!notif.leida && " · sin leer"}
                </p>
              </div>
            </div>
          );
          return href ? (
            <Link key={notif.id} href={href} className="block hover:bg-fondo-hover">
              {contenido}
            </Link>
          ) : (
            <div key={notif.id}>{contenido}</div>
          );
        })}
      </Card>

      {paginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-texto-secundario">
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={`/notificaciones?pagina=${pagina - 1}`}>
                <Button variant="secundario">Anterior</Button>
              </Link>
            )}
            {pagina < paginas && (
              <Link href={`/notificaciones?pagina=${pagina + 1}`}>
                <Button variant="secundario">Siguiente</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
