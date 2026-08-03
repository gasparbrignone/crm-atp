import {
  obtenerClienteIA,
  MODELO_IA_LIVIANO,
  SIN_PENSAMIENTO,
  generarConReintentos,
} from "@/lib/ia/cliente-ia";

// Insights narrados del dashboard admin — /15-ia.md sección 6. Se envían
// solo agregados ya calculados (los mismos números que ya se muestran en los
// gráficos), nunca registros individuales de Personas — minimización de
// datos, /16-seguridad.md.

export type SeccionInsight =
  | "evolucion"
  | "participacionPorTipo"
  | "distribucionCarrera"
  | "rankingActividades"
  | "coberturaPunteo"
  | "distribucionClasificacion";

export interface Insight {
  texto: string;
  seccion: SeccionInsight | null;
}

export interface AgregadosParaInsights {
  rango: string;
  kpis: {
    personasActivas: { valor: number; valorAnterior: number | null };
    personasNuevas: { valor: number; valorAnterior: number | null };
    actividadesFinalizadas: { valor: number; valorAnterior: number | null };
    tasaAsistencia: number | null;
  };
  participacionPorTipo: { nombre: string; cantidad: number }[];
  distribucionCarreraAnio: { carrera: string; anio: number | null; cantidad: number }[];
  rankingActividades: { nombre: string; tasaAsistencia: number }[];
  coberturaPunteo: { personasEnPadron: number; conPunteo: number; cobertura: number | null };
  distribucionClasificacion: { nombre: string; cantidad: number }[];
}

const SECCIONES_VALIDAS: SeccionInsight[] = [
  "evolucion",
  "participacionPorTipo",
  "distribucionCarrera",
  "rankingActividades",
  "coberturaPunteo",
  "distribucionClasificacion",
];

function extraerJsonArray(texto: string): unknown {
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Se pide texto en vez de dejar que la IA decida qué mostrar sin límite —
// dos o tres frases como máximo (/15-ia.md sección 6.2), cada una referida a
// una sección concreta del dashboard para que nunca quede un insight
// "flotante" sin poder verificarlo contra los datos que lo originan.
export async function generarInsightsDashboard(
  agregados: AgregadosParaInsights,
): Promise<Insight[]> {
  const prompt = `Tarea: sos un analista que redacta las dos o tres observaciones más destacables sobre el estado actual de una agrupación estudiantil universitaria (ATP), a partir de datos agregados de su CRM. Nunca opines sobre afiliación política ni clasifiques personas — solo describí patrones estadísticos.

Datos agregados del período "${agregados.rango}":
${JSON.stringify(agregados, null, 2)}

Instrucciones:
- Máximo 3 observaciones, mínimo 1.
- Cada observación: una o dos frases en español, tono directo, sin adornos.
- Priorizá lo que más se destaque (una variación grande, un valor inusualmente bajo o alto, una concentración marcada), no una lista genérica de todos los números.
- Si un dato no tiene suficiente historia para comparar (valorAnterior null) no inventes una tendencia sobre él.
- Cada observación debe indicar a qué sección del dashboard se refiere, usando exactamente uno de estos valores: ${SECCIONES_VALIDAS.join(", ")}, o null si es general.

Respondé ÚNICAMENTE un array JSON con esta forma exacta, sin texto adicional:
[{"texto": "<observación>", "seccion": "<una de las secciones o null>"}]`;

  const cliente = obtenerClienteIA();
  const respuesta = await generarConReintentos(() =>
    cliente.models.generateContent({
      model: MODELO_IA_LIVIANO,
      contents: prompt,
      config: {
        maxOutputTokens: 500,
        responseMimeType: "application/json",
        thinkingConfig: SIN_PENSAMIENTO,
      },
    }),
  );

  const texto = respuesta.text;
  if (!texto) return [];

  const json = extraerJsonArray(texto);
  if (!Array.isArray(json)) return [];

  return json
    .filter(
      (item): item is { texto: string; seccion: string | null } =>
        !!item && typeof item.texto === "string" && item.texto.trim().length > 0,
    )
    .slice(0, 3)
    .map((item) => ({
      texto: item.texto.trim(),
      seccion: SECCIONES_VALIDAS.includes(item.seccion as SeccionInsight)
        ? (item.seccion as SeccionInsight)
        : null,
    }));
}
