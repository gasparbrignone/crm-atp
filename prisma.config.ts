
// Carga variables desde .env.local (convención Next.js) para que `prisma migrate`,
// `prisma studio`, etc. usen las mismas credenciales que la app en desarrollo.
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
