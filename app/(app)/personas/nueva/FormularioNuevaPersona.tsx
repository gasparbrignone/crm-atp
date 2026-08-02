"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MdExpandMore } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { crearPersonaAction, type EstadoFormularioPersona } from "../actions";
import type { Carrera } from "@prisma/client";

const estadoInicial: EstadoFormularioPersona = {};

export function FormularioNuevaPersona({ carreras }: { carreras: Carrera[] }) {
  const [estado, formAction, enviando] = useActionState(crearPersonaAction, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Nombre"
        name="nombre"
        required
        autoFocus
        error={estado.erroresCampo?.nombre}
      />
      <Input label="Apellido" name="apellido" required error={estado.erroresCampo?.apellido} />

      <details className="group rounded-borde-chico border border-borde">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-texto-secundario hover:text-texto">
          Más datos (opcional)
          <MdExpandMore size={18} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 p-3 pt-0">
          <Input label="DNI" name="dni" inputMode="numeric" error={estado.erroresCampo?.dni} />
          <Input label="Legajo" name="legajo" error={estado.erroresCampo?.legajo} />
          <Select label="Carrera" name="carreraId" defaultValue="">
            <option value="">Sin especificar</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select label="Año" name="anio" defaultValue="">
            <option value="">Sin especificar</option>
            {[1, 2, 3, 4, 5, 6].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Input
            label="Teléfono"
            name="telefono"
            type="tel"
            ayuda="Se guarda como el teléfono principal"
            error={estado.erroresCampo?.telefono}
          />
          <Input
            label="Email"
            name="email"
            type="email"
            ayuda="Se guarda como el email principal"
            error={estado.erroresCampo?.email}
          />
          <Input label="Instagram" name="instagram" placeholder="usuario (con o sin @)" />
          <Input label="Observaciones generales" name="observacionesGenerales" />
        </div>
      </details>

      {estado.error && (
        <div role="alert" className="rounded-borde border border-error bg-error/10 p-3 text-sm">
          <p className="text-error">{estado.error}</p>
          {estado.personaExistenteId && (
            <Link
              href={`/personas/${estado.personaExistenteId}`}
              className="mt-1 inline-block font-semibold text-secundario hover:underline"
            >
              Ver la ficha existente →
            </Link>
          )}
        </div>
      )}

      {estado.candidatos && estado.candidatos.length > 0 && (
        <div className="flex flex-col gap-3 rounded-borde border border-alerta bg-alerta/10 p-3 text-sm">
          <p className="font-semibold text-texto">
            Encontramos {estado.candidatos.length === 1 ? "una ficha parecida" : "fichas parecidas"} ya
            cargada{estado.candidatos.length === 1 ? "" : "s"}.
          </p>
          {estado.motivoSugerencia && (
            <p className="text-xs text-texto-secundario">{estado.motivoSugerencia}</p>
          )}
          <div className="flex flex-col gap-2">
            {estado.candidatos.map((c) => (
              <div key={c.id} className="rounded-borde-chico border border-borde bg-fondo p-2.5">
                <p className="font-medium text-texto">
                  {c.nombre} {c.apellido}
                </p>
                <p className="text-xs text-texto-secundario">
                  {[c.dni ? `DNI ${c.dni}` : null, c.carrera, c.telefono, c.email]
                    .filter(Boolean)
                    .join(" · ") || "Sin más datos cargados"}
                </p>
                <button
                  type="submit"
                  name="accionDuplicado"
                  value="fusionar"
                  formNoValidate
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (form) (form.elements.namedItem("personaCandidataId") as HTMLInputElement).value = c.id;
                  }}
                  className="mt-2 text-xs font-semibold text-secundario hover:underline"
                >
                  Es la misma persona →
                </button>
              </div>
            ))}
          </div>
          <input type="hidden" name="personaCandidataId" defaultValue={estado.candidatos[0]?.id} />
          <button
            type="submit"
            name="accionDuplicado"
            value="confirmar_distinta"
            formNoValidate
            className="self-start rounded-borde-chico border border-borde px-3 py-1.5 text-xs font-semibold text-texto hover:bg-fondo-hover"
          >
            Ninguna es la misma, es una persona distinta
          </button>
        </div>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Guardando..." : "Guardar persona"}
      </Button>
    </form>
  );
}
