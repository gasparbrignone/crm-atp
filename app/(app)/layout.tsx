import { redirect } from "next/navigation";
import { MdSpaceDashboard, MdGroup, MdUploadFile, MdLogout } from "react-icons/md";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Sidebar, type EnlaceNav } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { tienePermiso } from "@/lib/permisos/permisos";
import { cerrarSesion } from "./actions";

// Los íconos se instancian acá (JSX ya renderizado), no se pasan como
// referencia de componente: un Server Component no puede pasarle una función
// a un Client Component, pero sí un elemento React ya construido.
const ENLACES_NAV: (EnlaceNav & { permiso: string })[] = [
  {
    href: "/dashboard",
    etiqueta: "Dashboard",
    icono: <MdSpaceDashboard size={18} />,
    permiso: "dashboard.ver_personal",
  },
  {
    href: "/personas",
    etiqueta: "Personas",
    icono: <MdGroup size={18} />,
    permiso: "personas.ver",
  },
  {
    href: "/importar",
    etiqueta: "Importar",
    icono: <MdUploadFile size={18} />,
    permiso: "importaciones.ejecutar",
  },
];

// Layout de las rutas autenticadas — ver /03-arquitectura.md sección 4.
// Sidebar en desktop / barra inferior en mobile, ver /19-ux-ui.md sección 5.
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
  ).filter((e): e is EnlaceNav & { permiso: string } => e !== null);

  return (
    <div className="flex min-h-full">
      <Sidebar enlaces={enlacesVisibles} />
      <div className="flex min-h-full flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-borde bg-fondo-superficie px-4 md:px-6">
          {usuario && (
            <span className="hidden text-sm text-texto-secundario sm:inline">
              {usuario.nombre} {usuario.apellido}
              <span className="ml-1.5 rounded-full bg-fondo-hover px-2 py-0.5 text-xs font-medium text-texto-secundario">
                {usuario.rol.nombre}
              </span>
            </span>
          )}
          <ThemeToggle />
          <form action={cerrarSesion}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="inline-flex h-11 w-11 items-center justify-center rounded-borde-chico text-texto-secundario transition-colors hover:bg-fondo-hover hover:text-texto"
            >
              <MdLogout size={20} />
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto bg-fondo p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <BottomNav enlaces={enlacesVisibles} />
    </div>
  );
}
