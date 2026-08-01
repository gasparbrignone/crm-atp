"use server";

import { createClient } from "@/lib/supabase/server";

export interface EstadoRecuperarContrasena {
  error?: string;
  enviado?: boolean;
}

export async function solicitarRecuperacion(
  _estadoPrevio: EstadoRecuperarContrasena,
  formData: FormData,
): Promise<EstadoRecuperarContrasena> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Ingresá tu email." };
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/actualizar-contrasena`,
  });

  // Se responde igual exista o no el email, para no filtrar qué direcciones
  // están registradas en el sistema.
  return { enviado: true };
}
