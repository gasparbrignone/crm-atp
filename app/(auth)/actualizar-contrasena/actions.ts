"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface EstadoActualizarContrasena {
  error?: string;
}

// Política de contraseñas: mínimo 10 caracteres — ver /16-seguridad.md sección 2.
export async function actualizarContrasena(
  _estadoPrevio: EstadoActualizarContrasena,
  formData: FormData,
): Promise<EstadoActualizarContrasena> {
  const password = String(formData.get("password") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");

  if (password.length < 10) {
    return { error: "La contraseña debe tener al menos 10 caracteres." };
  }
  if (password !== confirmacion) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "No pudimos actualizar tu contraseña. Pedí un nuevo link de recuperación." };
  }

  redirect("/dashboard");
}
