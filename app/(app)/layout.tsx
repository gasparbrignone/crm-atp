import { redirect } from "next/navigation";
import {
  MdSpaceDashboard,
  MdGroup,
  MdUploadFile,
  MdLogout,
  MdEvent,
  MdAdminPanelSettings,
  MdHowToVote,
} from "react-icons/md";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Sidebar, type EnlaceNav } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { obtenerUsuarioActual, tienePermiso } from "@/lib/permisos/permisos";
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
    href: "/actividades",
    etiqueta: "Actividades",
    icono: <MdEvent size={18} />,
    permiso: "actividades.ver",
  },
  {
    href: "/punteo",
    etiqueta: "Punteo",
    icono: <MdHowToVote size={18} />,
    permiso: "punteo.ver_propio",
  },
  {
    href: "/importar",
    etiqueta: "Importar",
    icono: <MdUploadFile size={18} />,
    permiso: "importaciones.ejecutar",
  },
  {
    href: "/usuarios",
    etiqueta: "Usuarios",
    icono: <MdAdminPanelSettings size={18} />,
    permiso: "usuarios.ver",
  },
];

// Layout de las rutas autenticadas — ver /03-arquitectura.md sección 4.
// Sidebar en desktop / barra inferior en mobile, ver /19-ux-ui.md sección 5.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // obtenerUsuarioActual() está memoizado con React cache() por request: esta
  // misma llamada (sesión + Usuario + Rol + permisos) se reutiliza acá y en
  // cada tienePermiso()/requerirPermiso() más abajo en el árbol (páginas),
  // sin repetir la verificación de sesión contra Supabase Auth ni la consulta
  // a Prisma varias veces en la misma carga de página.
  const usuario = await obtenerUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  const enlacesVisibles = (
    await Promise.all(
      ENLACES_NAV.map(async (enlace) => ((await tienePermiso(enlace.permiso)) ? enlace : null)),
    )
  ).filter((e): e is EnlaceNav & { permiso: string } => e !== null);

  return (
    <div className="flex min-h-full">
      <Sidebar enlaces={enlacesVisibles} />
      <div className="flex min-h-full flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-borde bg-fondo-superficie px-4 md:justify-end md:px-6">
          {/* Marca — visible solo en mobile, en desktop ya está en el Sidebar. */}
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-borde-chico bg-primario text-sm font-bold text-white">
              A
            </span>
            <span className="text-sm font-semibold text-texto">CRM ATP</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-texto-secundario sm:inline">
              {usuario.nombre} {usuario.apellido}
              <span className="ml-1.5 rounded-full bg-fondo-hover px-2 py-0.5 text-xs font-medium text-texto-secundario">
                {usuario.rol.nombre}
              </span>
            </span>
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
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-fondo p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <BottomNav enlaces={enlacesVisibles} />
    </div>
  );
}
