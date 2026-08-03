import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

// Buscador global — /12-buscador-global.md. Búsqueda difusa (pg_trgm +
// unaccent, ver migración 20260802190000_buscador_trgm_unaccent) sobre
// Persona, Actividad y PadronEntrada — el punteo nunca forma parte del
// índice (sección 2), ni siquiera para el usuario dueño de ese punteo.
//
// Umbral de similitud bajo (0.15) a propósito: preferimos traer algún
// resultado de más y dejar que el ranking (sección 5: exacto > nombre
// completo > difuso > secundario) lo ordene, antes que no mostrar nada por
// un umbral demasiado estricto en una búsqueda incremental mientras el
// usuario todavía está tipeando.
const UMBRAL_SIMILITUD = 0.15;
const LIMITE_POR_ENTIDAD = 8;

export interface ResultadoBusquedaPersona {
  tipo: "persona";
  id: string;
  nombre: string;
  apellido: string;
  carrera: string | null;
  anio: number | null;
  dni: string | null;
}

export interface ResultadoBusquedaActividad {
  tipo: "actividad";
  id: string;
  nombre: string;
  lugar: string | null;
  fechaInicio: Date;
}

export interface ResultadoBusquedaPadronEntrada {
  tipo: "padron_entrada";
  id: string;
  nombreCompletoOriginal: string;
  dni: string;
  padronElectoralId: string;
}

export interface ResultadosBusquedaGlobal {
  personas: ResultadoBusquedaPersona[];
  actividades: ResultadoBusquedaActividad[];
  padronEntradas: ResultadoBusquedaPadronEntrada[];
}

export interface PermisosBusqueda {
  puedeVerPersonas: boolean;
  puedeVerActividades: boolean;
  puedeVerPadron: boolean;
}

async function buscarPersonas(q: string): Promise<ResultadoBusquedaPersona[]> {
  return prisma.$queryRaw<ResultadoBusquedaPersona[]>(Prisma.sql`
    SELECT
      'persona' AS tipo,
      p.id,
      p.nombre,
      p.apellido,
      c.nombre AS carrera,
      p.anio,
      p.dni
    FROM "Persona" p
    LEFT JOIN "Carrera" c ON c.id = p."carreraId"
    WHERE p."estadoFicha" != 'fusionada'
      AND (
        similarity(unaccent(lower(p.nombre)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
        OR similarity(unaccent(lower(p.apellido)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
        OR similarity(unaccent(lower(p.nombre || ' ' || p.apellido)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
        OR similarity(unaccent(lower(p.apellido || ' ' || p.nombre)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
        OR p.dni ILIKE ${"%" + q + "%"}
        OR p.legajo ILIKE ${"%" + q + "%"}
        OR p.instagram ILIKE ${"%" + q + "%"}
        OR p."observacionesGenerales" ILIKE ${"%" + q + "%"}
        OR EXISTS (SELECT 1 FROM "PersonaTelefono" t WHERE t."personaId" = p.id AND t.numero ILIKE ${"%" + q + "%"})
        OR EXISTS (SELECT 1 FROM "PersonaEmail" e WHERE e."personaId" = p.id AND e.email ILIKE ${"%" + q + "%"})
        OR EXISTS (
          SELECT 1 FROM "PersonaEtiqueta" pe
          JOIN "Etiqueta" et ON et.id = pe."etiquetaId"
          WHERE pe."personaId" = p.id AND similarity(unaccent(lower(et.nombre)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
        )
      )
    ORDER BY
      (p.dni = ${q}) DESC,
      (lower(p.nombre || ' ' || p.apellido) = lower(${q})) DESC,
      (lower(p.apellido || ' ' || p.nombre) = lower(${q})) DESC,
      GREATEST(
        similarity(unaccent(lower(p.nombre)), unaccent(lower(${q}))),
        similarity(unaccent(lower(p.apellido)), unaccent(lower(${q})))
      ) DESC
    LIMIT ${LIMITE_POR_ENTIDAD}
  `);
}

async function buscarActividades(q: string): Promise<ResultadoBusquedaActividad[]> {
  return prisma.$queryRaw<ResultadoBusquedaActividad[]>(Prisma.sql`
    SELECT 'actividad' AS tipo, a.id, a.nombre, a.lugar, a."fechaInicio"
    FROM "Actividad" a
    WHERE
      similarity(unaccent(lower(a.nombre)), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
      OR similarity(unaccent(lower(coalesce(a.descripcion, ''))), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
      OR similarity(unaccent(lower(coalesce(a.lugar, ''))), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
    ORDER BY
      (lower(a.nombre) = lower(${q})) DESC,
      similarity(unaccent(lower(a.nombre)), unaccent(lower(${q}))) DESC
    LIMIT ${LIMITE_POR_ENTIDAD}
  `);
}

async function buscarPadronEntradas(q: string): Promise<ResultadoBusquedaPadronEntrada[]> {
  return prisma.$queryRaw<ResultadoBusquedaPadronEntrada[]>(Prisma.sql`
    SELECT 'padron_entrada' AS tipo, pe.id, pe."nombreCompletoOriginal", pe.dni, pe."padronElectoralId"
    FROM "PadronEntrada" pe
    WHERE
      similarity(unaccent(lower(pe."nombreCompletoOriginal")), unaccent(lower(${q}))) > ${UMBRAL_SIMILITUD}
      OR pe.dni ILIKE ${"%" + q + "%"}
    ORDER BY
      (pe.dni = ${q}) DESC,
      similarity(unaccent(lower(pe."nombreCompletoOriginal")), unaccent(lower(${q}))) DESC
    LIMIT ${LIMITE_POR_ENTIDAD}
  `);
}

// Respeta permisos como cualquier otra vista (/12-buscador-global.md sección
// 7) — nunca una vía alternativa para sortear restricciones de acceso. El
// punteo queda deliberadamente fuera: no hay función buscarPunteo() acá.
export async function buscarGlobal(
  query: string,
  permisos: PermisosBusqueda,
): Promise<ResultadosBusquedaGlobal> {
  const q = query.trim();
  if (q.length < 2) {
    return { personas: [], actividades: [], padronEntradas: [] };
  }

  const [personas, actividades, padronEntradas] = await Promise.all([
    permisos.puedeVerPersonas ? buscarPersonas(q) : Promise.resolve([]),
    permisos.puedeVerActividades ? buscarActividades(q) : Promise.resolve([]),
    permisos.puedeVerPadron ? buscarPadronEntradas(q) : Promise.resolve([]),
  ]);

  return { personas, actividades, padronEntradas };
}
