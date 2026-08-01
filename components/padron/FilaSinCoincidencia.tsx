"use client";

import { useState, useTransition } from "react";
import { MdSearch, MdPersonAdd } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  vincularEntradaManualAction,
  crearPersonaDesdeEntradaAction,
  buscarPersonasParaVincularAction,
} from "@/app/(app)/padron/[id]/actions";
import { partirNombreCompleto } from "@/lib/utils/nombre-padron";

interface Resultado {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Sin coincidencia — /09-modulo-padron-electoral.md sección 6: "acción de
// vincular manualmente (buscador) o crear ficha nueva".
export function FilaSinCoincidencia({
  padronId,
  entradaId,
  dni,
  nombreCompletoOriginal,
}: {
  padronId: string;
  entradaId: string;
  dni: string;
  nombreCompletoOriginal: string;
}) {
  const [resuelto, setResuelto] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const partido = partirNombreCompleto(nombreCompletoOriginal);
  const [nombre, setNombre] = useState(partido.nombre);
  const [apellido, setApellido] = useState(partido.apellido);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [procesando, iniciarTransicion] = useTransition();

  if (resuelto) return null;

  function onChangeQuery(valor: string) {
    setQuery(valor);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    iniciarBusqueda(async () => {
      setResultados(await buscarPersonasParaVincularAction(valor));
    });
  }

  function vincular(personaId: string) {
    iniciarTransicion(async () => {
      await vincularEntradaManualAction(padronId, entradaId, personaId);
      setResuelto(true);
    });
  }

  function crearYVincular() {
    setErrorAlta(null);
    iniciarTransicion(async () => {
      const resultado = await crearPersonaDesdeEntradaAction(padronId, entradaId, nombre, apellido);
      if (!resultado.ok) {
        setErrorAlta(resultado.error ?? "No se pudo crear la ficha.");
        return;
      }
      setResuelto(true);
    });
  }

  return (
    <Card padding="chico" className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-texto">{nombreCompletoOriginal}</p>
        <p className="text-xs text-texto-secundario">DNI {dni}</p>
      </div>

      {!mostrarAlta ? (
        <>
          <div className="relative flex flex-col gap-1">
            <Input
              value={query}
              onChange={(e) => onChangeQuery(e.target.value)}
              placeholder="Buscar en Personas para vincular manualmente..."
            />
            {query.trim().length >= 2 && (
              <div className="flex flex-col gap-1 rounded-borde-chico border border-borde p-1">
                {buscando && <p className="px-2 py-1 text-xs text-texto-secundario">Buscando...</p>}
                {!buscando && resultados.length === 0 && (
                  <p className="px-2 py-1 text-xs text-texto-secundario">Sin resultados.</p>
                )}
                {!buscando &&
                  resultados.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => vincular(r.id)}
                      disabled={procesando}
                      className="flex items-center gap-2 rounded-borde-chico px-2 py-1.5 text-left text-sm text-texto hover:bg-fondo-hover"
                    >
                      <MdSearch size={14} className="shrink-0 text-texto-secundario" />
                      {r.apellido}, {r.nombre}
                      {r.dni ? <span className="text-texto-secundario">· DNI {r.dni}</span> : null}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <Button
            variant="fantasma"
            onClick={() => setMostrarAlta(true)}
            className="w-fit min-h-8 px-3 text-xs"
          >
            <MdPersonAdd size={14} />
            Crear ficha nueva
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
          </div>
          {errorAlta && (
            <p role="alert" className="text-xs text-error">
              {errorAlta}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={crearYVincular}
              disabled={procesando || !nombre.trim() || !apellido.trim()}
              className="min-h-8 px-3 text-xs"
            >
              Crear y vincular
            </Button>
            <Button
              variant="fantasma"
              onClick={() => setMostrarAlta(false)}
              disabled={procesando}
              className="min-h-8 px-3 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
