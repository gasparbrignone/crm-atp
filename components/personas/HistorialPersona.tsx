"use client";

import { useState } from "react";
import {
  MdAddCircleOutline,
  MdEdit,
  MdArchive,
  MdUnarchive,
  MdCallMerge,
  MdFileDownload,
  MdFileUpload,
  MdVpnKey,
  MdMoreHoriz,
} from "react-icons/md";
import { ETIQUETA_ACCION_HISTORIAL, etiquetaCampo } from "@/lib/utils/historial-labels";
import { tiempoRelativo } from "@/lib/utils/tiempo-relativo";

export interface EventoHistorial {
  id: string;
  accion: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  fecha: Date;
  usuarioNombre: string | null;
  metadata: Record<string, unknown> | null;
}

const ICONO_ACCION: Record<string, typeof MdEdit> = {
  crear: MdAddCircleOutline,
  editar: MdEdit,
  archivar: MdArchive,
  restaurar: MdUnarchive,
  fusionar: MdCallMerge,
  exportar: MdFileDownload,
  importar: MdFileUpload,
  cambio_permiso: MdVpnKey,
  otro: MdMoreHoriz,
};

function resumenEvento(e: EventoHistorial): string {
  if (e.accion === "editar" && e.campo) {
    const antes = e.valorAnterior || "(vacío)";
    const despues = e.valorNuevo || "(vacío)";
    return `Cambió ${etiquetaCampo(e.campo)} de "${antes}" a "${despues}"`;
  }
  if (e.accion === "fusionar" && e.metadata?.personaDescartadaId) {
    return "Fusionó esta ficha con otra (ver detalle)";
  }
  if (e.accion === "otro" && e.metadata?.proceso === "deteccion_duplicados_alta") {
    return "Se descartó una sugerencia de posible duplicado al crear esta ficha";
  }
  if (e.accion === "otro" && e.metadata?.proceso === "acceso_punteo_ajeno") {
    return "Un administrador accedió al punteo de otro usuario sobre esta persona";
  }
  return ETIQUETA_ACCION_HISTORIAL[e.accion] ?? e.accion;
}

// Línea de tiempo por entidad — /17-auditoria-historial.md sección 6. Orden
// cronológico descendente, entradas de "editar" expandibles con el detalle
// antes/después. Los eventos automáticos (usuarioNombre null) muestran el
// proceso que los generó (RN-6 de /04-modelo-datos.md).
export function HistorialPersona({ eventos }: { eventos: EventoHistorial[] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setAbiertos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  if (eventos.length === 0) {
    return <p className="text-sm text-texto-secundario">Todavía no hay eventos registrados.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {eventos.map((e) => {
        const Icono = ICONO_ACCION[e.accion] ?? MdMoreHoriz;
        const expandible = e.accion === "editar" && e.campo;
        const abierto = abiertos.has(e.id);
        return (
          <li key={e.id} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fondo-hover text-texto-secundario">
              <Icono size={16} />
            </span>
            <div className="flex-1 border-b border-borde pb-3">
              <button
                type="button"
                onClick={() => expandible && alternar(e.id)}
                className={`flex w-full flex-col items-start text-left ${expandible ? "cursor-pointer" : "cursor-default"}`}
              >
                <p className="text-sm text-texto">{resumenEvento(e)}</p>
                <p className="text-xs text-texto-secundario">
                  {e.usuarioNombre ?? (
                    <span className="italic">
                      Proceso automático{typeof e.metadata?.proceso === "string" ? ` (${e.metadata.proceso})` : ""}
                    </span>
                  )}
                  {" · "}
                  <time dateTime={e.fecha.toISOString()} title={e.fecha.toLocaleString("es-AR")}>
                    {tiempoRelativo(e.fecha)}
                  </time>
                </p>
              </button>
              {expandible && abierto && (
                <div className="mt-2 grid grid-cols-2 gap-3 rounded-borde-chico bg-fondo-hover p-2 text-xs">
                  <div>
                    <p className="font-semibold text-texto-secundario">Antes</p>
                    <p className="text-texto">{e.valorAnterior || "(vacío)"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-texto-secundario">Después</p>
                    <p className="text-texto">{e.valorNuevo || "(vacío)"}</p>
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
