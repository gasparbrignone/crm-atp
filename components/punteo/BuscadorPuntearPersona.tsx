"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MdSearch, MdPersonAdd } from "react-icons/md";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  buscarPersonasParaPuntearAction,
  crearPersonaDesdePunteoAction,
} from "@/app/(app)/punteo/actions";

interface Resultado {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Acceso rápido a una persona nueva — /08-modulo-punteo-electoral.md sección 5:
// "la primera interacción crea el PunteoPersona automáticamente" (no hay un
// paso de alta de punteo separado, se resuelve al cargar el primer
// comentario/clasificación en la ficha de destino). El alta manual de una
// Persona que todavía no está cargada (pedido explícito de Gaspar,
// 2026-08-01: el punteo releva potenciales votantes, no solo gente que ya
// pasó por una Actividad o una importación) reusa crearPersona() completo.
export function BuscadorPuntearPersona({ puedeCrearPersona }: { puedeCrearPersona: boolean }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [creando, iniciarAlta] = useTransition();
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

  function abrirAlta() {
    setErrorAlta(null);
    // Si ya escribió algo en el buscador, lo usamos como punto de partida
    // (partido en dos palabras si se puede) para no hacerlo retipear.
    const partes = query.trim().split(/\s+/);
    if (partes.length >= 2 && !nombre && !apellido) {
      setNombre(partes[0]);
      setApellido(partes.slice(1).join(" "));
    }
    setMostrarAlta(true);
  }

  function confirmarAlta() {
    setErrorAlta(null);
    iniciarAlta(async () => {
      const resultado = await crearPersonaDesdePunteoAction(nombre, apellido, telefono);
      if (!resultado.ok || !resultado.personaId) {
        setErrorAlta(resultado.error ?? "No se pudo crear la persona.");
        return;
      }
      router.push(`/punteo/${resultado.personaId}`);
    });
  }

  if (mostrarAlta) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-texto">Cargar persona nueva</p>
        <p className="text-xs text-texto-secundario">
          Para alguien que todavía no está en el sistema (no pasó por ninguna actividad ni
          importación). Solo nombre y apellido son obligatorios.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
        </div>
        <Input
          label="Teléfono (opcional)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        {errorAlta && (
          <p role="alert" className="text-sm text-error">
            {errorAlta}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={confirmarAlta} disabled={creando || !nombre.trim() || !apellido.trim()}>
            {creando ? "Creando..." : "Crear y empezar a puntear"}
          </Button>
          <Button
            variant="fantasma"
            onClick={() => {
              setMostrarAlta(false);
              setErrorAlta(null);
            }}
            disabled={creando}
          >
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Buscar persona por nombre, apellido o DNI..."
            aria-label="Buscar persona para puntear"
          />
        </div>
        {puedeCrearPersona && (
          <Button variant="secundario" onClick={abrirAlta} className="shrink-0">
            <MdPersonAdd size={18} />
            <span className="hidden sm:inline">Persona nueva</span>
          </Button>
        )}
      </div>
      {query.trim().length >= 2 && (
        <Card padding="chico" className="flex flex-col gap-1">
          {buscando && <p className="px-2 py-1 text-sm text-texto-secundario">Buscando...</p>}
          {!buscando && resultados.length === 0 && (
            <div className="flex flex-col gap-2 px-2 py-1">
              <p className="text-sm text-texto-secundario">Sin resultados.</p>
              {puedeCrearPersona && (
                <button
                  onClick={abrirAlta}
                  className="flex w-fit items-center gap-1 text-sm text-secundario hover:underline"
                >
                  <MdPersonAdd size={16} />
                  Cargarla como persona nueva
                </button>
              )}
            </div>
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
