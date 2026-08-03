const RTF = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function tiempoRelativo(fecha: Date): string {
  const segundos = (fecha.getTime() - Date.now()) / 1000;
  for (const [unidad, segundosPorUnidad] of UNIDADES) {
    if (Math.abs(segundos) >= segundosPorUnidad) {
      return RTF.format(Math.round(segundos / segundosPorUnidad), unidad);
    }
  }
  return RTF.format(Math.round(segundos), "second");
}
