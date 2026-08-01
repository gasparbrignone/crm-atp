-- Políticas de Row Level Security (RLS) — Fase 0.
--
-- Ver /16-seguridad.md sección 3 y 4: RLS es la segunda capa de autorización
-- (defensa en profundidad), nunca la única — la capa de servicios en
-- lib/servicios/* valida permisos primero. El roadmap (/20-roadmap.md, riesgo
-- de la Fase 0) pide dejar como mínimo las políticas de Persona y
-- PunteoPersona definidas desde esta fase; se agrega también PunteoComentario
-- por ser la misma superficie de dato sensible (doc 16 sección 4 ya define su
-- política, y depende directamente de PunteoPersona).
--
-- El resto de las políticas de la tabla de la sección 4 de /16-seguridad.md
-- (Actividad, Participacion, PadronElectoral, PadronEntrada, HistorialCambio,
-- ConfiguracionSistema) se agregan en sus fases correspondientes del roadmap
-- (Fase 2, 5, 6, 12), no acá, para no adelantar RLS sobre tablas cuyo módulo
-- todavía no está implementado.
--
-- CÓMO APLICAR (ya aplicado una vez en desarrollo — dejar como referencia para
-- otros entornos, ej. producción cuando se cree ese proyecto de Supabase):
--   1. npx prisma migrate dev --name init                        (migración base desde schema.prisma)
--   2. npx prisma migrate dev --create-only --name rls_persona_punteo
--   3. Pegar el contenido de este archivo en la migración recién creada
--      (prisma/migrations/<timestamp>_rls_persona_punteo/migration.sql)
--   4. npx prisma migrate deploy   (⚠️ no usar `migrate dev` acá: la base de
--      sombra que usa `migrate dev` para validar drift es un Postgres vacío
--      sin el schema `auth` de Supabase, y auth.uid() falla con "schema auth
--      does not exist". `migrate deploy` aplica directo contra la base real,
--      sin ese paso de validación, y es seguro para SQL específico de Supabase.)
--
-- Nota: usuarioId/id son de tipo TEXT en las tablas (no uuid nativo de
-- Postgres), por eso todas las comparaciones contra auth.uid() castean con
-- ::text.

ALTER TABLE "Persona" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PunteoPersona" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PunteoComentario" ENABLE ROW LEVEL SECURITY;

-- Función helper: ¿el usuario autenticado (auth.uid()) tiene el permiso dado,
-- según su Rol y la matriz RolPermiso? SECURITY DEFINER para poder leer
-- Usuario/Rol/RolPermiso/Permiso independientemente de las policies de esas
-- tablas (evita recursión de RLS al evaluar permisos).
CREATE OR REPLACE FUNCTION usuario_tiene_permiso(codigo_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Usuario" u
    JOIN "RolPermiso" rp ON rp."rolId" = u."rolId"
    JOIN "Permiso" p ON p.id = rp."permisoId"
    WHERE u.id = auth.uid()::text
      AND p.codigo = codigo_permiso
  );
$$;

-- ── Persona ─────────────────────────────────────────────────────────────
-- Lectura para cualquier usuario autenticado con personas.ver; escritura
-- restringida a personas.crear / personas.editar (ver /16-seguridad.md
-- sección 4). El archivado usa personas.archivar, validado en la capa de
-- servicios (no hay policy de DELETE: el modelo no admite borrado físico).

CREATE POLICY persona_select ON "Persona"
  FOR SELECT
  USING (usuario_tiene_permiso('personas.ver'));

CREATE POLICY persona_insert ON "Persona"
  FOR INSERT
  WITH CHECK (usuario_tiene_permiso('personas.crear'));

CREATE POLICY persona_update ON "Persona"
  FOR UPDATE
  USING (usuario_tiene_permiso('personas.editar') OR usuario_tiene_permiso('personas.archivar'))
  WITH CHECK (usuario_tiene_permiso('personas.editar') OR usuario_tiene_permiso('personas.archivar'));

-- ── PunteoPersona ───────────────────────────────────────────────────────
-- Un usuario solo puede ver/crear/editar sus propios registros de punteo,
-- salvo que tenga el permiso punteo.ver_todos (RBAC ampliado explícitamente).

CREATE POLICY punteo_persona_select ON "PunteoPersona"
  FOR SELECT
  USING (
    "usuarioId" = auth.uid()::text
    OR usuario_tiene_permiso('punteo.ver_todos')
  );

CREATE POLICY punteo_persona_insert ON "PunteoPersona"
  FOR INSERT
  WITH CHECK ("usuarioId" = auth.uid()::text);

CREATE POLICY punteo_persona_update ON "PunteoPersona"
  FOR UPDATE
  USING ("usuarioId" = auth.uid()::text OR usuario_tiene_permiso('punteo.ver_todos'))
  WITH CHECK ("usuarioId" = auth.uid()::text OR usuario_tiene_permiso('punteo.ver_todos'));

-- ── PunteoComentario ────────────────────────────────────────────────────
-- Mismo criterio que PunteoPersona, evaluado a través de punteoPersonaId.
-- Sin policy de UPDATE/DELETE: los comentarios son inmutables (RN-5, ver
-- /04-modelo-datos.md sección 18). La eliminación excepcional por error
-- grave (reservada a Administrador) se ejecuta desde la capa de servicios
-- con la service role key, que bypassa RLS — nunca desde el cliente.

CREATE POLICY punteo_comentario_select ON "PunteoComentario"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "PunteoPersona" pp
      WHERE pp.id = "PunteoComentario"."punteoPersonaId"
        AND (pp."usuarioId" = auth.uid()::text OR usuario_tiene_permiso('punteo.ver_todos'))
    )
  );

CREATE POLICY punteo_comentario_insert ON "PunteoComentario"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "PunteoPersona" pp
      WHERE pp.id = "PunteoComentario"."punteoPersonaId"
        AND pp."usuarioId" = auth.uid()::text
    )
  );
