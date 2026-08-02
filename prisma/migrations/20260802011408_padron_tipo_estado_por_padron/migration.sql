-- ATP puede tener Consejo Directivo (CD) y Centro de Estudiantes (CE) activos
-- a la vez: dos padrones oficiales distintos, CD más restrictivo (subconjunto
-- de CE). "Un único activo" pasa a ser por tipo, no global (RN-8 ajustada).
-- Ver CLAUDE.md sección "TAREA EN CURSO" (2026-08-01).

-- CreateEnum
CREATE TYPE "TipoPadronElectoral" AS ENUM ('consejo_directivo', 'centro_estudiantes');

-- AlterTable: PadronElectoral gana "tipo"
-- No hay padrones cargados en producción todavía (confirmado antes de esta
-- migración), así que no hace falta backfill: se agrega NOT NULL directo con
-- un default temporal solo para permitir el ALTER, y se lo saca después.
ALTER TABLE "PadronElectoral" ADD COLUMN "tipo" "TipoPadronElectoral" NOT NULL DEFAULT 'consejo_directivo';
ALTER TABLE "PadronElectoral" ALTER COLUMN "tipo" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "PadronElectoral_tipo_estado_idx" ON "PadronElectoral"("tipo", "estado");

-- AlterTable: Persona.estadoPadron (único) se reemplaza por dos campos
-- independientes, uno por tipo de padrón. Tampoco hay Personas con estado
-- distinto de "no_evaluado" en producción (confirmado antes de esta
-- migración), así que no hace falta preservar valores existentes.
ALTER TABLE "Persona" ADD COLUMN "estadoPadronCD" "EstadoPadronPersona" NOT NULL DEFAULT 'no_evaluado';
ALTER TABLE "Persona" ADD COLUMN "estadoPadronCE" "EstadoPadronPersona" NOT NULL DEFAULT 'no_evaluado';

DROP INDEX IF EXISTS "Persona_carreraId_anio_estadoPadron_idx";
ALTER TABLE "Persona" DROP COLUMN "estadoPadron";

-- CreateIndex
CREATE INDEX "Persona_carreraId_anio_estadoPadronCD_idx" ON "Persona"("carreraId", "anio", "estadoPadronCD");
CREATE INDEX "Persona_carreraId_anio_estadoPadronCE_idx" ON "Persona"("carreraId", "anio", "estadoPadronCE");
