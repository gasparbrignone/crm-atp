"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  crearValorCatalogo,
  actualizarValorCatalogo,
  cambiarActivoValorCatalogo,
  reordenarValorCatalogo,
  fusionarEtiquetas,
  actualizarParametroGeneral,
  type TipoCatalogo,
} from "@/lib/servicios/configuracion.service";

const PERMISO = "configuracion.gestionar";

export async function crearValorCatalogoAction(tipo: TipoCatalogo, formData: FormData) {
  const actor = await requerirPermiso(PERMISO);
  const nombre = String(formData.get("nombre") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!nombre) return;
  await crearValorCatalogo(tipo, { nombre, color: color || undefined }, actor.id);
  revalidatePath("/configuracion");
}

export async function actualizarValorCatalogoAction(
  tipo: TipoCatalogo,
  id: string,
  datos: { nombre?: string; color?: string | null },
) {
  const actor = await requerirPermiso(PERMISO);
  await actualizarValorCatalogo(tipo, id, datos, actor.id);
  revalidatePath("/configuracion");
}

export async function cambiarActivoValorCatalogoAction(tipo: TipoCatalogo, id: string, activo: boolean) {
  const actor = await requerirPermiso(PERMISO);
  await cambiarActivoValorCatalogo(tipo, id, activo, actor.id);
  revalidatePath("/configuracion");
}

export async function reordenarValorCatalogoAction(
  tipo: TipoCatalogo,
  id: string,
  direccion: "subir" | "bajar",
) {
  const actor = await requerirPermiso(PERMISO);
  await reordenarValorCatalogo(tipo, id, direccion, actor.id);
  revalidatePath("/configuracion");
}

export async function fusionarEtiquetasAction(definitivaId: string, descartadaId: string) {
  const actor = await requerirPermiso(PERMISO);
  await fusionarEtiquetas(definitivaId, descartadaId, actor.id);
  revalidatePath("/configuracion");
}

export async function actualizarParametroGeneralAction(clave: string, valor: string) {
  const actor = await requerirPermiso(PERMISO);
  await actualizarParametroGeneral(clave, valor, actor.id);
  revalidatePath("/configuracion");
}
