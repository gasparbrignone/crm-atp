-- CreateTable
CREATE TABLE "PersonaToken" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "esApellido" BOOLEAN NOT NULL,

    CONSTRAINT "PersonaToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonaToken_token_idx" ON "PersonaToken"("token");

-- CreateIndex
CREATE INDEX "PersonaToken_personaId_idx" ON "PersonaToken"("personaId");

-- AddForeignKey
ALTER TABLE "PersonaToken" ADD CONSTRAINT "PersonaToken_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice de trigramas — preselección barata de variantes de tipeo por
-- similitud antes de filtrar por distancia de edición absoluta en la
-- aplicación (ver PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
-- sección 4). pg_trgm ya está instalado (migración
-- 20260802190000_buscador_trgm_unaccent), no hace falta CREATE EXTENSION de nuevo.
CREATE INDEX IF NOT EXISTS idx_personatoken_token_trgm ON "PersonaToken" USING gin ("token" gin_trgm_ops);

