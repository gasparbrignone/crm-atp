import { prisma } from "@/lib/prisma/client";
import { registrarCambio } from "@/lib/servicios/auditoria.service";

// Gestión de catálogos editables y parámetros generales —
// /18-configuracion-sistema.md. Módulo exclusivamente administrativo
// (permiso configuracion.gestionar, sección 11 de ese documento).
//
// Los 4 catálogos comparten forma y reglas de negocio (sección 2 y 10):
// - RN-1/RN-2: nunca se eliminan físicamente, solo se desactivan
//   (activo=false); desactivar no afecta a los registros que ya usan el
//   valor, solo lo retira de los selectores para altas nuevas — por eso acá
//   nunca hay una función "eliminar", solo "desactivar"/"reactivar".
// - Reordenamiento manual: en vez de arrastrar y soltar (que sumaría una
//   librería de drag-and-drop solo para esto), se implementa como
//   intercambiar el campo `orden` con el valor adyacente — mismo resultado
//   para el usuario (subir/bajar un lugar), sin dependencia nueva.

export type TipoCatalogo = "carrera" | "tipoActividad" | "etiqueta" | "clasificacionPunteo";

const NOMBRES_ENTIDAD: Record<TipoCatalogo, string> = {
  carrera: "Carrera",
  tipoActividad: "TipoActividad",
  etiqueta: "Etiqueta",
  clasificacionPunteo: "ClasificacionPunteo",
};

function delegado(tipo: TipoCatalogo) {
  switch (tipo) {
    case "carrera":
      return prisma.carrera;
    case "tipoActividad":
      return prisma.tipoActividad;
    case "etiqueta":
      return prisma.etiqueta;
    case "clasificacionPunteo":
      return prisma.clasificacionPunteo;
  }
}

export interface ValorCatalogo {
  id: string;
  nombre: string;
  color: string | null;
  orden: number | null;
  activo: boolean;
  cantidadEnUso: number;
}

// Conteo de uso — informativo en la UI ("N personas usan esta carrera"), no
// bloquea nada (la única restricción real es no poder eliminar físicamente,
// y la UI nunca ofrece esa opción).
async function contarUso(tipo: TipoCatalogo, id: string): Promise<number> {
  switch (tipo) {
    case "carrera":
      return prisma.persona.count({ where: { carreraId: id } });
    case "tipoActividad":
      return prisma.actividad.count({ where: { tipoActividadId: id } });
    case "etiqueta":
      return prisma.personaEtiqueta.count({ where: { etiquetaId: id } });
    case "clasificacionPunteo":
      return prisma.punteoPersona.count({ where: { clasificacionId: id } });
  }
}

export async function listarCatalogo(tipo: TipoCatalogo): Promise<ValorCatalogo[]> {
  const valores = await (delegado(tipo) as { findMany: (args: unknown) => Promise<unknown[]> }).findMany({
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });

  return Promise.all(
    (valores as { id: string; nombre: string; color?: string | null; orden: number | null; activo: boolean }[]).map(
      async (v) => ({
        id: v.id,
        nombre: v.nombre,
        color: v.color ?? null,
        orden: v.orden,
        activo: v.activo,
        cantidadEnUso: await contarUso(tipo, v.id),
      }),
    ),
  );
}

export async function crearValorCatalogo(
  tipo: TipoCatalogo,
  datos: { nombre: string; color?: string },
  actorId: string,
) {
  const ultimo = await (delegado(tipo) as { findFirst: (args: unknown) => Promise<{ orden: number | null } | null> }).findFirst({
    orderBy: { orden: "desc" },
  });
  const orden = (ultimo?.orden ?? 0) + 1;

  const creado = await (delegado(tipo) as { create: (args: unknown) => Promise<{ id: string }> }).create({
    data: { nombre: datos.nombre.trim(), color: datos.color || null, orden, activo: true },
  });

  await registrarCambio({
    entidad: NOMBRES_ENTIDAD[tipo],
    entidadId: creado.id,
    accion: "crear",
    usuarioId: actorId,
  });
  return creado;
}

export async function actualizarValorCatalogo(
  tipo: TipoCatalogo,
  id: string,
  datos: { nombre?: string; color?: string | null },
  actorId: string,
) {
  await (delegado(tipo) as { update: (args: unknown) => Promise<unknown> }).update({
    where: { id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
      ...(datos.color !== undefined ? { color: datos.color || null } : {}),
    },
  });
  await registrarCambio({ entidad: NOMBRES_ENTIDAD[tipo], entidadId: id, accion: "editar", usuarioId: actorId });
}

