import {
  createModelContent,
  createUserContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  type Content,
} from "@google/genai";
import {
  obtenerClienteIA,
  MODELO_IA_LIVIANO,
  SIN_PENSAMIENTO,
  generarConReintentos,
} from "@/lib/ia/cliente-ia";
import { HERRAMIENTAS_CHATBOT, herramientasVisiblesPara } from "@/lib/ia/chatbot-herramientas";
import type { UsuarioConPermisos } from "@/lib/permisos/permisos";

// Chatbot conectado a la base de datos — /15-ia.md sección 7. El loop de
// tool-use en sí: el modelo decide qué herramienta acotada invocar (nunca
// genera SQL ni consultas libres), este código ejecuta esa herramienta ya
// filtrada por los permisos reales del usuario, y le devuelve el resultado
// al modelo para que redacte la respuesta final en lenguaje natural.

export interface MensajeHistorial {
  rol: "usuario" | "modelo";
  contenido: string;
}

export interface ConsultaEjecutada {
  herramienta: string;
  args: Record<string, unknown>;
  resultado: unknown;
}

export interface ResultadoChatbot {
  respuesta: string;
  consultasEjecutadas: ConsultaEjecutada[];
}

const MAX_ITERACIONES_TOOL_USE = 8;

const INSTRUCCION_SISTEMA = `Sos el asistente de datos del CRM de ATP, una agrupación estudiantil universitaria. Respondés preguntas en español sobre los datos del sistema (personas, actividades, participación, punteo, padrón) usando EXCLUSIVAMENTE las herramientas que tenés disponibles.

La mayoría de las preguntas interesantes combinan varias variables a la vez (ej. carrera + año + asistencia a un tipo de actividad + rango de fechas). Para eso:
- Preferí las herramientas generales que aceptan varios filtros combinados a la vez (\`buscar_personas\`, \`listar_participaciones\`) antes que asumir que una pregunta no se puede responder. \`listar_participaciones\` en particular cruza filtros de persona (carrera, año, estado de ficha) CON filtros de actividad/participación (tipo, nombre, fechas, estado) en una sola consulta — es la herramienta correcta para preguntas tipo "¿a qué actividades fueron las personas de tal carrera/año?".
- Si una pregunta tiene varias partes (ej. "¿cuántas personas de 2do año hay, y a qué actividades fueron?"), respondela en varios pasos: invocá una herramienta, mirá el resultado, e invocá otra si hace falta, antes de responder. No te limites a un solo llamado a herramienta por turno.
- \`buscar_personas\` también filtra por etiqueta y devuelve las etiquetas de cada persona de la muestra. \`comentarios_de_punteo_de_persona\` devuelve el contenido real de los comentarios (no solo un conteo) sobre una persona puntual — tu propio punteo siempre, el de otros usuarios solo si tenés permiso para verlo todo. \`historial_de_persona\` devuelve los cambios registrados sobre una persona (alta, ediciones, fusión).
- Si después de combinar bien los filtros disponibles la pregunta sigue sin poder responderse (el dato simplemente no existe en ninguna herramienta), recién ahí decilo explícitamente en vez de forzar una respuesta parcial o inventada.

Reglas estrictas:
- Nunca inventes un número o dato que no provenga de una herramienta ejecutada en esta conversación.
- Si la pregunta requiere datos a los que no tenés acceso (una herramienta no está disponible para vos), decilo explícitamente en vez de responder con un estimado o intentar rodear la restricción — por ejemplo, si te preguntan por el punteo de otro usuario y no tenés esa herramienta, respondé que no tenés permiso para ver esa información, no un número aproximado.
- Nunca asignes, sugieras ni infieras una clasificación de afinidad política, ideológica o electoral sobre ninguna persona. Trabajás sobre estructura y agregados estadísticos, nunca sobre juicio político.
- Sé directo y breve. Si el resultado de una herramienta ya responde la pregunta, no hace falta seguir invocando más herramientas.`;

