-- Guarda los candidatos sugeridos por la IA para una PadronEntrada
-- "pendiente" (/09-modulo-padron-electoral.md sección 6: confirmar/rechazar
-- de un clic requiere mostrar la ficha candidata, no solo el motivo).
ALTER TABLE "PadronEntrada" ADD COLUMN "candidatosSugeridos" TEXT;
