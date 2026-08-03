import { prisma } from "@/lib/prisma/client";
import { generarRespuestaChatbot, type MensajeHistorial } from "@/lib/ia/chatbot";
import type { UsuarioConPermisos } from "@/lib/permisos/permisos";

// Persistencia y orquestación del chatbot — /04-modelo-datos.md sección 15 y
// /15-ia.md sección 7.4: cada conversación se guarda completa, incluyendo qué
// herramientas/consultas se ejecutaron para cada respuesta (auditoría de qué
// datos fueron consultados y por quién). Las conversaciones son estrictamente
// privadas a su dueño — no hay vista "de todos los usuarios" de este módulo,
// a diferencia de otras entidades del sistema.

export class ConversacionAjenaError extends Error {
  constructor() {
    super("Esta conversación no te pertenece.");
    this.name = "ConversacionAjenaError";
  }
}

export class LimiteMensajesConversacionError extends Error {
  constructor(public limite: number) {
    super(
      `Esta conversación llegó al límite de ${limite} mensajes. Iniciá una conversación nueva para seguir preguntando.`,
    );
    this.name = "LimiteMensajesConversacionError";
  }
}

const LIMITE_MENSAJES_DEFAULT = 40;

async function obtenerLimiteMensajes(): Promise<number> {
  const config = await prisma.configuracionSistema.findUnique({
    where: { clave: "chatbot_max_mensajes_por_conversacion" },
  });
  const valor = config ? Number(config.valor) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_MENSAJES_DEFAULT;
}

export async function listarConversaciones(usuarioId: string) {
  return prisma.chatbotConversacion.findMany({
    where: { usuarioId },
    orderBy: { fechaCreacion: "desc" },
    include: { _count: { select: { mensajes: true } } },
  });
}

export async function obtenerConversacion(conversacionId: string, usuarioId: string) {
  const conversacion = await prisma.chatbotConversacion.findUniqueOrThrow({
    where: { id: conversacionId },
    include: { mensajes: { orderBy: { fechaCreacion: "asc" } } },
  });
  if (conversacion.usuarioId !== usuarioId) throw new ConversacionAjenaError();
  return conversacion;
}

// Título automático: primeras palabras del primer mensaje, para que la lista
// de conversaciones sea reconocible sin tener que abrir cada una.
function tituloDesdeTexto(texto: string): string {
  const recortado = texto.trim().slice(0, 60);
  return recortado.length < texto.trim().length ? `${recortado}…` : recortado;
}

export interface ResultadoEnvioMensaje {
  conversacionId: string;
  respuesta: string;
}

export async function enviarMensajeChatbot(
  usuario: UsuarioConPermisos,
  conversacionIdExistente: string | null,
  texto: string,
): Promise<ResultadoEnvioMensaje> {
  const mensaje = texto.trim();
  if (!mensaje) throw new Error("El mensaje no puede estar vacío.");

  let conversacion = conversacionIdExistente
    ? await prisma.chatbotConversacion.findUniqueOrThrow({
        where: { id: conversacionIdExistente },
        include: { mensajes: { orderBy: { fechaCreacion: "asc" } } },
      })
    : null;

  if (conversacion && conversacion.usuarioId !== usuario.id) throw new ConversacionAjenaError();

  const limite = await obtenerLimiteMensajes();
  const mensajesPrevios = conversacion?.mensajes ?? [];
  if (mensajesPrevios.length + 2 > limite) {
    throw new LimiteMensajesConversacionError(limite);
  }

  if (!conversacion) {
    conversacion = await prisma.chatbotConversacion.create({
      data: { usuarioId: usuario.id, titulo: tituloDesdeTexto(mensaje) },
      include: { mensajes: true },
    });
  }

  const historial: MensajeHistorial[] = mensajesPrevios.map((m) => ({
    rol: m.rol === "usuario" ? "usuario" : "modelo",
    contenido: m.contenido,
  }));

  await prisma.chatbotMensaje.create({
    data: { conversacionId: conversacion.id, rol: "usuario", contenido: mensaje },
  });

  // El mensaje del usuario ya quedó guardado arriba: si generarRespuestaChatbot
  // revienta (ej. cuota diaria de Gemini agotada) sin este try/catch, la
  // pregunta quedaba huérfana en la base para siempre (sin respuesta, pero
  // sí contando para el límite de mensajes de la conversación) y el usuario
  // veía un error crudo en vez de un mensaje entendible (bug real encontrado
  // en auditoría 2026-08-03, contradice /CLAUDE.md sección 4). Con esto, un
  // fallo de la IA se guarda como una respuesta del asistente explicando el
  // problema, igual que cualquier otro turno.
  let respuestaTexto: string;
  let resultado: Awaited<ReturnType<typeof generarRespuestaChatbot>> | null = null;
  try {
    resultado = await generarRespuestaChatbot(usuario, historial, mensaje);
    respuestaTexto = resultado.respuesta;
  } catch {
    respuestaTexto =
      "No pude responder ahora mismo (falló la conexión con la IA). Probá de nuevo en unos minutos.";
  }

  await prisma.chatbotMensaje.create({
    data: {
      conversacionId: conversacion.id,
      rol: "asistente",
      contenido: respuestaTexto,
      consultasEjecutadas:
        resultado && resultado.consultasEjecutadas.length > 0
          ? JSON.stringify(resultado.consultasEjecutadas)
          : null,
    },
  });

  return { conversacionId: conversacion.id, respuesta: respuestaTexto };
}
