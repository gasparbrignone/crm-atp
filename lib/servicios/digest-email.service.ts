import { prisma } from "@/lib/prisma/client";

// Resumen por email — /13-notificaciones.md sección 4 y 5: "un digest
// periódico (diario o semanal) en lugar de un email por cada evento
// individual". Se envía vía la API HTTP de Resend (sin SDK adicional, un
// solo fetch) para no sumar una dependencia nueva a un envío tan simple.
//
// Deshabilitado por defecto y sin romper nada si falta configuración: el
// interruptor general (`email_notificaciones_activo` en ConfiguracionSistema)
// y la propia RESEND_API_KEY tienen que estar presentes para que se intente
// enviar algo. Esto es intencional — Resend requiere que alguien de ATP cree
// la cuenta y cargue la clave real, un paso que no se puede automatizar
// desde acá (ver PROMPT-CONTINUAR.md). Mientras tanto el canal in-app, que es
// el obligatorio según la sección 4, funciona igual sin esto.
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

async function emailNotificacionesActivo(): Promise<boolean> {
  const config = await prisma.configuracionSistema.findUnique({
    where: { clave: "email_notificaciones_activo" },
  });
  return config?.valor === "true";
}

function digestVencido(usuario: {
  frecuenciaDigestEmail: "diario" | "semanal";
  fechaUltimoDigestEmail: Date | null;
}): boolean {
  if (!usuario.fechaUltimoDigestEmail) return true;
  const diasTranscurridos =
    (Date.now() - usuario.fechaUltimoDigestEmail.getTime()) / MILISEGUNDOS_POR_DIA;
  return usuario.frecuenciaDigestEmail === "semanal" ? diasTranscurridos >= 7 : diasTranscurridos >= 1;
}

async function enviarEmail(destinatario: string, asunto: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[digest-email] RESEND_API_KEY no configurada — se omite el envío.");
    return false;
  }
  const remitente = process.env.RESEND_EMAIL_REMITENTE || "ATP CRM <onboarding@resend.dev>";

  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remitente, to: [destinatario], subject: asunto, html }),
    });
    if (!respuesta.ok) {
      console.error("[digest-email] Resend respondió con error:", respuesta.status, await respuesta.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[digest-email] fallo de red al enviar:", error);
    return false;
  }
}

function armarHtmlDigest(
  nombre: string,
  notificaciones: { titulo: string; mensaje: string }[],
  urlApp: string,
): string {
  const items = notificaciones
    .map((n) => `<li style="margin-bottom:12px"><strong>${n.titulo}</strong><br/>${n.mensaje}</li>`)
    .join("");
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2>Hola ${nombre},</h2>
      <p>Esto es lo que pasó en el CRM de ATP desde tu último resumen:</p>
      <ul style="padding-left:18px">${items}</ul>
      <p><a href="${urlApp}/notificaciones">Ver todo en el sistema →</a></p>
    </div>
  `;
}

// Corrida diaria única (ver notificaciones.service.ts, límite de cron de
// Vercel Hobby): evalúa a todos los usuarios con el digest activo y les
// manda el resumen si les corresponde según su frecuencia elegida.
export async function enviarDigestsEmailPendientes() {
  if (!(await emailNotificacionesActivo())) return { enviados: 0, evaluados: 0 };
  if (!process.env.RESEND_API_KEY) return { enviados: 0, evaluados: 0 };

  const urlApp = process.env.NEXT_PUBLIC_APP_URL || "https://crm-atp.vercel.app";

  const usuarios = await prisma.usuario.findMany({
    where: { estado: "activo", recibirDigestEmail: true },
    select: {
      id: true,
      nombre: true,
      email: true,
      frecuenciaDigestEmail: true,
      fechaUltimoDigestEmail: true,
    },
  });

  let enviados = 0;
  for (const usuario of usuarios) {
    if (!digestVencido(usuario)) continue;

    const notificaciones = await prisma.notificacion.findMany({
      where: {
        usuarioId: usuario.id,
        fechaCreacion: { gte: usuario.fechaUltimoDigestEmail ?? new Date(0) },
      },
      orderBy: { fechaCreacion: "desc" },
      take: 30,
      select: { titulo: true, mensaje: true },
    });

    // Sin novedades: no se manda un email vacío, pero tampoco se actualiza
    // fechaUltimoDigestEmail — así un usuario semanal sin nada nuevo no
    // reinicia su ventana de 7 días por las dudas de que aparezca algo mañana.
    if (notificaciones.length === 0) continue;

    const html = armarHtmlDigest(usuario.nombre, notificaciones, urlApp);
    const asunto =
      usuario.frecuenciaDigestEmail === "semanal"
        ? "Tu resumen semanal del CRM ATP"
        : "Tu resumen diario del CRM ATP";

    const ok = await enviarEmail(usuario.email, asunto, html);
    if (ok) {
      enviados++;
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { fechaUltimoDigestEmail: new Date() },
      });
    }
  }

  return { enviados, evaluados: usuarios.length };
}
