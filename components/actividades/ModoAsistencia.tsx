"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MdArrowBack, MdSearch } from "react-icons/md";
import type { EstadoParticipacion } from "@prisma/client";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { cambiarEstadoParticipacionAction } from "@/app/(app)/actividades/participaciones.actions";

interface Participante {
  id: string;
  estado: EstadoParticipacion;
  persona: { id: string; nombre: string; apellido: string; dni: string | null };
}

// Modo asistencia — /07-modulo-participaciones.md sección 4: carga rápida
// desde el celular el día del evento. Un único botón grande por persona,
// sin pasos intermedios: confirmado/inscripto → asistio → ausente → asistio...
// Búsqueda rápida por nombre dentro de la propia lista de inscriptos, sin
// pasar por el buscador global.
export function ModoAsistencia({
  actividadId,
  actividadNombre,
  participaciones,
}: {
  actividadId: string;
  actividadNombre: string;
  participaciones: Participante[];
}) {
  const [q, setQ] = useState("");
  const [estados, setEstados] = useState<Record<string, EstadoParticipacion>>(
    Object.fromEntries(participaciones.map((p) => [p.id, p.estado])),
  );
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [, iniciarTransicion] = useTransition();

  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return participaciones
      .filter((p) => estados[p.id] !== "cancelado")
      .filter((p) => {
        if (!texto) return true;
        const nombreCompleto = `${p.persona.nombre} ${p.persona.apellido}`.toLowerCase();
        return nombreCompleto.includes(texto) || (p.persona.dni ?? "").includes(texto);
      });
  }, [participaciones, estados, q]);

  function siguienteEstado(actual: EstadoParticipacion): EstadoParticipacion {
    if (actual === "asistio") return "ausente";
    if (actual === "ausente") return "asistio";
    return "asistio"; // inscripto | confirmado → asistio
  }

  function alternar(participacionId: string) {
    const actual = estados[participacionId];
    const siguiente = siguienteEstado(actual);
    setPendienteId(participacionId);
    setEstados((prev) => ({ ...prev, [participacionId]: siguiente }));
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoParticipacionAction(
        actividadId,
        participacionId,
        siguiente,
      );
      if (resultado.error) {
        // Revertir en caso de error del servidor.
        setEstados((prev) => ({ ...prev, [participacionId]: actual }));
      }
      setPendienteId(null);
    });
  }

  const ESTILOS: Record<EstadoParticipacion, string> = {
    inscripto: "bg-fondo-superficie border-borde text-texto",
    confirmado: "bg-secundario/10 border-secundario text-secundario",
    asistio: "bg-exito/10 border-exito text-exito",
    ausente: "bg-error/10 border-error text-error",
    cancelado: "bg-fondo-hover border-borde text-texto-secundario",
  };

  const ETIQUETAS: Record<EstadoParticipacion, string> = {
    inscripto: "Sin marcar",
    confirmado: "Confirmado",
    asistio: "Asistió",
    ausente: "Ausente",
    cancelado: "Cancelado",
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/actividades/${actividadId}`}
          className="inline-flex items-center gap-1 text-sm text-texto-secundario hover:text-texto"
        >
          <MdArrowBack size={16} />
          Volver
        </Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-texto">Modo asistencia</h1>
        <p className="text-sm text-texto-secundario">{actividadNombre}</p>
      </div>

      <div className="relative">
        <Input
          placeholder="Buscar por nombre o DNI..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <MdSearch
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-texto-secundario"
        />
      </div>

      <p className="text-xs text-texto-secundario">
        Tocá el nombre para alternar entre asistió / ausente. {lista.length} persona
        {lista.length === 1 ? "" : "s"}.
      </p>

      <div className="flex flex-col gap-2">
        {lista.map((p) => {
          const estado = estados[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => alternar(p.id)}
              disabled={pendienteId === p.id}
              className={cn(
                "flex min-h-16 items-center justify-between rounded-borde border-2 px-4 text-left transition-colors active:scale-[0.99] disabled:opacity-60",
                ESTILOS[estado],
              )}
            >
              <span className="flex flex-col">
                <span className="font-semibold">
                  {p.persona.apellido}, {p.persona.nombre}
                </span>
                {p.persona.dni && <span className="text-xs opacity-80">DNI {p.persona.dni}</span>}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide">
                {ETIQUETAS[estado]}
              </span>
            </button>
          );
        })}
        {lista.length === 0 && (
          <p className="py-10 text-center text-sm text-texto-secundario">
            No se encontró a nadie con ese criterio.
          </p>
        )}
      </div>
    </div>
  );
}
