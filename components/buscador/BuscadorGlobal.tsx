"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MdSearch, MdClose } from "react-icons/md";
import { buscarGlobalAction } from "@/app/(app)/buscador-actions";
import type { ResultadosBusquedaGlobal } from "@/lib/servicios/busqueda.service";

const VACIO: ResultadosBusquedaGlobal = { personas: [], actividades: [], padronEntradas: [] };

// Buscador global — /12-buscador-global.md. Atajo Cmd/Ctrl+K desde
// cualquier pantalla (sección 6) además del ícono siempre visible en la
// barra superior. En mobile ocupa pantalla completa (mismo componente,
// clases responsive) en vez de un dropdown angosto, porque la mayoría de
// las búsquedas en el celular pasan en movimiento.
export function BuscadorGlobal() {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadosBusquedaGlobal>(VACIO);
  const [buscando, iniciarBusqueda] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(true);
      } else if (e.key === "Escape") {
        setAbierto(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      if (abierto) {
        inputRef.current?.focus();
      } else {
        setQuery("");
        setResultados(VACIO);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [abierto]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (query.trim().length < 2) {
        setResultados(VACIO);
        return;
      }
      iniciarBusqueda(async () => {
        const r = await buscarGlobalAction(query);
        setResultados(r);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  function irA(href: string) {
    setAbierto(false);
    router.push(href);
  }

  const sinResultados =
    query.trim().length >= 2 &&
    !buscando &&
    resultados.personas.length === 0 &&
    resultados.actividades.length === 0 &&
    resultados.padronEntradas.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Buscar (Ctrl+K)"
        className="inline-flex h-11 items-center gap-2 rounded-borde-chico px-3 text-sm text-texto-secundario transition-colors hover:bg-fondo-hover hover:text-texto"
      >
        <MdSearch size={20} />
        <span className="hidden text-xs md:inline">Buscar (Ctrl+K)</span>
      </button>

      {abierto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-fondo sm:items-start sm:justify-center sm:bg-black/40 sm:p-4 sm:backdrop-blur-[2px]">
            <div
              className="hidden sm:absolute sm:inset-0 sm:block"
              aria-hidden="true"
              onClick={() => setAbierto(false)}
            />
            <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-fondo sm:mx-auto sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-borde sm:border sm:border-borde sm:bg-fondo-superficie sm:shadow-flotante">
              <div className="flex items-center gap-2 border-b border-borde p-3">
                <MdSearch size={20} className="shrink-0 text-texto-secundario" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar personas, actividades, padrón..."
                  className="min-h-11 flex-1 bg-transparent text-sm text-texto placeholder:text-texto-secundario focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar buscador"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-borde-chico text-texto-secundario hover:bg-fondo-hover hover:text-texto"
                >
                  <MdClose size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {buscando && <p className="p-3 text-sm text-texto-secundario">Buscando...</p>}
                {sinResultados && (
                  <p className="p-3 text-sm text-texto-secundario">Sin resultados para “{query}”.</p>
                )}

                {resultados.personas.length > 0 && (
                  <section className="mb-2">
                    <h2 className="px-2 py-1 text-xs font-semibold text-texto-secundario">Personas</h2>
                    {resultados.personas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => irA(`/personas/${p.id}`)}
                        className="flex w-full flex-col items-start rounded-borde-chico px-3 py-2 text-left hover:bg-fondo-hover"
                      >
                        <span className="text-sm font-medium text-texto">
                          {p.nombre} {p.apellido}
                        </span>
                        <span className="text-xs text-texto-secundario">
                          {[p.carrera, p.anio ? `Año ${p.anio}` : null, p.dni ? `DNI ${p.dni}` : null]
                            .filter(Boolean)
                            .join(" · ") || "Sin más datos"}
                        </span>
                      </button>
                    ))}
                  </section>
                )}

                {resultados.actividades.length > 0 && (
                  <section className="mb-2">
                    <h2 className="px-2 py-1 text-xs font-semibold text-texto-secundario">Actividades</h2>
                    {resultados.actividades.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => irA(`/actividades/${a.id}`)}
                        className="flex w-full flex-col items-start rounded-borde-chico px-3 py-2 text-left hover:bg-fondo-hover"
                      >
                        <span className="text-sm font-medium text-texto">{a.nombre}</span>
                        <span className="text-xs text-texto-secundario">
                          {[a.lugar, new Date(a.fechaInicio).toLocaleDateString("es-AR")]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    ))}
                  </section>
                )}

                {resultados.padronEntradas.length > 0 && (
                  <section className="mb-2">
                    <h2 className="px-2 py-1 text-xs font-semibold text-texto-secundario">Padrón</h2>
                    {resultados.padronEntradas.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => irA(`/padron/${e.padronElectoralId}`)}
                        className="flex w-full flex-col items-start rounded-borde-chico px-3 py-2 text-left hover:bg-fondo-hover"
                      >
                        <span className="text-sm font-medium text-texto">{e.nombreCompletoOriginal}</span>
                        <span className="text-xs text-texto-secundario">DNI {e.dni}</span>
                      </button>
                    ))}
                  </section>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
