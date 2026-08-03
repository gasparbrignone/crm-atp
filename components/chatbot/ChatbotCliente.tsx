"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MdAdd, MdSend } from "react-icons/md";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils/cn";
import {
  obtenerConversacionAction,
  enviarMensajeChatbotAction,
} from "@/app/(app)/chatbot/actions";

interface ConversacionResumen {
  id: string;
  titulo: string | null;
  fechaCreacion: string;
  cantidadMensajes: number;
}

interface MensajeLocal {
  id: string;
  rol: "usuario" | "asistente";
  contenido: string;
}

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function ChatbotCliente({ conversaciones }: { conversaciones: ConversacionResumen[] }) {
  const [lista, setLista] = useState(conversaciones);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeLocal[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargandoConversacion, iniciarCargaConversacion] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  function nuevaConversacion() {
    setConversacionId(null);
    setMensajes([]);
    setError(null);
  }

  function abrirConversacion(id: string) {
    setError(null);
    iniciarCargaConversacion(async () => {
      const conversacion = await obtenerConversacionAction(id);
      setConversacionId(conversacion.id);
      setMensajes(
        conversacion.mensajes.map((m) => ({ id: m.id, rol: m.rol, contenido: m.contenido })),
      );
    });
  }

  function enviar() {
    const mensaje = texto.trim();
    if (!mensaje) return;
    setError(null);
    const idTemporal = `temp-${Date.now()}`;
    setMensajes((actual) => [...actual, { id: idTemporal, rol: "usuario", contenido: mensaje }]);
    setTexto("");

    iniciarEnvio(async () => {
      try {
        const resultado = await enviarMensajeChatbotAction(conversacionId, mensaje);
        setMensajes((actual) => [
          ...actual,
          { id: `${idTemporal}-resp`, rol: "asistente", contenido: resultado.respuesta },
        ]);
        if (!conversacionId) {
          setConversacionId(resultado.conversacionId);
          setLista((actual) => [
            {
              id: resultado.conversacionId,
              titulo: mensaje.slice(0, 60),
              fechaCreacion: new Date().toISOString(),
              cantidadMensajes: 2,
            },
            ...actual,
          ]);
        } else {
          setLista((actual) =>
            actual.map((c) =>
              c.id === conversacionId ? { ...c, cantidadMensajes: c.cantidadMensajes + 2 } : c,
            ),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje. Probá de nuevo.");
        setMensajes((actual) => actual.filter((m) => m.id !== idTemporal));
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <Card padding="chico" className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
        <Button variant="secundario" className="mb-2 w-full justify-start gap-1.5" onClick={nuevaConversacion}>
          <MdAdd size={16} /> Conversación nueva
        </Button>
        {lista.length === 0 ? (
          <p className="px-2 text-xs text-texto-secundario">Todavía no tenés conversaciones.</p>
        ) : (
          lista.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirConversacion(c.id)}
              className={cn(
                "flex flex-col gap-0.5 rounded-borde-chico px-2.5 py-2 text-left text-sm transition-colors",
                conversacionId === c.id
                  ? "bg-primario/10 text-primario"
                  : "text-texto-secundario hover:bg-fondo-hover hover:text-texto",
              )}
            >
              <span className="truncate">{c.titulo || "Conversación"}</span>
              <span className="text-xs opacity-70">{formatearFecha(c.fechaCreacion)}</span>
            </button>
          ))
        )}
      </Card>

      <Card padding="chico" className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex-1 overflow-y-auto px-2">
          {cargandoConversacion ? (
            <p className="py-8 text-center text-sm text-texto-secundario">Cargando conversación...</p>
          ) : mensajes.length === 0 ? (
            <p className="py-8 text-center text-sm text-texto-secundario">
              Preguntá algo como &quot;¿cuántas personas de Enfermería de 3er año hay activas?&quot; o
              &quot;¿qué actividades tuvieron menor asistencia este mes?&quot;.
            </p>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              {mensajes.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-borde-chico px-3 py-2 text-sm",
                    m.rol === "usuario"
                      ? "ml-auto bg-primario text-white"
                      : "mr-auto bg-fondo-hover text-texto",
                  )}
                >
                  {m.contenido}
                </div>
              ))}
              {enviando && (
                <div className="mr-auto rounded-borde-chico bg-fondo-hover px-3 py-2 text-sm text-texto-secundario">
                  Pensando...
                </div>
              )}
              <div ref={finRef} />
            </div>
          )}
        </div>

        {error && <p className="px-2 text-sm text-error">{error}</p>}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí tu pregunta..."
            rows={1}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <Button type="submit" disabled={enviando || !texto.trim()} className="shrink-0">
            <MdSend size={18} />
          </Button>
        </form>
      </Card>
    </div>
  );
}
