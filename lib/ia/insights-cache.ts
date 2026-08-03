import { unstable_cache } from "next/cache";
import { generarInsightsDashboard, type AgregadosParaInsights } from "@/lib/ia/insights";

// Cachea la llamada a la IA por 5 minutos — /11-dashboards.md sección 6:
// "minutos, no horas, para no mostrar datos desactualizados". Evita gastar
// la cuota de Gemini (compartida con todo lib/ia/, /15-ia.md sección 8) en
// cada carga de pantalla del dashboard admin, que puede recargarse varias
// veces por minuto. Next.js incluye los argumentos serializados de la
// llamada en la clave de caché, así que un cambio real en los agregados
// (otro rango/filtro, o datos nuevos tras 5 minutos) sí genera un insight
// nuevo.
export const obtenerInsightsDashboardCacheados = unstable_cache(
  async (agregados: AgregadosParaInsights) => generarInsightsDashboard(agregados),
  ["insights-dashboard-admin"],
  { revalidate: 300 },
);
