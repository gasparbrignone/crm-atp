"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";
import { ETIQUETA_ESTADO_PADRON, COLOR_ESTADO_PADRON } from "@/lib/utils/persona-labels";
import { inscribirMasivoAction } from "@/app/(app)/actividades/participaciones.actions";
import type { EstadoPadronPersona } from "@prisma/client";

interface PersonaFila {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  anio: number | null;
  estadoPadron: EstadoPadronPersona;
  carrera: { nombre: string } | null;
}

interface ActividadOpcion {
  id: string;
  nombre: string;
  cupoMaximo: number | null;
}

// Listado de Personas con selección múltiple para inscripción masiva a una
// actividad — /07-modulo-participaciones.md sección 6 (flujo de inscripción
// masiva desde un listado filtrado, con confirmación explícita si el cupo no
// alcanza para todas las personas seleccionadas).
export function TablaPersonasSeleccionable({
  personas,
  seleccionable,
  actividadesDisponibles,
}: {
  personas: PersonaFila[];
  seleccionable: boolean;
  actividadesDisponibles: ActividadOpcion[];
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [actividadId, setActividadId] = useState("");
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "error" | "info"; texto: string } | null>(null);
  const [requiereConfirmacion, setRequiereConfirmacion] = useState<{
    entrarian: number;
    total: number;
  } | null>(null);

  function alternar(id: string) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function abrirModal() {
    setMensaje(null);
    setRequiereConfirmacion(null);
    setActividadId("");
    setModalAbierto(true);
  }

  function confirmarInscripcion(forzar: boolean) {
    if (!actividadId) {
      setMensaje({ tipo: "error", texto: "Elegí una actividad de destino." });
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await inscribirMasivoAction(actividadId, Array.from(seleccion), forzar);
      if (resultado.error) {
        setMensaje({ tipo: "error", texto: resultado.error });
        return;
      }
      if (resultado.requiereConfirmacion) {
        setRequiereConfirmacion({
          entrarian: resultado.entrarianSinExceder,
          total: resultado.totalSeleccionadas,
        });
        return;
      }
      setMensaje({
        tipo: "info",
        texto: `Listo: ${resultado.creadas} inscripción(es) nueva(s), ${resultado.reactivadas} reactivada(s), ${resultado.yaInscriptas} ya estaban inscriptas.`,
      });
      setRequiereConfirmacion(null);
      setSeleccion(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {seleccionable && seleccion.size > 0 && (
        <div className="flex items-center justify-between rounded-borde border border-secundario bg-secundario/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-texto">
            {seleccion.size} persona{seleccion.size === 1 ? "" : "s"} seleccionada
            {seleccion.size === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="fantasma" onClick={() => setSeleccion(new Set())}>
              Limpiar
            </Button>
            <Button onClick={abrirModal}>Inscribir a actividad...</Button>
          </div>
        </div>
      )}

      <Table>
        <TableHead>
          <tr>
            {seleccionable && <TableHeaderCell className="w-10">{""}</TableHeaderCell>}
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>DNI</TableHeaderCell>
            <TableHeaderCell>Carrera</TableHeaderCell>
            <TableHeaderCell>Año</TableHeaderCell>
            <TableHeaderCell>Estado de padrón</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {personas.length === 0 && (
            <TableEmptyState>
              Todavía no cargaste ninguna Persona —{" "}
              <Link href="/personas/nueva" className="text-secundario hover:underline">
                dar de alta la primera
              </Link>
              .
            </TableEmptyState>
          )}
          {personas.map((persona) => (
            <TableRow key={persona.id}>
              {seleccionable && (
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar a ${persona.nombre} ${persona.apellido}`}
                    checked={seleccion.has(persona.id)}
                    onChange={() => alternar(persona.id)}
                    className="h-4 w-4"
                  />
                </TableCell>
              )}
              <TableCell>
                <Link href={`/personas/${persona.id}`} className="group flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secundario/10 text-xs font-semibold text-secundario">
                    {persona.nombre[0]}
                    {persona.apellido[0]}
                  </span>
                  <span className="font-medium text-texto group-hover:text-secundario">
                    {persona.apellido}, {persona.nombre}
                  </span>
                </Link>
              </TableCell>
              <TableCell>{persona.dni ?? "—"}</TableCell>
              <TableCell>{persona.carrera?.nombre ?? "—"}</TableCell>
              <TableCell>{persona.anio ?? "—"}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full bg-fondo-hover px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO_PADRON[persona.estadoPadron]}`}
                >
                  {ETIQUETA_ESTADO_PADRON[persona.estadoPadron]}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Modal abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} titulo="Inscribir a actividad">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto-secundario">
            Se inscribirá a {seleccion.size} persona{seleccion.size === 1 ? "" : "s"} en la
            actividad elegida. Quien ya esté inscripto no se duplica.
          </p>
          <Select
            label="Actividad de destino"
            value={actividadId}
            onChange={(e) => {
              setActividadId(e.target.value);
              setRequiereConfirmacion(null);
              setMensaje(null);
            }}
          >
            <option value="">Seleccioná una actividad</option>
            {actividadesDisponibles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
                {a.cupoMaximo ? ` (cupo ${a.cupoMaximo})` : ""}
              </option>
            ))}
          </Select>

          {mensaje && (
            <p className={mensaje.tipo === "error" ? "text-sm text-error" : "text-sm text-exito"}>
              {mensaje.texto}
            </p>
          )}

          {requiereConfirmacion && (
            <div className="rounded-borde border border-alerta bg-alerta/10 p-3 text-sm text-texto">
              El cupo solo alcanza para {requiereConfirmacion.entrarian} de{" "}
              {requiereConfirmacion.total} personas seleccionadas. ¿Confirmás igual? Las que no
              entren quedarán marcadas como excedentes de cupo (lista de espera).
              <div className="mt-2 flex gap-2">
                <Button variant="secundario" onClick={() => confirmarInscripcion(true)} disabled={pendiente}>
                  Confirmar de todos modos
                </Button>
                <Button variant="fantasma" onClick={() => setRequiereConfirmacion(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {!requiereConfirmacion && (
            <div className="flex justify-end gap-2">
              <Button variant="fantasma" onClick={() => setModalAbierto(false)}>
                Cerrar
              </Button>
              <Button onClick={() => confirmarInscripcion(false)} disabled={pendiente || !actividadId}>
                {pendiente ? "Inscribiendo..." : "Inscribir"}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
