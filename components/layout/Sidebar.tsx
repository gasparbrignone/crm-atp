"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface EnlaceNav {
  href: string;
  etiqueta: string;
  // JSX ya renderizado (ej. <MdGroup size={18} />), no el componente en sí:
  // pasar el componente-función cruza el límite Server→Client como una
  // función, que RSC no puede serializar. Un elemento ya instanciado sí.
  icono: ReactNode;
}

// Navegación principal — barra lateral en desktop, ver /19-ux-ui.md sección 5.
// La contraparte mobile es BottomNav.tsx (barra inferior).
export function Sidebar({ enlaces }: { enlaces: EnlaceNav[] }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-borde bg-fondo-superficie md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-borde-chico bg-primario text-sm font-bold text-white">
          A
        </span>
        <span className="text-sm font-semibold text-texto">CRM ATP</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {enlaces.map((enlace) => {
          const activo = pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
          return (
            <Link
              key={enlace.href}
              href={enlace.href}
              className={cn(
                "flex items-center gap-3 rounded-borde-chico px-3 py-2.5 text-sm font-medium transition-colors",
                activo
                  ? "bg-primario/10 text-primario"
                  : "text-texto-secundario hover:bg-fondo-hover hover:text-texto",
              )}
            >
              {enlace.icono}
              {enlace.etiqueta}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
