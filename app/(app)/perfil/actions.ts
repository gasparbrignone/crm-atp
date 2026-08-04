"use server";

import { revalidatePath } from "next/cache";
import { obtenerUsuarioActual, ErrorSinSesion } from "@/lib/permisos/permisos";
import { actualizarDatosUsuario } from "@/lib/servicios/usuarios.service";
import { actualizarPreferenciasNotificacion } from "@/lib/servicios/notificaciones.service";

export interface EstadoFormularioPerfil {
  error?: string;
  ok?: boolean;
}

export async function actualizarPerfilAction(
  _estadoPrevio: EstadoFormularioPerfil,
  formData: FormData,
): Promise<EstadoFormularioPerfil> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) throw new ErrorSinSesion();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  if (!nombre || !apellido) {
    return { error: "Nombre y apellido son obligatorios." };
  }

  await actualizarDatosUsuario(
    usuario.id,
    { nombre, apellido, telefono: telefono || null },
    usuario.id,
  );

  const recibirDigestEmail = formData.get("recibirDigestEmail") === "on";
  const frecuenciaDigestEmail = formData.get("frecuenciaDigestEmail") === "semanal" ? "semanal" : "diario";
  await actualizarPreferenciasNotificacion(usuario.id, { recibirDigestEmail, frecuenciaDigestEmail });

  revalidatePath("/perfil");
  return { ok: true };
}
