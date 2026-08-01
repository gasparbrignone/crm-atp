import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Contenedor de tarjeta — genera la separación fondo de página / superficie
// que le da profundidad al sistema visual (ver /19-ux-ui.md sección 2).
export function Card({
  children,
  className,
  padding = "normal",
}: {
  children: ReactNode;
  className?: string;
  padding?: "normal" | "chico" | "ninguno";
}) {
  return (
    <div
      className={cn(
        "rounded-borde border border-borde bg-fondo-superficie shadow-tarjeta",
        padding === "normal" && "p-5",
        padding === "chico" && "p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
