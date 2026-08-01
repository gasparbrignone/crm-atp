"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  crearPersona,
  actualizarPersona,
  archivarPersona,
  restaurarPersona,
  DniDuplicadoError,
} from "@/lib/servicios/personas.service";
import { personaFormSchema } from "@/lib/validaciones/persona.validation";

export interface EstadoFormularioPersona {
  error?: string;
  personaExistenteId?: string;
  erroresCampo?: Record<string, string>;
}

function datosDeFormulario(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? ""),
    apellido: String(formData.get("apellido") ?? ""),
    dni: String(formData.get("dni") ?? ""),
    legajo: String(formData.get("legajo") ?? ""),
    carreraId: String(formData.get("carreraId") ?? ""),
    anio: String(formData.get("anio") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    email: String(formData.get("email") ?? ""),
    instagram: String(formData.get("instagram") ?? ""),
    observacionesGenerales: String(formData.get("observacionesGenerales") ?? ""),
  };
}

export async function crearPersonaAction(
  _estadoPrevio: EstadoFormularioPersona,
  formData: FormData,
): Promise<EstadoFormularioPersona> {
  const usuario = await requerirPermiso("personas.crear");

  const parsed = personaFormSchema.safeParse(datosDeFormulario(formData));
  if (!parsed.success) {
    const erroresCampo: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      erroresCampo[String(issue.path[0])] = issue.message;
    }
    return { error: "Revisá los campos marcados.", erroresCampo };
  }

  let personaId: string;
  try {
    const persona = await crearPersona(parsed.data, usuario.id);
    personaId = persona.id;
  } catch (error) {
    if (error instanceof DniDuplicadoError) {
      return { error: error.message, personaExistenteId: error.personaExistente.id };
    }
    throw error;
  }

  revalidatePath("/personas");
  redirect(`/personas/${personaId}`);
}

export async function actualizarCampoPersonaAction(
  personaId: string,
  campo: string,
  valor: string,
): Promise<{ error?: string }> {
  const usuario = await requerirPermiso("personas.editar");

  const parsed = personaFormSchema.partial().safeParse({ [campo]: valor });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valor inválido." };
  }

  try {
    await actualizarPersona(personaId, parsed.data, usuario.id);
  } catch (error) {
    if (error instanceof DniDuplicadoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
  return {};
}

export async function archivarPersonaAction(personaId: string) {
  const usuario = await requerirPermiso("personas.archivar");
  await archivarPersona(personaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
}

export async function restaurarPersonaAction(personaId: string) {
  const usuario = await requerirPermiso("personas.archivar");
  await restaurarPersona(personaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
}
