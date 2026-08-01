import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cerrarSesion } from "./actions";

// Layout de las rutas autenticadas — ver /03-arquitectura.md sección 4.
// La navegación completa (sidebar de Personas/Actividades/Punteo/Buscador,
// ver /19-ux-ui.md sección 5) se agrega recién cuando esos módulos existan
// (Fase 1 en adelante); por ahora este layout solo resuelve sesión + logout.
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-borde px-4 py-3">
        <span className="text-sm font-semibold text-texto">CRM ATP</span>
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
