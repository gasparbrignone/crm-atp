"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { crearPadronAction, type EstadoFormularioPadron } from "../actions";

const estadoInicial: EstadoFormularioPadron = {};

export function FormularioNuevoPadron() {
  const [estado, formAction, enviando] = useActionState(crearPadronAction, estadoInicial);
  const router = useRouter();

  useEffect(() => {
    if (estado.padronId) router.push(`/padron/${estado.padronId}/importar`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Nombre del padrón"
        name="nombre"
        placeholder="Ej. Elecciones de centro de estudiantes 2026"
        autoFocus
        required
      />
      <Select label="A qué padrón corresponde" name="tipo" defaultValue="" required>
        <option value="" disabled>
          Elegí una opción
        </option>
        <option value="consejo_directivo">Consejo Directivo</option>
        <option value="centro_estudiantes">Centro de Estudiantes</option>
      </Select>
      <Input label="Fecha de elección (opcional)" name="fechaEleccion" type="date" />
      {estado.error && (
        <p role="alert" className="text-sm text-error">
          {estado.error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="w-fit">
        {enviando ? "Creando..." : "Crear y subir archivo"}
      </Button>
    </form>
  );
}
