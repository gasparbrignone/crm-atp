-- Fix de bug real pre-existente: listarCatalogo("etiqueta") en
-- lib/servicios/configuracion.service.ts asume que los 4 catálogos
-- editables (Carrera, TipoActividad, Etiqueta, ClasificacionPunteo)
-- comparten forma, incluido "orden" — Etiqueta nunca tuvo esa columna,
-- así que /configuracion?tab=etiqueta tira un error de Prisma en cada
-- visita ("Unknown argument `orden`"), encontrado al retomar el trabajo
-- de etiquetado de Personas (05-modulo-personas.md sección 7).
ALTER TABLE "Etiqueta" ADD COLUMN "orden" INTEGER;
