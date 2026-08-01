"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { crearActividadAction, type EstadoFormularioActividad } from "./actions";
import type { TipoActividad, Usuario } from "@prisma/client";

const estadoInicial: EstadoFormularioActividad = {};

interface FormularioActividadProps {
  tipos: TipoActividad[];
  responsables: Pick<Usuario, "id" | "nombre" | "apellido">[];
  actividadesPadre: { id: string; nombre: string }[];
  responsableIdDefault?: string;
}

// Alta de actividad — /06-modulo-actividades.md sección 4.1 (campos del
// formulario). Nombre, tipo, fecha de inicio, modalidad y responsable son
// obligatorios; el resto (incluido lugar) es opcional, según /04-modelo-datos.md.
export function FormularioActividad({
  tipos,
  responsables,
  actividadesPadre,
  responsableIdDefault,
}: FormularioActividadProps) {
  const [estado, formAction, enviando] = useActionState(crearActividadAction, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nombre" name="nombre" required autoFocus error={estado.erroresCampo?.nombre} />

      <Select
        label="Tipo de actividad"
        name="tipoActividadId"
        required
        defaultValue=""
        error={estado.erroresCampo?.tipoActividadId}
      >
        <option value="" disabled>
          Seleccioná un tipo
        </option>
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </Select>

      <Textarea label="Descripción" name="descripcion" ayuda="Se muestra en la vista de inscripción" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Fecha y hora de inicio"
          name="fechaInicio"
          type="datetime-local"
          required
          error={estado.erroresCampo?.fechaInicio}
        />
        <Input
          label="Fecha y hora de fin"
          name="fechaFin"
          type="datetime-local"
          ayuda="Vacío para actividades de duración abierta"
          error={estado.erroresCampo?.fechaFin}
        />
      </div>

      <Select label="Modalidad" name="modalidad" defaultValue="presencial">
        <option value="presencial">Presencial</option>
        <option value="virtual">Virtual</option>
        <option value="hibrida">Híbrida</option>
      </Select>

      <Input label="Lugar" name="lugar" error={estado.erroresCampo?.lugar} />

      <Input
        label="Cupo máximo"
        name="cupoMaximo"
        type="number"
        min={1}
        ayuda="Vacío = sin límite"
        error={estado.erroresCampo?.cupoMaximo}
      />

      <Select
        label="Responsable"
        name="responsableId"
        required
        defaultValue={responsableIdDefault ?? ""}
        error={estado.erroresCampo?.responsableId}
      >
        <option value="" disabled>
          Seleccioná un responsable
        </option>
        {responsables.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre} {r.apellido}
          </option>
        ))}
      </Select>

      <Select label="Actividad padre" name="actividadPadreId" defaultValue="">
        <option value="">Ninguna (actividad independiente)</option>
        {actividadesPadre.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </Select>

      <Textarea label="Observaciones" name="observaciones" />

      {estado.error && (
        <div role="alert" className="rounded-borde border border-error bg-error/10 p-3 text-sm">
          <p className="text-error">{estado.error}</p>
        </div>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Guardando..." : "Guardar actividad"}
      </Button>
    </form>
  );
}
