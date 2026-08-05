-- CreateEnum
CREATE TYPE "TipoLexicoIdentidad" AS ENUM ('nombre_compuesto', 'particula_apellido');

-- CreateTable
CREATE TABLE "LexicoNombrePropio" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLexicoIdentidad" NOT NULL,
    "valor" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "origen" TEXT NOT NULL DEFAULT 'seed',
    "creadoPorId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexicoNombrePropio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LexicoNombrePropio_tipo_valor_key" ON "LexicoNombrePropio"("tipo", "valor");

-- CreateIndex
CREATE INDEX "LexicoNombrePropio_tipo_activo_idx" ON "LexicoNombrePropio"("tipo", "activo");

-- AddForeignKey
ALTER TABLE "LexicoNombrePropio" ADD CONSTRAINT "LexicoNombrePropio_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
