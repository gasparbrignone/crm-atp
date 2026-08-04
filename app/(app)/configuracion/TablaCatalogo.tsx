"use client";

import { useState, useTransition } from "react";
import { MdArrowUpward, MdArrowDownward, MdCheck, MdClose } from "react-icons/md";
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
import { cn } from "@/lib/utils/cn";
import type { ValorCatalogo, TipoCatalogo } from "@/lib/servicios/configuracion.service";
import {
  crearValorCatalogoAction,
  actualizarValorCatalogoAction,
  cambiarActivoValorCatalogoAction,
  reordenarValorCatalogoAction,
  fusionarEtiquetasAction,
} from "./actions";

// Panel de gestión de un catálogo editable — /18-configuracion-sistema.md
// sección 2 (patrón común a los 4 catálogos: listar, crear, editar,
// desactivar, reordenar). La edición es inline (nombre y color), sin
// pantalla de formulario separada, como pide la sección 9 de ese documento
// para operaciones "tan livianas".
export function TablaCatalogo({
  tipo,
  titulo,
  valores,
  permiteFusion = false,
}: {
  tipo: TipoCatalogo;
  titulo: string;
  valores: ValorCatalogo[];
  permiteFusion?: boolean;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [, iniciar] = useTransition();
  const [fusionando, setFusionando] = useState<string | null>(null);
  const [fusionarCon, setFusionarCon] = useState("");

  function empezarEdicion(v: ValorCatalogo) {
    setEditandoId(v.id);
    setNombreEdicion(v.nombre);
  }

  function guardarEdicion(id: string) {
    if (!nombreEdicion.trim()) return;
    iniciar(() => actualizarValorCatalogoAction(tipo, id, { nombre: nombreEdicion }));
    setEditandoId(null);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-texto">{titulo}</h2>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{" "}</TableHeaderCell>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Color</TableHeaderCell>
            <TableHeaderCell>En uso</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>{" "}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {valores.length === 0 && <TableEmptyState>Sin valores todavía.</TableEmptyState>}
          {valores.map((v, i) => (
            <TableRow key={v.id}>
              <TableCell className="w-16">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => iniciar(() => reordenarValorCatalogoAction(tipo, v.id, "subir"))}
                    className="rounded p-1 text-texto-secundario hover:bg-fondo-hover disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <MdArrowUpward size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={i === valores.length - 1}
                    onClick={() => iniciar(() => reordenarValorCatalogoAction(tipo, v.id, "bajar"))}
                    className="rounded p-1 text-texto-secundario hover:bg-fondo-hover disabled:opacity-30"
                    aria-label="Bajar"
                  >
                    <MdArrowDownward size={14} />
                  </button>
                </div>
              </TableCell>
              <TableCell>
                {editandoId === v.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={nombreEdicion}
                      onChange={(e) => setNombreEdicion(e.target.value)}
                      autoFocus
                      className="h-9 py-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarEdicion(v.id);
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => guardarEdicion(v.id)}
                      className="rounded p-1.5 text-exito hover:bg-fondo-hover"
                      aria-label="Guardar"
                    >
                      <MdCheck size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="rounded p-1.5 text-texto-secundario hover:bg-fondo-hover"
                      aria-label="Cancelar"
                    >
                      <MdClose size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => empezarEdicion(v)}
                    className={cn("text-left hover:underline", !v.activo && "text-texto-secundario line-through")}
                  >
                    {v.nombre}
                  </button>
                )}
              </TableCell>
              <TableCell>
                <input
                  type="color"
                  defaultValue={v.color ?? "#94a3b8"}
                  onBlur={(e) => iniciar(() => actualizarValorCatalogoAction(tipo, v.id, { color: e.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border border-borde bg-transparent"
                  aria-label={`Color de ${v.nombre}`}
                />
              </TableCell>
              <TableCell className="text-texto-secundario">{v.cantidadEnUso}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    v.activo ? "bg-exito/10 text-exito" : "bg-fondo-hover text-texto-secundario",
                  )}
                >
                  {v.activo ? "Activo" : "Inactivo"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {permiteFusion && v.activo && (
                    <Button
                      variant="fantasma"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setFusionando(v.id);
                        setFusionarCon("");
                      }}
                    >
                      Fusionar
                    </Button>
                  )}
                  <Button
                    variant="fantasma"
                    className="h-8 px-2 text-xs"
                    onClick={() => iniciar(() => cambiarActivoValorCatalogoAction(tipo, v.id, !v.activo))}
                  >
                    {v.activo ? "Desactivar" : "Reactivar"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {fusionando && (
        <div className="flex flex-wrap items-center gap-2 rounded-borde-chico border border-borde bg-fondo-hover/50 p-3">
          <span className="text-sm text-texto">
            Fusionar &quot;{valores.find((v) => v.id === fusionando)?.nombre}&quot; dentro de:
          </span>
          <select
            value={fusionarCon}
            onChange={(e) => setFusionarCon(e.target.value)}
            className="min-h-9 rounded-borde-chico border border-borde bg-fondo-superficie px-2 text-sm"
          >
            <option value="">Elegí la etiqueta definitiva...</option>
            {valores
              .filter((v) => v.id !== fusionando && v.activo)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
          </select>
          <Button
            className="h-9"
            disabled={!fusionarCon}
            onClick={() => {
              iniciar(() => fusionarEtiquetasAction(fusionarCon, fusionando));
              setFusionando(null);
            }}
          >
            Confirmar fusión
          </Button>
          <Button variant="secundario" className="h-9" onClick={() => setFusionando(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <form
        action={(formData) => iniciar(() => crearValorCatalogoAction(tipo, formData))}
        className="flex items-end gap-2"
      >
        <Input name="nombre" placeholder="Nombre del nuevo valor" className="max-w-xs" required />
        <input type="color" name="color" defaultValue="#94a3b8" className="h-11 w-12 rounded border border-borde" />
        <Button type="submit" variant="secundario">
          Agregar
        </Button>
      </form>
    </div>
  );
}
