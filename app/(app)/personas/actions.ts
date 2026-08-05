"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/permisos/permisos";
import {
  crearPersona,
  actualizarPersona,
  archivarPersona,
  restaurarPersona,
  obtenerPersonasPorIds,
  agregarEtiquetaAPersona,
  quitarEtiquetaDePersona,
  obtenerOCrearEtiquetaPorNombre,
  asignarEtiquetaMasivo,
  DniDuplicadoError,
} from "@/lib/servicios/personas.service";
import { registrarCambio } from "@/lib/servicios/auditoria.service";
import {
  buscarPersonaCoincidente,
  obtenerUmbralConfianzaDuplicados,
} from "@/lib/ia/deteccion-duplicados";
import { personaFormSchema } from "@/lib/validaciones/persona.validation";
import { registrarVeredictoIdentidad } from "@/lib/servicios/veredictos-identidad.service";

export interface CandidatoDuplicadoVista {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  carrera: string | null;
}

export interface EstadoFormularioPersona {
  error?: string;
  personaExistenteId?: string;
  erroresCampo?: Record<string, string>;
  candidatos?: CandidatoDuplicadoVista[];
  motivoSugerencia?: string;
}

function datosDeFormulario(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? ""),
    apellido: String(formData.get("apellido") ?? ""),
    dni: String(formData.get("dni") ?? ""),
    legajo: String(formData.get("legajo") ?? ""),
    carreraId: String(formData.get("carreraId") ?? ""),
    anio: String(formData.get("anio") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    email: String(formData.get("email") ?? ""),
    instagram: String(formData.get("instagram") ?? ""),
    observacionesGenerales: String(formData.get("observacionesGenerales") ?? ""),
  };
}

// Alta manual con verificación de duplicados — /05-modulo-personas.md sección
// 3.2. El DNI exacto sigue siendo un bloqueo duro (RN de la sección 9, ya
// resuelto por crearPersona() más abajo, que lanza DniDuplicadoError): ahí la
// coincidencia es una certeza, no una sugerencia, así que no pasa por este
// flujo de comparación. Cualquier otra señal (teléfono idéntico, nombre muy
// similar) pasa por buscarPersonaCoincidente() y, si hay candidato(s), el
// formulario se resuelve en dos pasos: primero se muestra la sugerencia sin
// crear nada, después el usuario confirma "es distinta" (se crea igual y
// queda registrado el descarte) o "es la misma" (se crea la ficha nueva y se
// redirige al flujo de fusión de la sección 8.2 contra el candidato elegido).
export async function crearPersonaAction(
  _estadoPrevio: EstadoFormularioPersona,
  formData: FormData,
): Promise<EstadoFormularioPersona> {
  const usuario = await requerirPermiso("personas.crear");

  const parsed = personaFormSchema.safeParse(datosDeFormulario(formData));
  if (!parsed.success) {
    const erroresCampo: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      erroresCampo[String(issue.path[0])] = issue.message;
    }
    return { error: "Revisá los campos marcados.", erroresCampo };
  }

  const accionDuplicado = String(formData.get("accionDuplicado") ?? "");
  const yaResueltoPorElUsuario = accionDuplicado === "confirmar_distinta" || accionDuplicado === "fusionar";
  const personaCandidataId = String(formData.get("personaCandidataId") ?? "") || undefined;

  if (!yaResueltoPorElUsuario) {
    const umbral = await obtenerUmbralConfianzaDuplicados();
    // Si la IA falla acá (cuota agotada, error de red), antes esto tiraba
    // abajo toda la Server Action con un error crudo — el usuario ni podía
    // cargar una persona nueva mientras la IA estuviera caída (bug real
    // encontrado en auditoría 2026-08-03, contradice /CLAUDE.md sección 4:
    // "los errores no controlados... se traducen a un mensaje entendible").
    // La detección de duplicados asiste, no bloquea (/15-ia.md sección 2.3):
    // si no se puede consultar, se sigue de largo sin sugerencia en vez de
    // impedir el alta — el DNI duplicado exacto sigue protegido igual más
    // abajo por crearPersona(), que no depende de la IA.
    let resultado: Awaited<ReturnType<typeof buscarPersonaCoincidente>> | null = null;
    try {
      resultado = await buscarPersonaCoincidente(
        {
          nombre: parsed.data.nombre,
          apellido: parsed.data.apellido,
          telefono: parsed.data.telefono || undefined,
          email: parsed.data.email || undefined,
          dni: parsed.data.dni || undefined,
        },
        umbral,
      );
    } catch {
      resultado = null;
    }

    // confianza === 1 solo puede venir de un DNI idéntico — ese caso se deja
    // pasar a crearPersona() para el bloqueo duro existente (DniDuplicadoError),
    // no a la sugerencia editable.
    if (resultado?.tipo === "coincidencia" && resultado.confianza < 1) {
      const [candidato] = await obtenerPersonasPorIds([resultado.personaId]);
      if (candidato) {
        return {
          motivoSugerencia: resultado.motivo,
          candidatos: [
            {
              id: candidato.id,
              nombre: candidato.nombre,
              apellido: candidato.apellido,
              dni: candidato.dni,
              telefono: candidato.telefonos.find((t) => t.esPrincipal)?.numero ?? null,
              email: candidato.emails.find((e) => e.esPrincipal)?.email ?? null,
              carrera: candidato.carrera?.nombre ?? null,
            },
          ],
        };
      }
    }

    if (resultado?.tipo === "ambiguo" && resultado.candidatos.length > 0) {
      const idsCandidatos = resultado.candidatos.slice(0, 5).map((c) => c.id);
      const candidatosCompletos = await obtenerPersonasPorIds(idsCandidatos);
      return {
        motivoSugerencia: resultado.motivo,
        candidatos: candidatosCompletos.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          apellido: c.apellido,
          dni: c.dni,
          telefono: c.telefonos.find((t) => t.esPrincipal)?.numero ?? null,
          email: c.emails.find((e) => e.esPrincipal)?.email ?? null,
          carrera: c.carrera?.nombre ?? null,
        })),
      };
    }
  }

  const etiquetaIdsExistentes = formData.getAll("etiquetaIds").map(String).filter(Boolean);
  const etiquetasNuevasNombres = String(formData.get("etiquetasNuevasNombres") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const etiquetasNuevas = await Promise.all(
    etiquetasNuevasNombres.map((nombre) => obtenerOCrearEtiquetaPorNombre(nombre, usuario.id)),
  );
  const etiquetaIds = Array.from(
    new Set([...etiquetaIdsExistentes, ...etiquetasNuevas.filter(Boolean).map((e) => e!.id)]),
  );

  let personaId: string;
  try {
    const persona = await crearPersona(parsed.data, usuario.id, etiquetaIds);
    personaId = persona.id;
  } catch (error) {
    if (error instanceof DniDuplicadoError) {
      return { error: error.message, personaExistenteId: error.personaExistente.id };
    }
    throw error;
  }

  if (accionDuplicado === "confirmar_distinta" && personaCandidataId) {
    await registrarCambio({
      entidad: "Persona",
      entidadId: personaId,
      accion: "otro",
      usuarioId: usuario.id,
      metadata: {
        proceso: "deteccion_duplicados_alta",
        candidatoDescartadoId: personaCandidataId,
        resultado: "confirmado_distinta",
      },
    });

    // Veredicto humano — /PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección
    // 3.9. No bloquea el alta ya confirmada si falla.
    try {
      const [candidatoDescartado] = await obtenerPersonasPorIds([personaCandidataId]);
      if (candidatoDescartado) {
        await registrarVeredictoIdentidad({
          nombreObjetivo: `${parsed.data.nombre} ${parsed.data.apellido}`,
          candidatoNombreCompleto: `${candidatoDescartado.nombre} ${candidatoDescartado.apellido}`,
          candidatoId: candidatoDescartado.id,
          decision: "distinta_persona",
          contexto: "alta_manual",
          usuarioId: usuario.id,
        });
      }
    } catch {
      // No interrumpe el alta ya confirmada.
    }
  }

  revalidatePath("/personas");

  if (accionDuplicado === "fusionar" && personaCandidataId) {
    redirect(`/personas/fusionar/${personaCandidataId}/${personaId}`);
  }

  redirect(`/personas/${personaId}`);
}

