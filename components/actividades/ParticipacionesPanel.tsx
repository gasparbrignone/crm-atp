"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MdPersonAdd } from "react-icons/md";
import type { EstadoParticipacion } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";
import { ETIQUETA_ESTADO_PARTICIPACION, COLOR_ESTADO_PARTICIPACION } from "@/lib/utils/actividad-labels";
import {
  inscribirPersonaAction,
  cambiarEstadoParticipacionAction,
  cancelarParticipacionAction,
  buscarPersonasParaInscribirAction,
} from "@/app/(app)/actividades/participaciones.actions";

// Transiciones válidas replicadas para la UI — fuente de verdad en
// /lib/servicios/participaciones.service.ts (/07-modulo-participaciones.md
// sección 5). El servicio vuelve a validar server-side.
const TRANSICIONES: Record<EstadoParticipacion, EstadoParticipacion[]> = {
  inscripto: ["confirmado", "asistio", "ausente", "cancelado"],
  confirmado: ["asistio", "ausente", "cancelado"],
  asistio: ["ausente"],
  ausente: ["asistio"],
  cancelado: ["inscripto"],
};

interface Participante {
  id: string;
  estado: EstadoParticipacion;
  persona: { id: string; nombre: string; apellido: string; dni: string | null };
}

interface ResultadoBusqueda {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  carrera: { nombre: string } | null;
}

export function ParticipacionesPanel({
  actividadId,
  participaciones,
  cupoMaximo,
  puedeGestionar,
  aceptaInscripciones,
  mostrarModoAsistencia,
  puedeImportar,
}: {
  actividadId: string;
  participaciones: Participante[];
  cupoMaximo: number | null;
  puedeGestionar: boolean;
  aceptaInscripciones: boolean;
  mostrarModoAsistencia: boolean;
  puedeImportar: boolean;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const [accionPendiente, iniciarAccion] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const activos = participaciones.filter((p) => p.estado !== "cancelado").length;
  const excedeCupo = cupoMaximo != null && activos > cupoMaximo;

  function buscar(texto: string) {
    setQ(texto);
    setError(undefined);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    iniciarBusqueda(async () => {
      const r = await buscarPersonasParaInscribirAction(actividadId, texto);
      setResultados(r);
    });
  }

  function agregar(personaId: string) {
    iniciarAccion(async () => {
      const resultado = await inscribirPersonaAction(actividadId, personaId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setResultados((prev) => prev.filter((p) => p.id !== personaId));
      setQ("");
    });
  }

  function cambiarEstado(participacionId: string, estado: EstadoParticipacion) {
    iniciarAccion(async () => {
      const resultado = await cambiarEstadoParticipacionAction(actividadId, participacionId, estado);
      if (resultado.error) setError(resultado.error);
    });
  }

  function cancelar(participacionId: string) {
    iniciarAccion(async () => {
      await cancelarParticipacionAction(actividadId, participacionId);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          {activos} inscripto{activos === 1 ? "" : "s"}
          {cupoMaximo ? ` / ${cupoMaximo} cupos` : ""}
          {excedeCupo && (
            <span className="ml-2 font-medium text-alerta">
              (lista de espera: {activos - cupoMaximo!} excedente
              {activos - cupoMaximo! === 1 ? "" : "s"})
            </span>
          )}
        </p>
        <div className="flex gap-2">
          {puedeImportar && aceptaInscripciones && (
            <Link href={`/actividades/${actividadId}/importar`}>
              <Button variant="secundario">Importar CSV</Button>
            </Link>
          )}
          {mostrarModoAsistencia && (
            <Link href={`/actividades/${actividadId}/asistencia`}>
              <Button variant="secundario">Modo asistencia</Button>
            </Link>
          )}
        </div>
      </div>

      {puedeGestionar && aceptaInscripciones && (
        <div className="relative flex flex-col gap-2">
          <Input
            placeholder="Buscar persona por nombre, apellido, DNI o legajo..."
            value={q}
            onChange={(e) => buscar(e.target.value)}
          />
          {buscando && <p className="text-xs text-texto-secundario">Buscando...</p>}
          {resultados.length > 0 && (
            <ul className="flex flex-col divide-y divide-borde rounded-borde border border-borde bg-fondo-superficie">
              {resultados.map((persona) => (
                <li key={persona.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-texto">
                    {persona.apellido}, {persona.nombre}
                    {persona.dni ? ` · DNI ${persona.dni}` : ""}
                    {persona.carrera ? ` · ${persona.carrera.nombre}` : ""}
                  </span>
                  <Button
                    variant="secundario"
                    disabled={accionPendiente}
                    onClick={() => agregar(persona.id)}
                  >
                    <MdPersonAdd size={16} />
                    Agregar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!aceptaInscripciones && puedeGestionar && (
        <p className="text-xs text-texto-secundario">
          Esta actividad ya no acepta inscripciones nuevas (finalizada o cancelada).
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-borde border border-error bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Persona</TableHeaderCell>
            <TableHeaderCell>DNI</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            {puedeGestionar && <TableHeaderCell>Acciones</TableHeaderCell>}
          </tr>
        </TableHead>
        <TableBody>
          {participaciones.length === 0 && (
            <TableEmptyState>Todavía no hay nadie inscripto en esta actividad.</TableEmptyState>
          )}
          {participaciones.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/personas/${p.persona.id}`} className="hover:text-secundario">
                  {p.persona.apellido}, {p.persona.nombre}
                </Link>
              </TableCell>
              <TableCell>{p.persona.dni ?? "—"}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_PARTICIPACION[p.estado]}`}
                >
                  {ETIQUETA_ESTADO_PARTICIPACION[p.estado]}
                </span>
              </TableCell>
              {puedeGestionar && (
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSICIONES[p.estado]
                      .filter((e) => e !== "cancelado")
                      .map((estado) => (
                        <Button
                          key={estado}
                          variant="secundario"
                          disabled={accionPendiente}
                          onClick={() => cambiarEstado(p.id, estado)}
                          className="min-h-8 px-2.5 text-xs"
                        >
                          {ETIQUETA_ESTADO_PARTICIPACION[estado]}
                        </Button>
                      ))}
                    {p.estado !== "cancelado" && (
                      <Button
                        variant="fantasma"
                        disabled={accionPendiente}
                        onClick={() => cancelar(p.id)}
                        className="min-h-8 px-2.5 text-xs text-error"
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
