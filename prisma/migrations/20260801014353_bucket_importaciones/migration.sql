-- Bucket privado de Supabase Storage para los archivos originales de
-- importación (CSV, Excel, PDF) — ver /14-importaciones-exportaciones.md
-- (RN: "el archivo original de cualquier importación se conserva en Supabase
-- Storage") y /16-seguridad.md sección 7 (buckets de acceso privado, nunca
-- públicos, accedidos solo con URLs firmadas generadas por el servidor).
--
-- Aplicar con: npx prisma migrate deploy (no usar `migrate dev`, mismo
-- motivo que 0001: la base de sombra no tiene el schema `storage` de Supabase).

INSERT INTO storage.buckets (id, name, public)
VALUES ('importaciones', 'importaciones', false)
ON CONFLICT (id) DO NOTHING;
