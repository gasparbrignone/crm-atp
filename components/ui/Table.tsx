import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Componente base del design system — ver /19-ux-ui.md sección 7.
// Primitiva de tabla reutilizada en todos los listados (Personas, Actividades,
// Usuarios, etc.). Paginación y ordenamiento por columna se implementan por
// módulo, sobre esta base, cuando cada listado los necesite (ver /04-modelo-datos.md
// sección 17 y /19-ux-ui.md sección 11 — paginación obligatoria en listados largos).

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-borde border border-borde">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-borde/30 text-left">{children}</thead>;
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
        "hover:bg-borde/20",
        onClick && "cursor-pointer",
        selected && "bg-primario/10",
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
      className={cn("px-4 py-3 font-semibold text-texto-secundario whitespace-nowrap", className)}
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
  return <td className={cn("px-4 py-3 text-texto", className)}>{children}</td>;
}

export function TableEmptyState({ children }: { children: ReactNode }) {
  return (
    <tr>
      <td colSpan={999} className="px-4 py-10 text-center text-texto-secundario">
        {children}
      </td>
    </tr>
  );
}
