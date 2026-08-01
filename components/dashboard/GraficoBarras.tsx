"use client";

import { useId, useState } from "react";

export interface ItemGraficoBarras {
  etiqueta: string;
  valor: number;
  color?: string;
}

const PALETA_DEFAULT = [
  "var(--color-chart-serie-1)",
  "var(--color-chart-serie-2)",
  "var(--color-chart-serie-3)",
  "var(--color-chart-serie-4)",
];

// Gráfico de barras genérico (magnitud comparada entre categorías) — marcas
// finas, extremos redondeados anclados a la línea de base, separación entre
// barras, tooltip al pasar el mouse. Ver skill de dataviz (marks-and-anatomy
// e interaction).
export function GraficoBarras({
  items,
  alto = 220,
  formatoValor = (v: number) => String(v),
}: {
  items: ItemGraficoBarras[];
  alto?: number;
  formatoValor?: (valor: number) => string;
}) {
  const idBase = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-texto-secundario">
        Sin datos para este período.
      </div>
    );
  }

  const maximo = Math.max(...items.map((i) => i.valor), 1);
  const anchoBarra = 100 / items.length;

  return (
    <div className="relative w-full" style={{ height: alto }}>
      <svg
        viewBox={`0 0 100 ${alto}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Gráfico de barras"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={100}
            y1={alto - 24 - f * (alto - 40)}
            y2={alto - 24 - f * (alto - 40)}
            stroke="var(--color-chart-grilla)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={0}
          x2={100}
          y1={alto - 24}
          y2={alto - 24}
          stroke="var(--color-chart-eje)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {items.map((item, i) => {
          const alturaBarra = (item.valor / maximo) * (alto - 40);
          const x = i * anchoBarra + anchoBarra * 0.15;
          const anchoReal = anchoBarra * 0.7;
          const y = alto - 24 - alturaBarra;
          const color = item.color || PALETA_DEFAULT[i % PALETA_DEFAULT.length];
          return (
            <g key={`${idBase}-${item.etiqueta}`}>
              <rect
                x={x}
                y={y}
                width={anchoReal}
                height={Math.max(alturaBarra, 1)}
                rx={2}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-texto-secundario">
        {items.map((item, i) => (
          <div
            key={item.etiqueta}
            className="flex-1 truncate text-center"
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            {item.etiqueta}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-borde-chico border border-borde bg-fondo-superficie px-2.5 py-1.5 text-xs whitespace-nowrap shadow-flotante"
          style={{ left: `${(hover + 0.5) * anchoBarra}%` }}
        >
          <p className="font-semibold text-texto">{items[hover].etiqueta}</p>
          <p className="text-texto-secundario">{formatoValor(items[hover].valor)}</p>
        </div>
      )}
    </div>
  );
}
