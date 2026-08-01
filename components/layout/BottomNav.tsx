"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { EnlaceNav } from "./Sidebar";

// Barra inferior — navegación principal en mobile, ver /19-ux-ui.md sección 5
// (mobile-first para las tareas de campo). Área táctil >= 44x44px, sección 9.
export function BottomNav({ enlaces }: { enlaces: EnlaceNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-borde bg-fondo-superficie/95 backdrop-blur md:hidden">
      {enlaces.map((enlace) => {
        const activo = pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
        const Icono = enlace.icono;
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
              activo ? "text-primario" : "text-texto-secundario",
            )}
          >
            <Icono size={20} />
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