export async function actualizarCampoPersonaAction(
  personaId: string,
  campo: string,
  valor: string,
): Promise<{ error?: string }> {
  const usuario = await requerirPermiso("personas.editar");

  const parsed = personaFormSchema.partial().safeParse({ [campo]: valor });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valor inválido." };
  }

  try {
    await actualizarPersona(personaId, parsed.data, usuario.id);
  } catch (error) {
    if (error instanceof DniDuplicadoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
  return {};
}

export async function archivarPersonaAction(personaId: string) {
  const usuario = await requerirPermiso("personas.archivar");
  await archivarPersona(personaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
}

export async function restaurarPersonaAction(personaId: string) {
  const usuario = await requerirPermiso("personas.archivar");
  await restaurarPersona(personaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
}

// Etiquetado — /05-modulo-personas.md sección 7: mismo permiso que edición
// de campos, sin permiso adicional para crear una etiqueta nueva desde el
// selector (la sección lo pide explícito, para no friccionar el uso diario).
export async function agregarEtiquetaAction(personaId: string, etiquetaId: string) {
  const usuario = await requerirPermiso("personas.editar");
  await agregarEtiquetaAPersona(personaId, etiquetaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
}

export async function quitarEtiquetaAction(personaId: string, etiquetaId: string) {
  const usuario = await requerirPermiso("personas.editar");
  await quitarEtiquetaDePersona(personaId, etiquetaId, usuario.id);
  revalidatePath(`/personas/${personaId}`);
}

export async function crearYAgregarEtiquetaAction(personaId: string, nombre: string) {
  const usuario = await requerirPermiso("personas.editar");
  const etiqueta = await obtenerOCrearEtiquetaPorNombre(nombre, usuario.id);
  if (!etiqueta) return;
  await agregarEtiquetaAPersona(personaId, etiqueta.id, usuario.id);
  revalidatePath(`/personas/${personaId}`);
}

// Acción masiva del listado (/05-modulo-personas.md sección 6.4).
export async function asignarEtiquetaMasivoAction(personaIds: string[], etiquetaId: string) {
  const usuario = await requerirPermiso("personas.editar");
  const resultado = await asignarEtiquetaMasivo(personaIds, etiquetaId, usuario.id);
  revalidatePath("/personas");
  return resultado;
}
