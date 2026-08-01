"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MdSearch } from "react-icons/md";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { buscarPersonasParaPuntearAction } from "@/app/(app)/punteo/actions";

interface Resultado {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Acceso rápido a una persona nueva — /08-modulo-punteo-electoral.md sección 5:
// "la primera interacción crea el PunteoPersona automáticamente" (no hay un
// paso de alta de punteo separado, se resuelve al cargar el primer
// comentario/clasificación en la ficha de destino).
export function BuscadorPuntearPersona() {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const router = useRouter();

  function onChange(valor: string) {
    setQuery(valor);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    iniciarBusqueda(async () => {
      const r = await buscarPersonasParaPuntearAction(valor);
      setResultados(r);
    });
  }

  return (
    <div className="relative flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar persona por nombre, apellido o DNI..."
        aria-label="Buscar persona para puntear"
      />
      {query.trim().length >= 2 && (
        <Card padding="chico" className="flex flex-col gap-1">
          {buscando && <p className="px-2 py-1 text-sm text-texto-secundario">Buscando...</p>}
          {!buscando && resultados.length === 0 && (
            <p className="px-2 py-1 text-sm text-texto-secundario">Sin resultados.</p>
          )}
          {!buscando &&
            resultados.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/punteo/${r.id}`)}
                className="flex items-center gap-2 rounded-borde-chico px-2 py-2 text-left text-sm text-texto hover:bg-fondo-hover"
              >
                <MdSearch size={16} className="shrink-0 text-texto-secundario" />
                {r.apellido}, {r.nombre}
                {r.dni ? <span className="text-texto-secundario">· DNI {r.dni}</span> : null}
              </button>
            ))}
        </Card>
      )}
    </div>
  );
}
