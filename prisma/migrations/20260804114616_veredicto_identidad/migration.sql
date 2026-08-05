-- VeredictoIdentidad — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.9.
-- Tabla nueva, aditiva, sin impacto sobre datos existentes.

CREATE TYPE "VeredictoDecision" AS ENUM ('misma_persona', 'distinta_persona');

CREATE TABLE "VeredictoIdentidad" (
    "id" TEXT NOT NULL,
    "nombreObjetivo" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "confianza" DECIMAL(4,3) NOT NULL,
    "explicacion" TEXT NOT NULL,
    "decision" "VeredictoDecision" NOT NULL,
    "contexto" TEXT NOT NULL,
    "usuarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VeredictoIdentidad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VeredictoIdentidad_contexto_fecha_idx" ON "VeredictoIdentidad"("contexto", "fecha");
CREATE INDEX "VeredictoIdentidad_candidatoId_idx" ON "VeredictoIdentidad"("candidatoId");

ALTER TABLE "VeredictoIdentidad" ADD CONSTRAINT "VeredictoIdentidad_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
