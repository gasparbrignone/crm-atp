"use client";

import { useState } from "react";

export interface PuntoGraficoLinea {
  etiqueta: string;
  valor: number;
}

// Gráfico de línea de una sola serie (cambio en el tiempo) — sin leyenda
// (una sola serie la identifica el título de la sección), con crosshair y
// tooltip al pasar el mouse. Ver skill de dataviz (choosing-a-form § "single
// series" e interaction § crosshair+tooltip).
export function GraficoLinea({
  puntos,
  alto = 200,
  formatoValor = (v: number) => String(v),
}: {
  puntos: PuntoGraficoLinea[];
  alto?: number;
  formatoValor?: (valor: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (puntos.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-texto-secundario">
        Sin datos para este período.
      </div>
    );
  }

  const margenInferior = 24;
  const maximo = Math.max(...puntos.map((p) => p.valor), 1);
  const pasoX = puntos.length > 1 ? 100 / (puntos.length - 1) : 0;

  const coordenadas = puntos.map((p, i) => ({
    x: puntos.length > 1 ? i * pasoX : 50,
    y: alto - margenInferior - (p.valor / maximo) * (alto - margenInferior - 16),
  }));

  const lineaPath = coordenadas.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${lineaPath} L ${coordenadas[coordenadas.length - 1].x} ${alto - margenInferior} L ${coordenadas[0].x} ${alto - margenInferior} Z`;

  return (
    <div className="relative w-full" style={{ height: alto }}>
      <svg
        viewBox={`0 0 100 ${alto}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Gráfico de línea"
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
        {puntos.length > 1 && (
          <>
            <path d={areaPath} fill="var(--color-chart-serie-1)" opacity={0.12} />
            <path
              d={lineaPath}
              fill="none"
              stroke="var(--color-chart-serie-1)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {puntos.length === 1 && (
          <circle cx={coordenadas[0].x} cy={coordenadas[0].y} r={3} fill="var(--color-chart-serie-1)" />
        )}
        {hover !== null && (
          <line
            x1={coordenadas[hover].x}
            x2={coordenadas[hover].x}
            y1={0}
            y2={alto - margenInferior}
            stroke="var(--color-chart-eje)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {coordenadas.map((c, i) => (
          <circle
            key={puntos[i].etiqueta}
            cx={c.x}
            cy={c.y}
            r={hover === i ? 3 : 0}
            fill="var(--color-chart-serie-1)"
          />
        ))}
        {/* Área invisible de hit-testing por punto, más ancha que la marca */}
        {coordenadas.map((c, i) => (
          <rect
            key={`hit-${puntos[i].etiqueta}`}
            x={Math.max(0, c.x - pasoX / 2)}
            y={0}
            width={puntos.length > 1 ? pasoX : 100}
            height={alto}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div className="mt-1 flex text-[10px] text-texto-secundario">
        {puntos.map((p, i) => (
          <div
            key={p.etiqueta}
            className="flex-1 truncate text-center"
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            {p.etiqueta}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-borde-chico border border-borde bg-fondo-superficie px-2.5 py-1.5 text-xs whitespace-nowrap shadow-flotante"
          style={{ left: `${coordenadas[hover].x}%` }}
        >
          <p className="font-semibold text-texto">{puntos[hover].etiqueta}</p>
          <p className="text-texto-secundario">{formatoValor(puntos[hover].valor)}</p>
        </div>
      )}
    </div>
  );
}
