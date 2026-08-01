"use client";

import { useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { agregarComentarioPunteoAction } from "@/app/(app)/punteo/actions";

interface Comentario {
  id: string;
  contenido: string;
  fechaCreacion: Date | string;
}

function formatearFecha(fecha: Date | string) {
  return new Date(fecha).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Bitácora de comentarios — solo alta (RN-5): no hay edición ni borrado
// desde acá. Campo de texto siempre visible, no detrás de un botón "agregar
// comentario" (/08-modulo-punteo-electoral.md sección 5), pensado para
// cargarse parado en un pasillo entre clase y clase.
export function ComentariosPunteo({
  personaId,
  comentarios,
  soloLectura,
}: {
  personaId: string;
  comentarios: Comentario[];
  soloLectura: boolean;
}) {
  const [contenido, setContenido] = useState("");
  const [comentariosLocales, setComentariosLocales] = useState(comentarios);
  const [procesando, iniciarTransicion] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function enviar() {
    const texto = contenido.trim();
    if (!texto) return;
    iniciarTransicion(async () => {
      await agregarComentarioPunteoAction(personaId, texto);
      setComentariosLocales((actual) => [
        { id: `temp-${Date.now()}`, contenido: texto, fechaCreacion: new Date() },
        ...actual,
      ]);
      setContenido("");
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-texto">Comentarios de seguimiento</p>

      {!soloLectura && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="flex flex-col gap-2"
        >
          <Textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder="Cargar un comentario nuevo (no se puede editar ni borrar después)..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <Button type="submit" disabled={procesando || !contenido.trim()} className="w-fit">
            {procesando ? "Guardando..." : "Agregar comentario"}
          </Button>
        </form>
      )}

      {comentariosLocales.length === 0 ? (
        <p className="text-sm text-texto-secundario">Todavía no hay comentarios.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comentariosLocales.map((c) => (
            <li key={c.id} className="border-l-2 border-borde pl-3">
              <p className="text-sm text-texto">{c.contenido}</p>
              <p className="text-xs text-texto-secundario">{formatearFecha(c.fechaCreacion)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
