import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { tienePermiso } from "@/lib/permisos/permisos";
import { cerrarSesion } from "./actions";

const ENLACES_NAV = [
  { href: "/dashboard", etiqueta: "Dashboard", permiso: "dashboard.ver_personal" },
  { href: "/personas", etiqueta: "Personas", permiso: "personas.ver" },
  { href: "/importar", etiqueta: "Importar", permiso: "importaciones.ejecutar" },
] as const;

// Layout de las rutas autenticadas — ver /03-arquitectura.md sección 4.
// La navegación completa (sidebar mobile/desktop de /19-ux-ui.md sección 5)
// se arma módulo por módulo a medida que cada uno exista; por ahora es una
// lista de links simple en el header, filtrada por permiso.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: user.id },
    include: { rol: true },
  });

  const enlacesVisibles = (
    await Promise.all(
      ENLACES_NAV.map(async (enlace) => ((await tienePermiso(enlace.permiso)) ? enlace : null)),
    )
  ).filter((e): e is (typeof ENLACES_NAV)[number] => e !== null);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-texto">CRM ATP</span>
          <nav className="flex gap-3">
            {enlacesVisibles.map((enlace) => (
              <Link
                key={enlace.href}
                href={enlace.href}
                className="text-sm text-texto-secundario hover:text-texto"
              >
                {enlace.etiqueta}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {usuario && (
            <span className="text-sm text-texto-secundario">
              {usuario.nombre} {usuario.apellido} · {usuario.rol.nombre}
            </span>
          )}
          <ThemeToggle />
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="min-h-11 rounded-borde px-3 text-sm font-semibold text-texto hover:bg-borde/40"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
