-- Fase 11 (Notificaciones): preferencias de resumen por email por usuario
-- (/13-notificaciones.md sección 5) y clave de disparador en Notificacion
-- para idempotencia (/13-notificaciones.md sección 7).

CREATE TYPE "FrecuenciaDigestEmail" AS ENUM ('diario', 'semanal');

ALTER TABLE "Usuario" ADD COLUMN "recibirDigestEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN "frecuenciaDigestEmail" "FrecuenciaDigestEmail" NOT NULL DEFAULT 'diario';
ALTER TABLE "Usuario" ADD COLUMN "fechaUltimoDigestEmail" TIMESTAMP(3);

ALTER TABLE "Notificacion" ADD COLUMN "disparador" TEXT;

CREATE INDEX "Notificacion_disparador_entidadRelacionadaId_usuarioId_idx"
  ON "Notificacion" ("disparador", "entidadRelacionadaId", "usuarioId");