function contenidoDesdeHistorial(historial: MensajeHistorial[]): Content[] {
  return historial.map((m) =>
    m.rol === "usuario" ? createUserContent(m.contenido) : createModelContent(m.contenido),
  );
}

export async function generarRespuestaChatbot(
  usuario: UsuarioConPermisos,
  historialPrevio: MensajeHistorial[],
  mensajeNuevo: string,
): Promise<ResultadoChatbot> {
  const herramientas = herramientasVisiblesPara(usuario);
  const porNombre = new Map(HERRAMIENTAS_CHATBOT.map((h) => [h.declaracion.name!, h]));
  const nombresVisibles = new Set(herramientas.map((h) => h.declaracion.name));

  const contents: Content[] = [
    ...contenidoDesdeHistorial(historialPrevio),
    createUserContent(mensajeNuevo),
  ];

  const consultasEjecutadas: ConsultaEjecutada[] = [];
  const cliente = obtenerClienteIA();

  for (let iteracion = 0; iteracion < MAX_ITERACIONES_TOOL_USE; iteracion++) {
    const respuesta = await generarConReintentos(() =>
      cliente.models.generateContent({
        model: MODELO_IA_LIVIANO,
        contents,
        config: {
          systemInstruction: INSTRUCCION_SISTEMA,
          maxOutputTokens: 1000,
          thinkingConfig: SIN_PENSAMIENTO,
          tools:
            herramientas.length > 0
              ? [{ functionDeclarations: herramientas.map((h) => h.declaracion) }]
              : undefined,
        },
      }),
    );

    const llamadas = respuesta.functionCalls;
    if (!llamadas || llamadas.length === 0) {
      return {
        respuesta: respuesta.text?.trim() || "No pude generar una respuesta. Probá reformular la pregunta.",
        consultasEjecutadas,
      };
    }

    // Se reinserta el Content del modelo tal cual vino de la respuesta (no
    // reconstruido con createModelContent/createPartFromFunctionCall) porque
    // los modelos vigentes de Gemini adjuntan un `thoughtSignature` a cada
    // parte de function call — si no se lo devuelve intacto en el turno
    // siguiente, la API rechaza la conversación entera con 400
    // "missing a thought_signature" (comprobado contra la cuenta real).
    const contenidoModelo = respuesta.candidates?.[0]?.content;
    if (contenidoModelo) {
      contents.push(contenidoModelo);
    } else {
      contents.push(
        createModelContent(llamadas.map((l) => createPartFromFunctionCall(l.name ?? "", l.args ?? {}))),
      );
    }

    const partesRespuesta = await Promise.all(
      llamadas.map(async (llamada) => {
        const nombre = llamada.name ?? "";
        const args = llamada.args ?? {};
        // Defensa en profundidad: aunque solo se declararon al modelo las
        // herramientas visibles para este usuario, no confiamos únicamente en
        // eso — se re-verifica acá que la herramienta invocada sigue siendo
        // una de las visibles antes de ejecutarla.
        const herramienta = nombresVisibles.has(nombre) ? porNombre.get(nombre) : undefined;

        let resultado: unknown;
        if (!herramienta) {
          resultado = { error: "No tenés permiso para acceder a esta información." };
        } else {
          try {
            resultado = await herramienta.ejecutar(usuario, args);
          } catch (e) {
            resultado = { error: e instanceof Error ? e.message : "Error al ejecutar la consulta." };
          }
        }

        consultasEjecutadas.push({ herramienta: nombre, args, resultado });
        return createPartFromFunctionResponse(llamada.id ?? nombre, nombre, { output: resultado });
      }),
    );

    contents.push(createUserContent(partesRespuesta));
  }

  return {
    respuesta:
      "La consulta requirió demasiados pasos y se cortó para evitar un uso excesivo. Probá con una pregunta más acotada.",
    consultasEjecutadas,
  };
}