// Desactivar/reactivar — nunca elimina físicamente (RN-1). Reactivar un
// valor previamente desactivado es la forma de deshacer un error de tipeo
// en la desactivación, sin necesidad de recrearlo (que rompería las
// referencias existentes con un id nuevo).
export async function cambiarActivoValorCatalogo(
  tipo: TipoCatalogo,
  id: string,
  activo: boolean,
  actorId: string,
) {
  await (delegado(tipo) as { update: (args: unknown) => Promise<unknown> }).update({
    where: { id },
    data: { activo },
  });
  await registrarCambio({
    entidad: NOMBRES_ENTIDAD[tipo],
    entidadId: id,
    accion: activo ? "restaurar" : "archivar",
    usuarioId: actorId,
  });
}

export async function reordenarValorCatalogo(
  tipo: TipoCatalogo,
  id: string,
  direccion: "subir" | "bajar",
  actorId: string,
) {
  const valores = await listarCatalogo(tipo);
  const indice = valores.findIndex((v) => v.id === id);
  if (indice === -1) return;
  const indiceVecino = direccion === "subir" ? indice - 1 : indice + 1;
  if (indiceVecino < 0 || indiceVecino >= valores.length) return;

  const actual = valores[indice];
  const vecino = valores[indiceVecino];
  const ordenActual = actual.orden ?? indice;
  const ordenVecino = vecino.orden ?? indiceVecino;

  await prisma.$transaction(async (tx) => {
    const txDelegado = { carrera: tx.carrera, tipoActividad: tx.tipoActividad, etiqueta: tx.etiqueta, clasificacionPunteo: tx.clasificacionPunteo }[
      tipo
    ] as { update: (args: unknown) => Promise<unknown> };
    await txDelegado.update({ where: { id: actual.id }, data: { orden: ordenVecino } });
    await txDelegado.update({ where: { id: vecino.id }, data: { orden: ordenActual } });
  });
  await registrarCambio({
    entidad: NOMBRES_ENTIDAD[tipo],
    entidadId: id,
    accion: "editar",
    usuarioId: actorId,
    campo: "orden",
  });
}

// Fusión de dos Etiquetas duplicadas por error de tipeo —
// /18-configuracion-sistema.md sección 5: reasigna todas las Personas
// afectadas de la descartada a la definitiva (sin duplicar la relación si
// una Persona ya tenía ambas) y desactiva la descartada, nunca la elimina.
export async function fusionarEtiquetas(definitivaId: string, descartadaId: string, actorId: string) {
  if (definitivaId === descartadaId) return;

  await prisma.$transaction(async (tx) => {
    const asignacionesDescartada = await tx.personaEtiqueta.findMany({
      where: { etiquetaId: descartadaId },
    });
    const yaTieneDefinitiva = new Set(
      (
        await tx.personaEtiqueta.findMany({
          where: { etiquetaId: definitivaId },
          select: { personaId: true },
        })
      ).map((p) => p.personaId),
    );

    for (const asignacion of asignacionesDescartada) {
      if (!yaTieneDefinitiva.has(asignacion.personaId)) {
        await tx.personaEtiqueta.update({
          where: { id: asignacion.id },
          data: { etiquetaId: definitivaId },
        });
      } else {
        await tx.personaEtiqueta.delete({ where: { id: asignacion.id } });
      }
    }

    await tx.etiqueta.update({ where: { id: descartadaId }, data: { activo: false } });
  });

  await registrarCambio({
    entidad: "Etiqueta",
    entidadId: descartadaId,
    accion: "fusionar",
    usuarioId: actorId,
    metadata: { fusionadaEnId: definitivaId },
  });
  await registrarCambio({
    entidad: "Etiqueta",
    entidadId: definitivaId,
    accion: "fusionar",
    usuarioId: actorId,
    metadata: { absorbioAId: descartadaId },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Parámetros generales del sistema — /18-configuracion-sistema.md sección 8.
// ─────────────────────────────────────────────────────────────────────────

export async function listarParametrosGenerales() {
  return prisma.configuracionSistema.findMany({ orderBy: { clave: "asc" } });
}

export async function actualizarParametroGeneral(clave: string, valor: string, actorId: string) {
  await prisma.configuracionSistema.update({
    where: { clave },
    data: { valor, modificadoPorId: actorId },
  });
  await registrarCambio({
    entidad: "ConfiguracionSistema",
    entidadId: clave,
    accion: "editar",
    usuarioId: actorId,
    campo: "valor",
    valorNuevo: valor,
  });
}
