import type { NextRequest } from "next/server";
import {
  generarRecordatoriosPunteoInactivo,
  generarAvisosCupoActividadesProximas,
} from "@/lib/servicios/notificaciones.service";
import { enviarDigestsEmailPendientes } from "@/lib/servicios/digest-email.service";

// Único cron diario del proyecto — Vercel Hobby no permite más de una
// ejecución por día por cron job (ver CLAUDE.md sección 10), así que todos
// los disparadores "proactivos" del catálogo (/13-notificaciones.md sección
// 3) que no nacen de un evento puntual se evalúan juntos acá, configurado en
// vercel.json. Autenticado con CRON_SECRET siguiendo la convención propia de
// Vercel (ver /16-seguridad.md sección 8: ningún secreto en el repo, se
// compara contra la variable de entorno).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Cada paso es independiente: que uno falle (ej. un error inesperado
  // generando avisos de punteo) no debe impedir que el resto corra, mismo
  // principio que el resto de las funciones de notificaciones.service.ts.
  const resultados = { punteo: "ok", cupoActividades: "ok", digestEmail: "ok" } as Record<
    string,
    string
  >;

  try {
    await generarRecordatoriosPunteoInactivo();
  } catch (error) {
    console.error("[cron] falló generarRecordatoriosPunteoInactivo:", error);
    resultados.punteo = "error";
  }

  try {
    await generarAvisosCupoActividadesProximas();
  } catch (error) {
    console.error("[cron] falló generarAvisosCupoActividadesProximas:", error);
    resultados.cupoActividades = "error";
  }

  try {
    await enviarDigestsEmailPendientes();
  } catch (error) {
    console.error("[cron] falló enviarDigestsEmailPendientes:", error);
    resultados.digestEmail = "error";
  }

  return Response.json({ ok: true, resultados });
}
