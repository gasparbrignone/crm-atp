import { prisma } from "@/lib/prisma/client";
import { normalizarTextoIdentidad, type CatalogoLexicoIdentidad } from "@/lib/identidad/normalizar";

// Carga el catálogo léxico configurable del Motor de Resolución de Identidad
// (tabla LexicoNombrePropio — nombres compuestos frecuentes y partículas de
// apellido argentinas) y lo shapea como el dato puro que espera
// lib/identidad/normalizar.ts. Único punto del sistema que consulta esta
// tabla — lib/identidad/ se mantiene 100% libre de Prisma, coherente con su
// arquitectura ya documentada (ver lib/identidad/README.md). Ver
// PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 6.
export async function obtenerCatalogoLexicoIdentidad(): Promise<CatalogoLexicoIdentidad> {
  const filas = await prisma.lexicoNombrePropio.findMany({
    where: { activo: true },
    select: { tipo: true, valor: true },
  });

  const nombresCompuestos: string[][] = [];
  const particulasApellido: string[][] = [];

  for (const fila of filas) {
    const tokens = normalizarTextoIdentidad(fila.valor)
      .split(" ")
      .filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    if (fila.tipo === "nombre_compuesto") nombresCompuestos.push(tokens);
    else particulasApellido.push(tokens);
  }

  return { nombresCompuestos, particulasApellido };
}
