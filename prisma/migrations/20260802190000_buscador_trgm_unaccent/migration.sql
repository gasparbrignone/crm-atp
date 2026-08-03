-- Buscador global — /12-buscador-global.md sección 4 (estrategia técnica).
-- pg_trgm habilita búsqueda difusa tolerante a errores de tipeo (similaridad
-- de trigramas); unaccent permite ignorar tildes de forma consistente. Los
-- índices GIN con gin_trgm_ops no tienen representación en schema.prisma
-- (mismo criterio que las políticas RLS de la migración
-- 20260801011008_rls_persona_punteo: esta migración de SQL crudo es la
-- fuente de verdad para estos índices, no el schema).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Persona — /12-buscador-global.md sección 2: nombre, apellido, DNI, legajo,
-- Instagram, observaciones generales.
CREATE INDEX IF NOT EXISTS idx_persona_nombre_trgm ON "Persona" USING gin ("nombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persona_apellido_trgm ON "Persona" USING gin ("apellido" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persona_dni_trgm ON "Persona" USING gin ("dni" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persona_legajo_trgm ON "Persona" USING gin ("legajo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persona_instagram_trgm ON "Persona" USING gin ("instagram" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persona_observaciones_trgm ON "Persona" USING gin ("observacionesGenerales" gin_trgm_ops);

-- Teléfonos y emails de Persona.
CREATE INDEX IF NOT EXISTS idx_personatelefono_numero_trgm ON "PersonaTelefono" USING gin ("numero" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_personaemail_email_trgm ON "PersonaEmail" USING gin ("email" gin_trgm_ops);

-- Nombre de etiquetas asociadas (se busca por el nombre de la Etiqueta).
CREATE INDEX IF NOT EXISTS idx_etiqueta_nombre_trgm ON "Etiqueta" USING gin ("nombre" gin_trgm_ops);

-- Actividad — nombre, descripción, lugar.
CREATE INDEX IF NOT EXISTS idx_actividad_nombre_trgm ON "Actividad" USING gin ("nombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actividad_descripcion_trgm ON "Actividad" USING gin ("descripcion" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actividad_lugar_trgm ON "Actividad" USING gin ("lugar" gin_trgm_ops);

-- PadronEntrada — solo visible con permiso padron.ver (filtrado en la capa
-- de servicios, /12-buscador-global.md sección 7).
CREATE INDEX IF NOT EXISTS idx_padronentrada_dni_trgm ON "PadronEntrada" USING gin ("dni" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_padronentrada_nombre_trgm ON "PadronEntrada" USING gin ("nombreCompletoOriginal" gin_trgm_ops);
