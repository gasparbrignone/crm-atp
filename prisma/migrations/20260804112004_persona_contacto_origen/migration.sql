-- Origen y fecha de creación de PersonaTelefono/PersonaEmail —
-- PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.3. Aditiva, sin
-- afectar datos existentes: origen queda NULL en registros preexistentes
-- (dato desconocido, no se inventa un origen que no se puede afirmar).

CREATE TYPE "OrigenDato" AS ENUM ('alta_manual', 'importacion_csv', 'importacion_actividad', 'padron', 'editado_manual');

ALTER TABLE "PersonaTelefono" ADD COLUMN "origen" "OrigenDato";
ALTER TABLE "PersonaTelefono" ADD COLUMN "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "PersonaEmail" ADD COLUMN "origen" "OrigenDato";
ALTER TABLE "PersonaEmail" ADD COLUMN "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
