import { requerirPermiso } from "@/lib/permisos/permisos";
import { listarConversaciones } from "@/lib/servicios/chatbot.service";
import { ChatbotCliente } from "@/components/chatbot/ChatbotCliente";

// Chatbot conectado a la base de datos — /15-ia.md sección 7. Solo lectura:
// responde preguntas en lenguaje natural sobre los datos a los que el
// usuario consultante ya tiene acceso, vía un conjunto acotado de
// herramientas de solo lectura (ver /lib/ia/chatbot-herramientas.ts).
export default async function ChatbotPage() {
  const usuario = await requerirPermiso("ia.usar_chatbot");
  const conversaciones = await listarConversaciones(usuario.id);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-texto">Asistente de datos</h1>
        <p className="text-sm text-texto-secundario">
          Preguntá en lenguaje natural sobre personas, actividades, punteo o padrón. Solo responde con datos
          a los que ya tenés acceso.
        </p>
      </div>
      <ChatbotCliente
        conversaciones={conversaciones.map((c) => ({
          id: c.id,
          titulo: c.titulo,
          fechaCreacion: c.fechaCreacion.toISOString(),
          cantidadMensajes: c._count.mensajes,
        }))}
      />
    </div>
  );
}
