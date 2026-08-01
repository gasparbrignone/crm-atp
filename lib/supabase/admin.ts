import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service role key — bypassa RLS. Uso exclusivo desde el
// servidor, después de que la capa de servicios ya validó el permiso
// correspondiente (ver /16-seguridad.md sección 8). Nunca importar desde un
// Client Component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
