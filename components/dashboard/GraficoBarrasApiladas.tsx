"use client";

import { useState } from "react";

export interface GrupoBarraApilada {
  etiqueta: string;
  segmentos: { etiqueta: string; valor: number }[];
}

const PALETA = [
  "var(--color-chart-serie-1)",
  "var(--color-chart-serie-2)",
  "var(--color-chart-serie-3)",
  "var(--color-chart-serie-4)",
];

// Barras apiladas (distribución de personas por carrera y año) — un color
// por año (segmento), separación de 2px entre segmentos apilados y entre
// barras contiguas, ver skill de dataviz (marks-and-anatomy § spacers).
export function GraficoBarrasApiladas({
  grupos,
  alto = 220,
}: {
  grupos: GrupoBarraApilada[];
  alto?: number;
}) {
  const [hover, setHover] = useState<{ grupo: number; segmento: number } | null>(null);

  if (grupos.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-texto-secundario">
        Sin datos para mostrar.
      </div>
    );
  }

  const totales = grupos.map((g) => g.segmentos.reduce((acc, s) => acc + s.valor, 0));
  const maximo = Math.max(...totales, 1);
  const anchoGrupo = 100 / grupos.length;
  const margenInferior = 24;

  // Etiquetas de segmento consistentes en orden a través de todos los grupos,
  // para que el color de cada año sea el mismo en cada barra.
  const etiquetasSegmento = Array.from(
    new Set(grupos.flatMap((g) => g.segmentos.map((s) => s.etiqueta))),
  ).sort();

  return (
    <div className="relative w-full" style={{ height: alto }}>
      <svg
        viewBox={`0 0 100 ${alto}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Gráfico de barras apiladas"
      >
        <line
          x1={0}
          x2={100}
          y1={alto - margenInferior}
          y2={alto - margenInferior}
          stroke="var(--color-chart-eje)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {grupos.map((grupo, gi) => {
          const x = gi * anchoGrupo + anchoGrupo * 0.15;
          const anchoBarra = anchoGrupo * 0.7;
          let yAcumulada = alto - margenInferior;
          return (
            <g key={grupo.etiqueta}>
              {etiquetasSegmento.map((etiquetaSeg, si) => {
                const segmento = grupo.segmentos.find((s) => s.etiqueta === etiquetaSeg);
                if (!segmento || segmento.valor === 0) return null;
                const alturaSegmento = (segmento.valor / maximo) * (alto - margenInferior - 16);
                const y = yAcumulada - alturaSegmento;
                yAcumulada = y;
                const estaActivo =
                  hover === null || (hover.grupo === gi && hover.segmento === si);
                return (
                  <rect
                    key={etiquetaSeg}
                    x={x}
                    y={y}
                    width={anchoBarra}
                    height={Math.max(alturaSegmento - 0.5, 0.5)}
                    fill={PALETA[si % PALETA.length]}
                    opacity={estaActivo ? 1 : 0.4}
                    onMouseEnter={() => setHover({ grupo: gi, segmento: si })}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-texto-secundario">
        {grupos.map((g) => (
          <div key={g.etiqueta} className="flex-1 truncate text-center">
            {g.etiqueta}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-texto-secundario">
        {etiquetasSegmento.map((etiqueta, i) => (
          <div key={etiqueta} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PALETA[i % PALETA.length] }}
            />
            {etiqueta}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-borde-chico border border-borde bg-fondo-superficie px-2.5 py-1.5 text-xs whitespace-nowrap shadow-flotante"
          style={{ left: `${(hover.grupo + 0.5) * anchoGrupo}%` }}
        >
          <p className="font-semibold text-texto">{grupos[hover.grupo].etiqueta}</p>
          <p className="text-texto-secundario">
            Año {etiquetasSegmento[hover.segmento]}:{" "}
            {grupos[hover.grupo].segmentos.find((s) => s.etiqueta === etiquetasSegmento[hover.segmento])
              ?.valor ?? 0}
          </p>
        </div>
      )}
    </div>
  );
}
