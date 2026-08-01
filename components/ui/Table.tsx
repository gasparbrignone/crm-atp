import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Componente base del design system — ver /19-ux-ui.md sección 7.
// Primitiva de tabla reutilizada en todos los listados (Personas, Actividades,
// Usuarios, etc.). Paginación y ordenamiento por columna se implementan por
// módulo, sobre esta base, cuando cada listado los necesite (ver /04-modelo-datos.md
// sección 17 y /19-ux-ui.md sección 11 — paginación obligatoria en listados largos).

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-borde border border-borde bg-fondo-superficie shadow-tarjeta">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-borde bg-fondo-hover/60 text-left">{children}</thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-borde">{children}</tbody>;
}

export function TableRow({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors hover:bg-fondo-hover",
        onClick && "cursor-pointer",
        selected && "bg-primario/5",
      )}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-secundario whitespace-nowrap",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3.5 text-texto", className)}>{children}</td>;
}

export function TableEmptyState({ children }: { children: ReactNode }) {
  return (
    <tr>
      <td colSpan={999} className="px-4 py-14 text-center text-texto-secundario">
        {children}
      </td>
    </tr>
  );
}
