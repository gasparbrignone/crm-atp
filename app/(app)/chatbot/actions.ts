"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  listarConversaciones,
  obtenerConversacion,
  enviarMensajeChatbot,
} from "@/lib/servicios/chatbot.service";

export async function listarConversacionesAction() {
  const usuario = await requerirPermiso("ia.usar_chatbot");
  return listarConversaciones(usuario.id);
}

export async function obtenerConversacionAction(conversacionId: string) {
  const usuario = await requerirPermiso("ia.usar_chatbot");
  return obtenerConversacion(conversacionId, usuario.id);
}

export async function enviarMensajeChatbotAction(conversacionId: string | null, texto: string) {
  const usuario = await requerirPermiso("ia.usar_chatbot");
  const resultado = await enviarMensajeChatbot(usuario, conversacionId, texto);
  revalidatePath("/chatbot");
  return resultado;
}
