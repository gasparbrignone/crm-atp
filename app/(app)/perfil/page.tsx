import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/permisos/permisos";
import { Card } from "@/components/ui/Card";
import { FormularioPerfil } from "./FormularioPerfil";

// Perfil del propio usuario — /13-notificaciones.md sección 5: "desde su
// perfil" es donde se activa/desactiva el resumen por email y se elige su
// frecuencia. También permite editar los datos propios ya soportados por
// actualizarDatosUsuario() (nombre, apellido, teléfono), sin tocar el rol.
export default async function PerfilPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-texto">Mi perfil</h1>
        <p className="text-sm text-texto-secundario">{usuario.email}</p>
      </div>
      <Card>
        <FormularioPerfil usuario={usuario} />
      </Card>
    </div>
  );
}
