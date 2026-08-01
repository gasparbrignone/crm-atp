/**
 * Crea el usuario semilla con rol Administrador — criterio de aceptación de
 * Fase 0 en /20-roadmap.md sección 3: "Un usuario semilla con rol
 * Administrador puede iniciar sesión".
 *
 * Crea el usuario en Supabase Auth (con la service role key, que puede
 * saltear confirmación de email para este alta puntual) y la fila
 * correspondiente en la tabla Usuario, con el mismo id (ver /04-modelo-datos.md
 * sección 8.1 — Usuario.id es el mismo id que gestiona Supabase Auth).
 *
 * Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Correr después de aplicar la migración (npm run prisma:migrate) y el seed
 * de roles/permisos (npm run prisma:seed).
 *
 * Uso: npm run crear-admin -- --email admin@atp.org --password "unaClaveDe10+" --nombre Ada --apellido Lovelace
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}`;
  const args = process.argv.slice(2);
  const idx = args.indexOf(prefijo);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const email = leerArgumento("email");
  const password = leerArgumento("password");
  const nombre = leerArgumento("nombre") ?? "Admin";
  const apellido = leerArgumento("apellido") ?? "ATP";

  if (!email || !password) {
    console.error(
      'Uso: npm run crear-admin -- --email admin@atp.org --password "unaClaveDe10+" [--nombre Ada] [--apellido Lovelace]',
    );
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("La contraseña debe tener al menos 10 caracteres (ver /16-seguridad.md sección 2).");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local.",
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient();

  try {
    const rolAdministrador = await prisma.rol.findUnique({
      where: { nombre: "Administrador" },
    });
    if (!rolAdministrador) {
      console.error(
        'No se encontró el rol "Administrador". Corré primero: npm run prisma:seed',
      );
      process.exit(1);
    }

    console.log(`Creando usuario en Supabase Auth (${email})...`);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Error creando el usuario en Supabase Auth:", error?.message);
      process.exit(1);
    }

    console.log("Creando fila en la tabla Usuario con rol Administrador...");
    await prisma.usuario.create({
      data: {
        id: data.user.id,
        nombre,
        apellido,
        email,
        rolId: rolAdministrador.id,
      },
    });

    console.log(`Listo. ${email} puede iniciar sesión como Administrador.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
