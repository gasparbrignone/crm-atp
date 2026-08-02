-- Progreso de importación de PDF por lotes (ver PadronElectoral en schema.prisma)
ALTER TABLE "PadronElectoral" ADD COLUMN "lotesTotales" INTEGER;
ALTER TABLE "PadronElectoral" ADD COLUMN "lotesProcesados" INTEGER NOT NULL DEFAULT 0;
