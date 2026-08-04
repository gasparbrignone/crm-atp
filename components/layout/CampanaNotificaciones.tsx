"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MdNotifications, MdNotificationsActive } from "react-icons/md";
import { cn } from "@/lib/utils/cn";
import { tiempoRelativo } from "@/lib/utils/tiempo-relativo";
import { enlaceDeNotificacion } from "@/lib/utils/notificacion-enlace";
import {
  obtenerCampanaAction,
  marcarNotificacionLeidaAction,
  marcarTodasLeidasAction,
} from "@/app/(app)/notificaciones-actions";
import type { Notificacion } from "@prisma/client";

const INTERVALO_ACTUALIZACION_MS = 60_000;

const ESTILO_POR_TIPO: Record<Notificacion["tipo"], string> = {
  informativa: "bg-secundario",
  accionable: "bg-primario",
  alerta: "bg-error",
};

// Campana con contador de no leídas — /13-notificaciones.md sección 6.
// Polling simple cada 60s en vez de algo en tiempo real (websockets/SSE):
// el volumen y la urgencia de este sistema no lo justifican, y mantiene la
// arquitectura sin infraestructura adicional (coherente con el resto del
// proyecto, siempre en el plan gratuito de Vercel).
export function CampanaNotificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [recientes, setRecientes] = useState<Notificacion[]>([]);
  const [, iniciarTransicion] = useTransition();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function actualizar() {
    const { noLeidas: n, recientes: r } = await obtenerCampanaAction();
    setNoLeidas(n);
    setRecientes(r);
  }

  useEffect(() => {
    iniciarTransicion(() => actualizar());
    const id = setInterval(() => iniciarTransicion(() => actualizar()), INTERVALO_ACTUALIZACION_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  function alClickear(notif: Notificacion) {
    setAbierto(false);
    iniciarTransicion(async () => {
      if (!notif.leida) {
        await marcarNotificacionLeidaAction(notif.id);
        await actualizar();
      }
    });
    const href = enlaceDeNotificacion(notif.entidadRelacionada, notif.entidadRelacionadaId);
    if (href) router.push(href);
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
        onClick={() => setAbierto((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-borde-chico text-texto-secundario transition-colors hover:bg-fondo-hover hover:text-texto"
      >
        {noLeidas > 0 ? <MdNotificationsActive size={20} /> : <MdNotifications size={20} />}
        {noLeidas > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-borde-chico border border-borde bg-fondo-superficie shadow-lg">
          <div className="flex items-center justify-between border-b border-borde px-3 py-2.5">
            <span className="text-sm font-semibold text-texto">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={() => iniciarTransicion(async () => {
                  await marcarTodasLeidasAction();
                  await actualizar();
                })}
                className="text-xs font-medium text-primario hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {recientes.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-texto-secundario">
                No tenés notificaciones todavía.
              </li>
            )}
            {recientes.map((notif) => (
              <li key={notif.id}>
                <button
                  type="button"
                  onClick={() => alClickear(notif)}
                  className={cn(
                    "flex w-full gap-2.5 border-b border-borde px-3 py-2.5 text-left last:border-b-0 hover:bg-fondo-hover",
                    !notif.leida && "bg-primario/5",
                  )}
                >
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", ESTILO_POR_TIPO[notif.tipo])}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-texto">{notif.titulo}</span>
                    <span className="mt-0.5 block text-xs text-texto-secundario line-clamp-2">
                      {notif.mensaje}
                    </span>
                    <span className="mt-1 block text-xs text-texto-secundario">
                      {tiempoRelativo(notif.fechaCreacion)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-borde px-3 py-2">
            <Link
              href="/notificaciones"
              onClick={() => setAbierto(false)}
              className="block text-center text-xs font-medium text-primario hover:underline"
            >
              Ver historial completo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
