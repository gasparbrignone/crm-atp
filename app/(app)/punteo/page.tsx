import Link from "next/link";
import { requerirPermiso, tienePermiso } from "@/lib/permisos/permisos";
import { listarMiPunteo } from "@/lib/servicios/punteo.service";
import { Card } from "@/components/ui/Card";
import { BuscadorPuntearPersona } from "@/components/punteo/BuscadorPuntearPersona";
import {
  ETIQUETA_ESTADO_SEGUIMIENTO,
  COLOR_ESTADO_SEGUIMIENTO,
} from "@/lib/utils/punteo-labels";

// Vista de trabajo de punteo — /08-modulo-punteo-electoral.md sección 5.
// Mobile-first: lista de "mi punteo" + buscador para empezar con alguien
// nuevo, sin depender del buscador global (todavía no existe como módulo).
export default async function PunteoPage() {
  const usuario = await requerirPermiso("punteo.ver_propio");
  const puedeVerTodos = usuario.rol.permisos.some((rp) => rp.permiso.codigo === "punteo.ver_todos");

  const [miPunteo, puedeCrearPersona] = await Promise.all([
    listarMiPunteo({ usuarioId: usuario.id, puedeVerTodos }),
    tienePermiso("personas.crear"),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-texto">Mi punteo</h1>
        <p className="text-sm text-texto-secundario">
          Seguimiento territorial propio: a quién contactar, a quién reforzar, a quién ya se
          llegó.
        </p>
      </div>

      <BuscadorPuntearPersona puedeCrearPersona={puedeCrearPersona} />

      {miPunteo.length === 0 ? (
        <Card className="text-center text-sm text-texto-secundario">
          Todavía no punteaste a nadie. Buscá una persona arriba para empezar.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {miPunteo.map((p) => (
            <Link key={p.id} href={`/punteo/${p.personaId}`}>
              <Card
                padding="chico"
                className="flex items-center justify-between gap-3 transition-colors hover:bg-fondo-hover"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-texto">
                    {p.persona.apellido}, {p.persona.nombre}
                  </span>
                  <span className="text-xs text-texto-secundario">
                    {p._count.comentarios} comentario{p._count.comentarios === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.clasificacion && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        color: p.clasificacion.color ?? undefined,
                        backgroundColor: p.clasificacion.color ? `${p.clasificacion.color}1a` : undefined,
                      }}
                    >
                      {p.clasificacion.nombre}
                    </span>
                  )}
                  <span className={`text-xs font-medium ${COLOR_ESTADO_SEGUIMIENTO[p.estadoSeguimiento]}`}>
                    {ETIQUETA_ESTADO_SEGUIMIENTO[p.estadoSeguimiento]}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
