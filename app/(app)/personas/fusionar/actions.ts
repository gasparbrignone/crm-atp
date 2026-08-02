"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  fusionarPersonas,
  listarPersonas,
  type CampoFusionable,
} from "@/lib/servicios/personas.service";

const CAMPOS: CampoFusionable[] = [
  "nombre",
  "apellido",
  "dni",
  "legajo",
  "carreraId",
  "anio",
  "instagram",
  "observacionesGenerales",
];

export interface EstadoFusionPersonas {
  error?: string;
}

export async function fusionarPersonasAction(
  definitivaId: string,
  descartadaId: string,
  _estadoPrevio: EstadoFusionPersonas,
  formData: FormData,
): Promise<EstadoFusionPersonas> {
  const usuario = await requerirPermiso("personas.fusionar_duplicados");

  const camposElegidos: Partial<Record<CampoFusionable, "definitiva" | "descartada">> = {};
  for (const campo of CAMPOS) {
    const valor = formData.get(`campo_${campo}`);
    if (valor === "definitiva" || valor === "descartada") {
      camposElegidos[campo] = valor;
    }
  }

  await fusionarPersonas({
    personaDefinitivaId: definitivaId,
    personaDescartadaId: descartadaId,
    camposElegidos,
    usuarioId: usuario.id,
  });

  revalidatePath("/personas");
  revalidatePath(`/personas/${definitivaId}`);
  redirect(`/personas/${definitivaId}`);
}

export interface CandidatoBusquedaFusion {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
}

// Detección manual del usuario (/05-modulo-personas.md sección 8.2, además de
// la sugerencia automática de IA en el alta) — buscar otra ficha para
// fusionarla contra la actual.
export async function buscarPersonasParaFusionAction(
  personaActualId: string,
  q: string,
): Promise<CandidatoBusquedaFusion[]> {
  await requerirPermiso("personas.fusionar_duplicados");
  if (q.trim().length < 2) return [];

  const { personas } = await listarPersonas({ q, porPagina: 25 });
  return personas
    .filter((p) => p.id !== personaActualId)
    .map((p) => ({ id: p.id, nombre: p.nombre, apellido: p.apellido, dni: p.dni }));
}
