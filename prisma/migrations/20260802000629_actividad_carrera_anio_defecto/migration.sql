-- Carrera/año por defecto de una Actividad (opcionales) — toda Persona que
-- se inscriba a esta actividad recibe este valor solo si no tiene uno
-- cargado ya (pedido de Gaspar, 2026-08-01).
ALTER TABLE "Actividad" ADD COLUMN "carreraPorDefectoId" TEXT;
ALTER TABLE "Actividad" ADD COLUMN "anioPorDefecto" INTEGER;

ALTER TABLE "Actividad"
  ADD CONSTRAINT "Actividad_carreraPorDefectoId_fkey"
  FOREIGN KEY ("carreraPorDefectoId") REFERENCES "Carrera"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
